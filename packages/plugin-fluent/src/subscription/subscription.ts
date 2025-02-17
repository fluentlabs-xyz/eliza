import { AbiEvent, parseAbi, PublicClient, Log } from "viem";
import { elizaLogger, IAgentRuntime } from "@elizaos/core";
import {
    EventConfig,
    ISubscription,
    ISubscriptionStorage,
    SubscriptionState,
    SubscriptionStatus,
    SubscriptionError,
    SubscriptionErrorType,
    StartOptions,
} from "./types";
import { EventHandler } from "./event-handler";

const BATCH_SIZE = 1000n; // Number of blocks per batch

interface BatchRange {
    from: bigint;
    to: bigint;
}

export class Subscription implements ISubscription {
    private unwatch?: () => void;
    private _state: SubscriptionState;
    private readonly handler: EventHandler;
    private readonly eventAbi: AbiEvent;

    constructor(
        private readonly client: PublicClient,
        private readonly config: EventConfig,
        private readonly storage: ISubscriptionStorage,
        private readonly runtime: IAgentRuntime
    ) {
        this.handler = new EventHandler(config, runtime, client);
        this.eventAbi = parseAbi([this.config.signature])[0] as AbiEvent;
        this._state = this.createInitialState(config);
    }

    get state(): SubscriptionState {
        return this._state;
    }

    private createInitialState(config: EventConfig): SubscriptionState {
        return {
            chainId: 0,
            config,
            lastBlock: 0,
            status: SubscriptionStatus.ERROR,
            stats: {
                startedAt: Date.now(),
                processedBlocks: 0,
                processedEvents: 0,
                errors: 0,
            },
        };
    }

    async initialize(): Promise<void> {
        try {
            const [chainId, currentBlock, savedState] = await Promise.all([
                this.client.getChainId(),
                this.getCurrentBlock(),
                this.loadSavedState(),
            ]);

            this._state.chainId = chainId;
            if (savedState) {
                this._state = { ...savedState, chainId };
            }

            await this.updateState(SubscriptionStatus.INITIALIZED);
        } catch (error) {
            await this.handleError(
                error,
                "Failed to initialize subscription",
                SubscriptionErrorType.UNKNOWN
            );
        }
    }

    async start(options?: StartOptions): Promise<void> {
        elizaLogger.info("Starting subscription", {
            config: this.config,
            options,
        });

        try {
            const currentBlock = await this.getCurrentBlock();

            let startBlock: bigint;
            if (options?.fromNow) {
                startBlock = currentBlock;
                this._state.lastBlock = Number(currentBlock);
            } else if (options?.fromBlock !== undefined) {
                startBlock = options.fromBlock;
            } else if (this._state.lastBlock > 0) {
                startBlock = BigInt(this._state.lastBlock);
            } else {
                startBlock = currentBlock;
            }

            if (startBlock < currentBlock && !options?.fromNow) {
                await this.syncFromBlock(startBlock, currentBlock);
            }

            this.startListening(currentBlock + 1n);
            await this.updateState(SubscriptionStatus.RUNNING);
        } catch (error) {
            await this.handleError(error, "Failed to start subscription");
        }
    }

    async stop(): Promise<void> {
        try {
            this.unwatch?.();
            await this.updateState(SubscriptionStatus.STOPPED);
            await this.storage.delete({
                chainId: this._state.chainId,
                config: this.config,
            });
        } catch (error) {
            throw this.wrapError(
                error,
                "Failed to stop subscription",
                SubscriptionErrorType.STORAGE
            );
        }
    }

    private async syncFromBlock(
        fromBlock: bigint,
        toBlock: bigint
    ): Promise<void> {
        elizaLogger.info("syncFromBlock", {
            fromBlock: fromBlock.toString(),
            toBlock: toBlock.toString(),
        });
        await this.updateState(SubscriptionStatus.SYNCING);
        let currentBlock = fromBlock;

        while (currentBlock <= toBlock) {
            const batch = this.getBatchRange(currentBlock, toBlock);

            try {
                elizaLogger.debug("Fetching logs batch", {
                    ...batch,
                    config: this.config,
                });

                const batchLogs = await this.client.getLogs({
                    address: this.config.contractAddress,
                    event: this.eventAbi,
                    args: this.config.filters,
                    fromBlock: batch.from,
                    toBlock: batch.to,
                });

                // Process logs immediately after fetching
                await this.processLogs(batchLogs);

                // Update stats and lastBlock
                this._state.stats.processedBlocks += Number(
                    batch.to - batch.from + 1n
                );
                this._state.lastBlock = Number(batch.to);
                await this.saveState();
            } catch (error) {
                elizaLogger.error("Failed to fetch logs batch:", {
                    error,
                    ...batch,
                    config: this.config,
                });
                throw this.wrapError(error, "Failed to fetch logs batch");
            }

            currentBlock = batch.to + 1n;
        }
    }

