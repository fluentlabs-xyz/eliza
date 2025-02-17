import { describe, it, expect, beforeEach, vi } from "vitest";
import { Subscription } from "../src/subscription/subscription";
import { GetLogsParameters, type Log } from "viem";
import { ISubscriptionStorage, SubscriptionStatus } from "../src";
import {
    createMockClient,
    createEventConfig,
    createMockRuntime,
    createMockLog,
} from "./mocks/test-utils";

describe("Subscription", () => {
    let mockClient: ReturnType<typeof createMockClient>;
    let mockStorage: ISubscriptionStorage;
    let mockRuntime: ReturnType<typeof createMockRuntime>;
    let subscription: Subscription;
    let onLogsCallback: (logs: Log[]) => Promise<void>;
    let onErrorCallback: (error: Error) => Promise<void>;

    beforeEach(() => {
        // Create mock client with vitest mock functions
        mockClient = {
            ...createMockClient(),
            watchContractEvent: vi
                .fn()
                .mockImplementation(({ onLogs, onError }) => {
                    onLogsCallback = onLogs;
                    onErrorCallback = onError;
                    return () => {};
                }),
        };

        // Create mock storage
        mockStorage = {
            set: vi.fn().mockResolvedValue(undefined),
            get: vi.fn().mockResolvedValue(null),
            delete: vi.fn().mockResolvedValue(undefined),
        };

        // Create mock runtime
        mockRuntime = createMockRuntime();

        // Create test config
        const config = createEventConfig();

        // Create subscription
        subscription = new Subscription(
            mockClient,
            config,
            mockStorage,
            mockRuntime
        );
    });

    it("should initialize with correct state", async () => {
        await subscription.initialize();

        expect(mockClient.getChainId).toHaveBeenCalled();
        expect(mockClient.getBlockNumber).toHaveBeenCalled();
        expect(mockStorage.get).toHaveBeenCalled();
        expect(subscription.state.status).toBe(SubscriptionStatus.INITIALIZED);
    });

    it("should handle subscription errors and reconnect", async () => {
        await subscription.initialize();
        await subscription.start();

        expect(subscription.state.status).toBe(SubscriptionStatus.RUNNING);

        // Mock getBlockNumber for reconnect
        vi.spyOn(mockClient, "getBlockNumber").mockResolvedValue(1001n);

        // Simulate subscription error
        const error = new Error("Connection lost");
        await onErrorCallback(error);

        // Should increment error count and call reconnect
        expect(subscription.state.stats.errors).toBe(1);
        expect(subscription.state.lastBlock).toBe(1001);
        expect(subscription.state.status).toBe(SubscriptionStatus.RUNNING);
    });

    it("should cleanup on stop", async () => {
        await subscription.initialize();
        await subscription.start();

        await subscription.stop();

        expect(subscription.state.status).toBe(SubscriptionStatus.STOPPED);
        expect(mockStorage.delete).toHaveBeenCalled();
    });

    it("should handle network errors during initialization", async () => {
        vi.spyOn(mockClient, "getChainId").mockRejectedValue(
            new Error("Network error")
        );

        await expect(subscription.initialize()).rejects.toThrow(
            "Failed to initialize subscription"
        );
        expect(subscription.state.status).toBe(SubscriptionStatus.ERROR);
        expect(subscription.state.stats.errors).toBe(1);
    });

    it("should restore subscription from saved state", async () => {
        // Arrange
        const savedState = {
            chainId: 1,
            config: createEventConfig(),
            lastBlock: 1000,
            status: SubscriptionStatus.RUNNING,
            stats: {
                startedAt: Date.now() - 1000,
                processedBlocks: 1000,
                processedEvents: 50,
                lastEventAt: Date.now() - 100,
                errors: 0,
            },
        };

        vi.spyOn(mockStorage, "get").mockResolvedValue(savedState);
        vi.spyOn(mockClient, "getChainId").mockResolvedValue(1);
        vi.spyOn(mockClient, "getBlockNumber").mockResolvedValue(1500n);

        // Act
        await subscription.initialize();

        // Assert
        expect(subscription.state.lastBlock).toBe(1000); // Continue from saved block
        expect(subscription.state.status).toBe(SubscriptionStatus.INITIALIZED);
    });

    it("should start from current block when fromNow is true", async () => {
        // Arrange
        const currentBlock = 1500n;
        vi.spyOn(mockClient, "getBlockNumber").mockResolvedValue(currentBlock);
        vi.spyOn(mockClient, "getChainId").mockResolvedValue(1);

        // Act
        await subscription.initialize();
        await subscription.start({ fromNow: true });

        // Assert
        expect(mockClient.getLogs).not.toHaveBeenCalled(); // Should not fetch historical logs
        expect(subscription.state.lastBlock).toBe(Number(currentBlock));
        expect(subscription.state.status).toBe(SubscriptionStatus.RUNNING);
    });

    it("should start from specified block when fromBlock is provided", async () => {
        // Arrange
        const startBlock = 1000n;
        const currentBlock = 1500n;
        vi.spyOn(mockClient, "getBlockNumber").mockResolvedValue(currentBlock);
        vi.spyOn(mockClient, "getChainId").mockResolvedValue(1);

        // Act
        await subscription.initialize();
        await subscription.start({ fromBlock: startBlock });

        // Assert
        expect(mockClient.getLogs).toHaveBeenCalledWith(
            expect.objectContaining({
                fromBlock: startBlock,
                toBlock: expect.any(BigInt),
            })
        );
        expect(subscription.state.status).toBe(SubscriptionStatus.RUNNING);
    });

    it("should start from current block when no saved state", async () => {
        // Arrange
        vi.spyOn(mockStorage, "get").mockResolvedValue(null);
        vi.spyOn(mockClient, "getChainId").mockResolvedValue(1);
        vi.spyOn(mockClient, "getBlockNumber").mockResolvedValue(1500n);

        // Act
        await subscription.initialize();

        // Assert
        expect(subscription.state.lastBlock).toBe(0); // Start from zero
        expect(subscription.state.status).toBe(SubscriptionStatus.INITIALIZED);
    });
});
