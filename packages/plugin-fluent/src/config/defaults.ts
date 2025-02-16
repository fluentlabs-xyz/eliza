/**
 * Transport configuration
 */
export interface TransportConfig {
    timeout?: number       // in milliseconds
    retryCount?: number   // number of retry attempts
    retryDelay?: number   // delay between retries in milliseconds
    batch?: boolean       // batch request support
}

/**
 * Sync configuration
 */
export interface SyncConfig {
    startBlock?: number;   // Block number to start syncing from
    batchSize: number;     // Number of blocks per batch
    confirmations: number; // Required block confirmations
}

/**
 * Default configuration values
 */
export const defaultConfig = {
    transport: {
        timeout: 10_000,    // 10s timeout
        retryCount: 3,      // Retry failed requests 3 times
        retryDelay: 1000,   // 1s delay between retries
        batch: true         // Enable request batching
    } satisfies TransportConfig,

    sync: {
        batchSize: 100,     // Number of blocks per batch
        confirmations: 12   // Required block confirmations
    } satisfies SyncConfig
} as const;
