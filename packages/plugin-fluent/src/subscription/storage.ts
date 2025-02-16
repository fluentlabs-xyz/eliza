import { elizaLogger, IAgentRuntime } from "@elizaos/core";
import {
    SubscriptionId,
    ISubscriptionStorage,
    SubscriptionState,
    SubscriptionError,
    SubscriptionErrorType,
} from "./types";
import { contractRoomId, subscriptionId } from "../utils";

export class SubscriptionStorage implements ISubscriptionStorage {
    constructor(private runtime: IAgentRuntime) {
        elizaLogger.info("Initializing subscription storage");
    }

    async set(state: SubscriptionState): Promise<void> {
        try {
            elizaLogger.debug("Saving subscription state", {
                chainId: state.chainId,
                config: state.config,
                lastBlock: state.lastBlock,
                status: state.status,
            });
            const roomId = contractRoomId(
                state.chainId,
                state.config.contractAddress
            );


            await this.runtime.ensureRoomExists(roomId);

            await this.runtime.messageManager.createMemory(
                {
                    id: subscriptionId({
                        chainId: state.chainId,
                        config: state.config,
                    }),
                    userId: this.runtime.agentId,
                    agentId: this.runtime.agentId,
                    roomId,
                    content: { text: "", state },
                    createdAt: Date.now(),
                },
                true // Overwrite if exists
            );
        } catch (error) {
            throw new SubscriptionError(
                "Failed to save subscription state",
                SubscriptionErrorType.STORAGE,
                error
            );
        }
    }

    async get(id: SubscriptionId): Promise<SubscriptionState | null> {
        try {
            const memory = await this.runtime.messageManager.getMemoryById(
                subscriptionId(id)
            );
            return memory?.content as unknown as SubscriptionState;
        } catch (error) {
            throw new SubscriptionError(
                "Failed to get subscription state",
                SubscriptionErrorType.STORAGE,
                error
            );
        }
    }

    async delete(id: SubscriptionId): Promise<void> {
        try {
            await this.runtime.messageManager.removeMemory(subscriptionId(id));
        } catch (error) {
            throw new SubscriptionError(
                "Failed to delete subscription state",
                SubscriptionErrorType.STORAGE,
                error
            );
        }
    }
}
