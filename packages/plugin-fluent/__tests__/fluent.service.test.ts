import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { FluentService } from "../src/service";
import { ContentType, SubscriptionStatus } from "../src";

import {
    createEventConfig,
    createMockClient,
    createMockRuntime,
} from "./mocks/test-utils";
import { type ISubscriptionStorage } from "../src/subscription/types";
import { type Log } from "viem";

describe("FluentService", () => {
    let service: FluentService;
    let mockClient: ReturnType<typeof createMockClient>;
    let mockStorage: ISubscriptionStorage;
    let mockRuntime: ReturnType<typeof createMockRuntime>;
    let onLogsCallback: (logs: Log[]) => Promise<void>;
    let onErrorCallback: (error: Error) => Promise<void>;

    beforeEach(() => {
        vi.clearAllMocks();

        // Create mock storage
        mockStorage = {
            set: vi.fn().mockResolvedValue(undefined),
            get: vi.fn().mockResolvedValue(null),
            delete: vi.fn().mockResolvedValue(undefined),
        };

        // Create mock client with vitest mock functions
        mockClient = {
            ...createMockClient(),
            watchContractEvent: vi.fn().mockImplementation(({ onLogs, onError }) => {
                onLogsCallback = onLogs;
                onErrorCallback = onError;
                return () => {}; // Cleanup fn
            }),
        };

        // Create service with mocks
        service = new FluentService(mockClient, mockStorage);
        mockRuntime = createMockRuntime();
    });

    afterEach(() => {
        vi.clearAllMocks();
    });

    it("should return correct service type", () => {
        expect(service.serviceType).toBe("blockchain");
        expect(FluentService.serviceType).toBe("blockchain");
    });

    it("should initialize and start subscriptions correctly", async () => {
        const eventConfig = createEventConfig();
        const runtime = createMockRuntime({
            actions: [
                {
                    examples: [
                        [
                            {
                                content: {
                                    type: ContentType.EVENT,
                                    eventConfig,
                                    text: "",
                                    action: "Transfer",
                                },
                            },
                        ],
                    ],
                },
            ],
        });

        await service.initialize(runtime);
        await service.start();

        // Verify client was used to watch events
        expect(mockClient.watchContractEvent).toHaveBeenCalledWith(
            expect.objectContaining({
                address: eventConfig.contractAddress,
                eventName: expect.stringContaining("Transfer"),
            })
        );
    });

    it("should stop all subscriptions on stop", async () => {
        const eventConfig = createEventConfig();
        const runtime = createMockRuntime({
            actions: [
                {
                    examples: [
                        [
                            {
                                content: {
                                    type: ContentType.EVENT,
                                    eventConfig,
                                    text: "",
                                    action: "Transfer",
                                },
                            },
                        ],
                    ],
                },
            ],
        });

        await service.initialize(runtime);
        await service.start();

        await service.stop();

        // Verify storage cleanup
        expect(mockStorage.delete).toHaveBeenCalled();

        // Verify service state reset
        const health = await service.checkHealth();
        expect(health.totalSubscriptions).toBe(0);
        expect(health.activeSubscriptions).toBe(0);
    });

    it("should handle initialization errors", async () => {
        vi.spyOn(mockClient, "getChainId").mockRejectedValue(new Error("Network error"));

        const runtime = createMockRuntime();
        await expect(service.initialize(runtime)).rejects.toThrow("Network error");

        // Verify service cleanup on error
        const health = await service.checkHealth();
        expect(health.client).toBe(false);
        expect(health.totalSubscriptions).toBe(0);
    });

    it("should handle subscription start errors", async () => {
        const eventConfig = createEventConfig();
        const runtime = createMockRuntime({
            actions: [
                {
                    examples: [
                        [
                            {
                                content: {
                                    type: ContentType.EVENT,
                                    eventConfig,
                                    text: "",
                                    action: "Transfer",
                                },
                            },
                        ],
                    ],
                },
            ],
        });

        await service.initialize(runtime);

        // Mock error in subscription start
        vi.spyOn(mockClient, "getBlockNumber").mockRejectedValue(new Error("Network error"));

        // Verify error is thrown
        await expect(service.start()).rejects.toThrow("Failed to start subscription");

        // Verify subscription is in error state
        const health = await service.checkHealth();
        expect(health.totalSubscriptions).toBe(1);
        expect(health.erroredSubscriptions).toBe(1);
    });

    it("should report accurate health status after errors", async () => {
        const eventConfig = createEventConfig();
        const runtime = createMockRuntime({
            actions: [
                {
                    examples: [
                        [
                            {
                                content: {
                                    type: ContentType.EVENT,
                                    eventConfig,
                                    text: "",
                                    action: "Transfer",
                                },
                            },
                        ],
                    ],
                },
            ],
        });

        await service.initialize(runtime);
        await service.start();

        // Simulate subscription error
        const error = new Error("Connection lost");
        await onErrorCallback(error);

        const health = await service.checkHealth();
        expect(health.client).toBe(true);
        const subscriptionHealth = health.subscriptions[Object.keys(health.subscriptions)[0]];
        expect(subscriptionHealth.errors).toBe(1);
        expect(subscriptionHealth.status).toBe(SubscriptionStatus.RUNNING);
    });

    it("should handle multiple subscriptions", async () => {
        const config1 = createEventConfig({
            contractAddress: "0x1234567890123456789012345678901234567890",
            signature: "event Transfer(address indexed from, address indexed to, uint256 value)",
        });
        const config2 = createEventConfig({
            contractAddress: "0x5678567890123456789012345678901234567890",
            signature: "event Approval(address indexed owner, address indexed spender, uint256 value)",
        });

        const runtime = createMockRuntime({
            actions: [
                {
                    examples: [
                        [
                            {
                                content: {
                                    type: ContentType.EVENT,
                                    eventConfig: config1,
                                    text: "",
                                    action: "Transfer",
                                },
                            },
                        ],
                        [
                            {
                                content: {
                                    type: ContentType.EVENT,
                                    eventConfig: config2,
                                    text: "",
                                    action: "Approval",
                                },
                            },
                        ],
                    ],
                },
            ],
        });

        await service.initialize(runtime);
        await service.start();

        // Verify both subscriptions are active
        const health = await service.checkHealth();
        expect(health.totalSubscriptions).toBe(2);
        expect(health.activeSubscriptions).toBe(2);

        // Verify both events are watched
        expect(mockClient.watchContractEvent).toHaveBeenCalledWith(
            expect.objectContaining({
                address: config1.contractAddress,
                eventName: expect.stringContaining("Transfer"),
            })
        );
        expect(mockClient.watchContractEvent).toHaveBeenCalledWith(
            expect.objectContaining({
                address: config2.contractAddress,
                eventName: expect.stringContaining("Approval"),
            })
        );
    });
});
