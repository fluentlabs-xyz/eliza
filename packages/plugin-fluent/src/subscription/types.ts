import { Content, UUID } from "@elizaos/core";
import { type Log, type Address } from "viem";

/**
 * Event subscription configuration
 */
export interface EventConfig {
    // Event signature (will be converted to ABI)
    signature: string;
    // Contract address
    contractAddress: Address;
    // Optional argument filters
    filters?: Record<string, unknown>;
}

/** Event identification */
export interface EventId {
    chainId: number;
    blockNumber: number;
    transactionHash: string;
    logIndex: number;
}

/** Subscription identification */
export interface SubscriptionId {
    chainId: number;
    config: EventConfig;
}

/**
 * Event content interface
 */
export interface EventContent extends Content {
    type: ContentType.EVENT;
    id: EventId;
    config: EventConfig;
    args: Record<string, unknown>;
    action: string;
    raw: Log;
}

/**
 * Content type identifiers for blockchain events and subscriptions
 */
export enum ContentType {
    EVENT = "blockchain_event",
    SUBSCRIPTION = "blockchain_subscription",
}

/**
 * Subscription status
 */
export enum SubscriptionStatus {
    ERROR = "error",
    INITIALIZED = "initialized",
    SYNCING = "syncing",
    RUNNING = "running",
    STOPPED = "stopped",
}

/**
 * Subscription statistics
 */
export interface SubscriptionStats {
    startedAt: number;
    processedBlocks: number;
    processedEvents: number;
    lastEventAt?: number;
    errors: number;
}

/**
 * Subscription state
 */
export interface SubscriptionState {
    chainId: number;
    config: EventConfig;
    lastBlock: number;
    status: SubscriptionStatus;
    stats: SubscriptionStats;
}

/**
 * Event handler interface
 */
export interface IEventHandler {
    handle(log: Log): Promise<void>;
}

/**
 * Subscription interface
 */
export interface StartOptions {
    fromNow?: boolean;        // If true - start from current block
    fromBlock?: bigint;       // Optional starting block
}

export interface ISubscription {
    readonly state: SubscriptionState;
    initialize(): Promise<void>;
    start(options?: StartOptions): Promise<void>;
    stop(): Promise<void>;
    reconnect(): Promise<void>;
}

/**
 * Storage interface
 */
export interface ISubscriptionStorage {
    set(state: SubscriptionState): Promise<void>;
    get(id: SubscriptionId): Promise<SubscriptionState | null>;
    delete(id: SubscriptionId): Promise<void>;
}

/**
 * Error types
 */
export enum SubscriptionErrorType {
    NETWORK = "network_error",
    DECODE = "decode_error",
    STORAGE = "storage_error",
    UNKNOWN = "unknown_error",
}

export class SubscriptionError extends Error {
    constructor(
        message: string,
        public readonly type: SubscriptionErrorType,
        public readonly details?: unknown
    ) {
        super(message);
        this.name = "SubscriptionError";
    }
}

/**
 * Health check interfaces
 */
export interface SubscriptionHealth {
    status: SubscriptionStatus;
    lastEventAt?: number;
    errors: number;
    processedEvents: number;
}

export interface ServiceHealth {
    client: boolean;
    subscriptions: {
        [key: string]: SubscriptionHealth;
    };
    totalSubscriptions: number;
    activeSubscriptions: number;
    erroredSubscriptions: number;
}
