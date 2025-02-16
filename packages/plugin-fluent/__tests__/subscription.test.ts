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

    it("should sync historical events in batches", async () => {
        // Arrange
        const blocks = {
            start: 0n,
            end: 2500n,
            batchSize: 1000n,
        };

        const expectedBatches = [
            { from: 0n, to: 999n },
            { from: 1000n, to: 1999n },
            { from: 2000n, to: 2500n },
        ];

        vi.spyOn(mockClient, "getBlockNumber").mockResolvedValue(blocks.end);
        vi.spyOn(mockClient, "getLogs").mockImplementation((params) => {
            const logs: Log[] = [];
            const from = params!.fromBlock as bigint;
            const to = params!.toBlock as bigint;
            // Create a log for each block in the batch
            for (let block = from; block <= to; block++) {
                logs.push(createMockLog(block));
            }
            return Promise.resolve(logs);
        });

        // Act
        await subscription.initialize();
        await subscription.start();

        // Assert
        // 1. Verify number of batches
        expect(mockClient.getLogs).toHaveBeenCalledTimes(
            expectedBatches.length
        );

        // 2. Verify correct ranges for each batch
        for (const batch of expectedBatches) {
            expect(mockClient.getLogs).toHaveBeenCalledWith(
                expect.objectContaining({
                    fromBlock: batch.from,
                    toBlock: batch.to,
                })
            );
        }

        // 3. Verify final state
        expect(subscription.state.lastBlock).toBe(blocks.end);
        expect(subscription.state.stats.processedBlocks).toBe(
            Number(blocks.end) + 1
        ); // +1 because ranges are inclusive
        expect(subscription.state.stats.processedEvents).toBe(
            Number(blocks.end) + 1
        ); // One event per block
    });

    it("should handle batch failures gracefully", async () => {
        // Arrange
        const blocks = {
            start: 0n,
            end: 2500n,
        };

        // Mock getLogs to fail on second batch
        vi.spyOn(mockClient, "getLogs")
            .mockResolvedValueOnce([]) // First batch succeeds (0-999)
            .mockRejectedValueOnce(new Error("Network error")); // Second batch fails (1000-1999)

        vi.spyOn(mockClient, "getBlockNumber").mockResolvedValue(blocks.end);

        // Act & Assert
        await subscription.initialize();

        // Start syncing and expect failure
        await expect(subscription.start()).rejects.toThrow(
            "Failed to fetch logs batch"
        );

        // Verify first batch was processed
        expect(subscription.state.stats.processedBlocks).toBe(1000); // 0-999 blocks
        expect(subscription.state.lastBlock).toBe(999n);

        // Verify error occurred on second batch
        expect(mockClient.getLogs).toHaveBeenCalledTimes(2);
        expect(mockClient.getLogs).toHaveBeenLastCalledWith(
            expect.objectContaining({
                fromBlock: 1000n,
                toBlock: 1999n,
            })
        );

        // Verify final state
        expect(subscription.state.status).toBe(SubscriptionStatus.ERROR);
        expect(subscription.state.stats.errors).toBe(1);
        expect(mockStorage.set).toHaveBeenCalledWith(
            expect.objectContaining({
                lastBlock: 999n,
                status: SubscriptionStatus.ERROR,
            })
        );
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
        expect(subscription.state.lastBlock).toBe(1001n);
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
            lastBlock: 1000n,
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
        expect(subscription.state.lastBlock).toBe(1000n); // Continue from saved block
        expect(subscription.state.status).toBe(SubscriptionStatus.INITIALIZED);
    });

    it("should start from current block when no saved state", async () => {
        // Arrange
        vi.spyOn(mockStorage, "get").mockResolvedValue(null);
        vi.spyOn(mockClient, "getChainId").mockResolvedValue(1);
        vi.spyOn(mockClient, "getBlockNumber").mockResolvedValue(1500n);

        // Act
        await subscription.initialize();

        // Assert
        expect(subscription.state.lastBlock).toBe(0n); // Start from zero
        expect(subscription.state.status).toBe(SubscriptionStatus.INITIALIZED);
    });
});
