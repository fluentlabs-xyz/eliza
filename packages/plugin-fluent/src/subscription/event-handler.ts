import { IAgentRuntime, Memory, elizaLogger } from "@elizaos/core";
import {
    Log,
    PublicClient,
    parseEventLogs,
    parseAbi,
    type AbiEvent,
} from "viem";
import { contractRoomId, eventId, normalizeEventArgs } from "../utils";
import {
    ContentType,
    EventConfig,
    EventContent,
    IEventHandler,
    SubscriptionError,
    SubscriptionErrorType,
} from "./types";

export class EventHandler implements IEventHandler {
    private readonly eventAbi: AbiEvent;

    constructor(
        private readonly config: EventConfig,
        private readonly runtime: IAgentRuntime,
        private readonly client: PublicClient
    ) {
        this.eventAbi = parseAbi([this.config.signature])[0] as AbiEvent;
    }

    async handle(log: Log): Promise<void> {
        try {
            const chainId = await this.client.getChainId();

            elizaLogger.info("Handling event", {
                config: this.config.signature,
                blockNumber: log.blockNumber?.toString(),
                transactionHash: log.transactionHash,
            });

            const parsedLogs = parseEventLogs({
                abi: [this.eventAbi],
                logs: [log],
                strict: true,
            });

            if (!parsedLogs.length) {
                throw new SubscriptionError(
                    "Failed to parse event log",
                    SubscriptionErrorType.DECODE,
                    { log }
                );
            }

            const parsedEvent = parsedLogs[0];
            elizaLogger.info("Parsed event", {
                eventName: parsedEvent.eventName,
                blockNumber: parsedEvent.blockNumber,
                transactionHash: parsedEvent.transactionHash,
            });

            const memory = await this.createMemory(parsedEvent, chainId);
            elizaLogger.debug("Created memory", {
                eventName: parsedEvent.eventName,
                blockNumber: log.blockNumber?.toString(),
                transactionHash: log.transactionHash,
            });
            await this.processMemory(memory);
        } catch (error) {
            elizaLogger.error("Failed to handle event:", {
                error:
                    error instanceof Error
                        ? {
                              message: error.message,
                              stack: error.stack,
                              ...error,
                          }
                        : error,
                config: this.config,
                blockNumber: log.blockNumber?.toString(),
                transactionHash: log.transactionHash,
                logData: log.data,
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
        event: Log & { eventName: string; args: Record<string, any> },
        chainId: number
    ): Promise<Memory> {
        try {
            const normalizedArgs = normalizeEventArgs(event.args);
            const normalizedEvent = normalizeEventArgs(event);

            const eventContent: EventContent = {
                type: ContentType.EVENT,
                id: {
                    chainId: Number(chainId),
                    blockNumber: Number(event.blockNumber),
                    transactionHash: event.transactionHash,
                    logIndex: Number(event.logIndex),
                },
                config: this.config,
                args: normalizedArgs,
                action: event.eventName,
                raw: normalizedEvent,
                text: `Event ${event.eventName} from ${
                    this.config.contractAddress
                }: ${Object.entries(normalizedArgs)
                    .map(([key, value]) => `${key}=${value}`)
                    .join(", ")}`,
            };

            return {
                id: eventId(eventContent.id),
                userId: this.runtime.agentId,
                agentId: this.runtime.agentId,
                roomId: contractRoomId(chainId, this.config.contractAddress),
                content: eventContent,
                createdAt: Date.now(),
            };
        } catch (error) {
            elizaLogger.error("Failed to create memory:", {
                error:
                    error instanceof Error
                        ? {
                              message: error.message,
                              stack: error.stack,
                              name: error.name,
                          }
                        : error,
                eventData: {
                    args: event.args,
                    blockNumber: event.blockNumber?.toString(),
                    logIndex: event.logIndex?.toString(),
                },
            });
            throw error;
        }
    }

    private async processMemory(memory: Memory): Promise<void> {
        const content = memory.content as EventContent;

        await this.runtime.messageManager.createMemory(memory);

        // Создаем состояние
        const state = await this.runtime.composeState(memory, {
            chainId: content.id.chainId,
            contract: content.config.contractAddress,
            event: content.config.signature,
            agentName: this.runtime.character?.name,
        });

        // Обрабатываем действия и оцениваем
        await Promise.all([
            this.runtime.processActions(memory, [memory], state),
            this.runtime.evaluate(memory, state, true),
        ]);
    }
}
