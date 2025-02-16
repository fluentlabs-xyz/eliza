import { describe, it, expect, beforeEach, vi } from "vitest";
import { EventHandler } from "../src/subscription/event-handler";
import { type Log } from "viem";
import {
    createMockClient,
    createEventConfig,
    createMockRuntime,
} from "./mocks/test-utils";

vi.mock("viem", async () => {
    const actual = await vi.importActual("viem");
    return {
        ...actual,
        parseEventLogs: vi.fn().mockReturnValue([
            {
                address: "0x1234567890123456789012345678901234567890",
                blockNumber: 1000n,
                transactionHash: "0xabc",
                logIndex: 0,
                data: "0x",
                topics: [],
            },
        ]),
        decodeEventLog: vi.fn().mockReturnValue({
            eventName: "Transfer",
            args: {
                from: "0xa0b86991c6218b36c1d19d4a2e9eb0ce3606eb48",
                to: "0xd8da6bf26964af9d7eed9e03e53415d37aa96045",
                value: "1000000000000000000"
            }
        }),

    };
});

describe("EventHandler", () => {
    let mockClient: ReturnType<typeof createMockClient>;
    let mockRuntime: ReturnType<typeof createMockRuntime>;
    let handler: EventHandler;

    beforeEach(() => {
        mockClient = createMockClient();
        mockRuntime = createMockRuntime();

        const config = createEventConfig({
            signature:
                "event Transfer(address indexed from, address indexed to, uint256 value)",
            contractAddress: "0x1234567890123456789012345678901234567890",
        });

        handler = new EventHandler(config, mockRuntime, mockClient);
    });

    it("should handle parse errors", async () => {
        const invalidLog = {
            blockNumber: 1000n,
            transactionHash: "0xabc",
            logIndex: 0,
            data: "invalid data",
            topics: ["invalid topic"],
        } as unknown as Log;

        vi.spyOn(mockClient, "getChainId").mockResolvedValue(1);

        await handler.handle(invalidLog);

        // Verify no memory was created
        expect(mockRuntime.messageManager.createMemory).not.toHaveBeenCalled();
        expect(mockRuntime.processActions).not.toHaveBeenCalled();
        expect(mockRuntime.evaluate).not.toHaveBeenCalled();
    });

    it("should handle network errors", async () => {
        const mockLog = {
            blockNumber: 1000n,
            transactionHash: "0xabc",
            logIndex: 0,
            data: "0x",
            topics: [],
        } as unknown as Log;

        vi.spyOn(mockClient, "getChainId").mockRejectedValue(
            new Error("Network error")
        );

        await handler.handle(mockLog);

        // Verify no memory was created
        expect(mockRuntime.messageManager.createMemory).not.toHaveBeenCalled();
        expect(mockRuntime.processActions).not.toHaveBeenCalled();
        expect(mockRuntime.evaluate).not.toHaveBeenCalled();
    });

    it("should handle memory processing errors", async () => {
        const mockLog = {
            blockNumber: 1000n,
            transactionHash: "0xabc",
            logIndex: 0,
            data: "0x0000000000000000000000000000000000000000000000000de0b6b3a7640000",
            topics: [
                "0xddf252ad1be2c89b69c2b068fc378daa952ba7f163c4a11628f55a4df523b3ef",
                "0x000000000000000000000000a0b86991c6218b36c1d19d4a2e9eb0ce3606eb48",
                "0x000000000000000000000000d8da6bf26964af9d7eed9e03e53415d37aa96045",
            ],
        } as unknown as Log;

        vi.spyOn(mockClient, "getChainId").mockResolvedValue(1);
        vi.spyOn(mockRuntime.messageManager, "createMemory").mockRejectedValue(
            new Error("Processing error")
        );

        await handler.handle(mockLog);

        // Verify error was handled gracefully
        expect(mockRuntime.processActions).not.toHaveBeenCalled();
        expect(mockRuntime.evaluate).not.toHaveBeenCalled();
    });

    it.only("should create memory with correct format", async () => {
        const mockLog = {
            blockNumber: 1000n,
            transactionHash: "0xabc",
            logIndex: 0,
            data: "0x",
            topics: [],
        } as unknown as Log;

        vi.spyOn(mockClient, "getChainId").mockResolvedValue(1);

        await handler.handle(mockLog);

        expect(mockRuntime.messageManager.createMemory).toHaveBeenCalled();
    });
});
