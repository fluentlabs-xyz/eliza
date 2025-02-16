import { IAgentRuntime, UUID } from "@elizaos/core";
import { type PublicClient, type Address, Log, Hex, GetLogsParameters } from "viem";
import { vi } from "vitest";
import { EventConfig } from "../../src";

// Mock database adapter
export const mockDatabaseAdapter = {
    query: vi.fn().mockResolvedValue({ rows: [] }),
    getMemories: vi.fn(),
    createMemory: vi.fn(),
    removeMemory: vi.fn(),
    removeAllMemories: vi.fn(),
    countMemories: vi.fn(),
    getCachedEmbeddings: vi.fn(),
    searchMemories: vi.fn(),
    getMemoriesByRoomIds: vi.fn(),
    getMemoryById: vi.fn(),
};

// Create mock viem client
export const createMockClient = (overrides = {}): PublicClient => {
    const getChainId = vi.fn();
    getChainId.mockResolvedValue(1);

    const getBlockNumber = vi.fn();
    getBlockNumber.mockResolvedValue(1000n);

    const getLogs = vi.fn().mockImplementation(({ fromBlock, toBlock }) => {
        const logs: Log[] = [];
        for (let block = fromBlock; block <= toBlock; block++) {
            logs.push(createMockLog(block));
        }
        return Promise.resolve(logs);
    });

    const watchContractEvent = vi.fn();

    watchContractEvent.mockImplementation(() => {
        return () => {};
    });

    return {
        getChainId,
        getBlockNumber,
        getLogs,
        watchContractEvent,
        ...overrides,
    } as unknown as PublicClient;
};

// Factory functions
export const createEventConfig = (overrides = {}): EventConfig => ({
    contractAddress: "0x1234567890123456789012345678901234567890" as Address,
    signature:
        "event Transfer(address indexed from, address indexed to, uint256 value)",
    filters: {},
    ...overrides,
});

// Runtime mock
export const createMockRuntime = (overrides = {}): IAgentRuntime => {
    const messageManager = {
        createMemory: vi.fn().mockResolvedValue(undefined),
        removeMemory: vi.fn().mockResolvedValue(undefined),
        removeAllMemories: vi.fn().mockResolvedValue(undefined),
        addEmbeddingToMemory: vi.fn().mockResolvedValue(undefined),
    };

    const composeState = vi.fn();
    composeState.mockResolvedValue({});

    const processActions = vi.fn();
    processActions.mockResolvedValue(undefined);

    const evaluate = vi.fn();
    evaluate.mockResolvedValue(undefined);

    return {
        agentId: "test-agent-id" as UUID,
        databaseAdapter: mockDatabaseAdapter,
        messageManager,
        actions: [],
        evaluators: [],
        getSetting: vi.fn(),
        composeState,
        processActions,
        evaluate,
        ...overrides,
    } as unknown as IAgentRuntime;
};

export function createMockLog(blockNumber: bigint): Log {
    return {
        blockNumber,
        blockHash: `0x${blockNumber.toString(16)}`.padEnd(66, "0") as Hex,
        transactionHash: `0x${blockNumber.toString(16)}`.padEnd(66, "0") as Hex,
        transactionIndex: 0,
        logIndex: 0,
        address: "0x1234567890123456789012345678901234567890",
        data: "0x",
        topics: [],
        removed: false,
    };
}
