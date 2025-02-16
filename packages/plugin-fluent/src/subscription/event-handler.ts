import { IAgentRuntime, Memory, elizaLogger } from "@elizaos/core";
import {
    Log,
    PublicClient,
    parseEventLogs,
    decodeEventLog,
    parseAbi,
    AbiEvent,
} from "viem";
import { contractRoomId, eventId } from "../utils";
import {
    ContentType,
    EventConfig,
    EventContent,
    IEventHandler,
    SubscriptionError,
    SubscriptionErrorType,
} from "./types";

export class EventHandler implements IEventHandler {
    constructor(
        private readonly config: EventConfig,
        private readonly runtime: IAgentRuntime,
        private readonly client: PublicClient
    ) {}

    async handle(log: Log): Promise<void> {
        try {
            const chainId = await this.client.getChainId();
            elizaLogger.info("Handling event", {
                config: this.config,
                blockNumber: log.blockNumber?.toString(),
                transactionHash: log.transactionHash,
            });
            const parsed = parseEventLogs({
                abi: [this.config.signature],
                logs: [log],
            })[0];
            if (!parsed) {
                throw new SubscriptionError(
                    "Failed to parse event log",
                    SubscriptionErrorType.DECODE,
                    { log }
                );
            }

            const decoded = decodeEventLog({
                abi: [this.config.signature],
                data: parsed.data,
                topics: parsed.topics || [],
            });
            if (!decoded) {
                throw new SubscriptionError(
                    "Failed to decode event log",
                    SubscriptionErrorType.DECODE,
                    { log }
                );
            }

            const memory = await this.createMemory(parsed, decoded, chainId);

            await this.processMemory(memory);
        } catch (error) {
            elizaLogger.error("Failed to handle event:", {
                error,
                config: this.config,
                blockNumber: log.blockNumber?.toString(),
                transactionHash: log.transactionHash,
            });

            if (
                error.message?.includes("filter not found") ||
                error.message?.includes("network error")
            ) {
                throw error;
            }
        }
    }

    private async createMemory(
        parsed: Log,
        decoded: any,
        chainId: number
    ): Promise<Memory> {
        elizaLogger.info("Creating memory", {
            config: this.config,
            blockNumber: parsed.blockNumber,
            transactionHash: parsed.transactionHash,
            decoded,
            parsed,
        });

        const eventContent: EventContent = {
            type: ContentType.EVENT,
            id: {
                chainId,
                blockNumber: Number(parsed.blockNumber),
                transactionHash: parsed.transactionHash,
                logIndex: parsed.logIndex,
            },
            config: this.config,
            args: decoded.args,
            action: decoded.eventName,
            raw: parsed,
            text: `New Event ${decoded.eventName} from ${
                this.config.contractAddress
            }: ${JSON.stringify(decoded.args)}`,
        };

        return {
            id: eventId(eventContent.id),
            userId: this.runtime.agentId,
            agentId: this.runtime.agentId,
            roomId: contractRoomId(chainId, this.config.contractAddress),
            content: eventContent,
            createdAt: Date.now(),
        };
    }

    private async processMemory(memory: Memory): Promise<void> {
        const content = memory.content as EventContent;

        await this.runtime.messageManager.addEmbeddingToMemory(memory);
        await this.runtime.messageManager.createMemory(memory);

        const state = await this.runtime.composeState(memory, {
            chainId: content.id.chainId,
            contract: content.config.contractAddress,
            event: content.config.signature,
            agentName: this.runtime.character?.name,
        });

        await Promise.all([
            this.runtime.processActions(memory, [], state),
            this.runtime.evaluate(memory, state, true),
        ]);
    }
}