    private startListening(fromBlock: bigint): void {
        try {
            elizaLogger.debug("Starting to listen from block:", {
                fromBlock: fromBlock.toString(),
                config: this.config,
            });

            this.unwatch = this.client.watchContractEvent({
                address: this.config.contractAddress,
                abi: [this.eventAbi],
                eventName: this.eventAbi.name,
                args: this.config.filters,
                fromBlock,
                onLogs: (logs) => this.processLogs(logs),
                onError: (error) => this.handleSubscriptionError(error),
            });

            elizaLogger.info("Listening started successfully", {
                config: this.config,
            });
        } catch (error) {
            elizaLogger.error("Failed to start listening:", {
                error,
                config: this.config,
            });
            throw this.wrapError(error, "Failed to start event subscription");
        }
    }

    private async processLogs(logs: Log[]): Promise<void> {
        for (const log of logs) {
            try {
                await this.handler.handle(log);
                this._state.stats.processedEvents++;
                this._state.stats.lastEventAt = Date.now();
                this._state.lastBlock = Number(log.blockNumber);
            } catch (error) {
                elizaLogger.error("Failed to handle log:", {
                    error,
                    config: this.config,
                    blockNumber: log.blockNumber,
                });
                this._state.stats.errors++;
            }
        }
        await this.saveState();
    }

    private async handleSubscriptionError(error: Error): Promise<void> {
        elizaLogger.error("Subscription error occurred:", {
            error: error.message,
            config: this.config,
        });

        this._state.stats.errors++;
        await this.saveState();

        await this.reconnect();
    }

    async reconnect(): Promise<void> {
        try {
            elizaLogger.info("Attempting to reconnect...", {
                config: this.config,
            });

            this.unwatch?.();
            const currentBlock = await this.getCurrentBlock();

            if (this._state.lastBlock < currentBlock) {
                elizaLogger.debug("Syncing missed blocks", {
                    fromBlock: this._state.lastBlock.toString(),
                    toBlock: currentBlock.toString(),
                    config: this.config,
                });

                await this.syncFromBlock(
                    BigInt(this._state.lastBlock),
                    currentBlock
                );
            }

            this.startListening(currentBlock + 1n);
            await this.updateState(SubscriptionStatus.RUNNING);

            elizaLogger.info("Reconnected successfully", {
                config: this.config,
            });
        } catch (error) {
            elizaLogger.error("Reconnection failed:", {
                error,
                config: this.config,
            });
            await this.handleError(error, "Failed to reconnect");
        }
    }

    private getBatchRange(currentBlock: bigint, endBlock: bigint): BatchRange {
        const to = currentBlock + BATCH_SIZE - 1n;
        return {
            from: currentBlock,
            to: to > endBlock ? endBlock : to,
        };
    }

    private async loadSavedState(): Promise<SubscriptionState | null> {
        try {
            const state = await this.storage.get({
                chainId: this._state.chainId,
                config: this.config,
            });

            if (state) {
                elizaLogger.debug("Loaded saved state:", {
                    chainId: state.chainId,
                    config: state.config,
                    lastBlock: state.lastBlock.toString(),
                    status: state.status,
                });
            }

            return state ? state : null;
        } catch (error) {
            elizaLogger.error("Failed to load saved state:", {
                error,
                config: this.config,
            });
            throw error instanceof Error ? error : new Error(String(error));
        }
    }

    private async getCurrentBlock(): Promise<bigint> {
        try {
            return await this.client.getBlockNumber();
        } catch (error) {
            throw error instanceof Error ? error : new Error(String(error));
        }
    }

    private async updateState(status: SubscriptionStatus): Promise<void> {
        this._state.status = status;
        await this.saveState();
    }

    private async saveState(): Promise<void> {
        try {
            elizaLogger.debug("Saving subscription state:", {
                chainId: this._state.chainId,
                config: this.config,
                lastBlock: this._state.lastBlock.toString(),
                status: this._state.status,
            });

            await this.storage.set(this._state);
        } catch (error) {
            elizaLogger.error("Failed to save state:", {
                error,
                config: this.config,
                lastBlock: this._state.lastBlock,
            });
            throw this.wrapError(
                error,
                "Failed to save state",
                SubscriptionErrorType.STORAGE
            );
        }
    }

    private async handleError(
        error: unknown,
        message: string,
        type: SubscriptionErrorType = SubscriptionErrorType.NETWORK
    ): Promise<never> {
        this._state.stats.errors++;
        await this.updateState(SubscriptionStatus.ERROR);
        throw this.wrapError(error, message, type);
    }

    private wrapError(
        error: unknown,
        message: string,
        type: SubscriptionErrorType = SubscriptionErrorType.NETWORK
    ): SubscriptionError {
        if (error instanceof SubscriptionError) {
            return new SubscriptionError(
                `${message}: ${error.message}`,
                error.type,
                error.details
            );
        }
        return new SubscriptionError(message, type, error);
    }
}
