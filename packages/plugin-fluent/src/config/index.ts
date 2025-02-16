import { IAgentRuntime, elizaLogger } from "@elizaos/core";
import { type Chain } from 'viem';
import { fluentDevnet } from './chain';
import { defaultConfig, type TransportConfig, type SyncConfig } from './defaults';

/**
 * Service configuration
 */
export interface ServiceConfig {
    chain: Chain;
    rpcUrl: string;
    transport: TransportConfig;
    sync: SyncConfig;
}

/**
 * Get configuration from runtime settings with fallbacks to defaults
 */
export function getConfig(runtime: IAgentRuntime): ServiceConfig {
    // Get RPC URL from environment or use default from chain
    const rpcUrl = runtime.getSetting("FLUENT_RPC_URL") ||
                  fluentDevnet.rpcUrls.default.http[0];

    // Get start block with validation
    const startBlock = runtime.getSetting("FLUENT_START_BLOCK") ?
        Number(runtime.getSetting("FLUENT_START_BLOCK")) : undefined;

    if (startBlock !== undefined && startBlock < 0) {
        throw new Error("Start block number cannot be negative");
    }

    const config: ServiceConfig = {
        chain: fluentDevnet,
        rpcUrl,
        transport: { ...defaultConfig.transport },
        sync: {
            ...defaultConfig.sync,
            ...(startBlock && { startBlock })
        }
    };

    elizaLogger.info("Loaded Fluent configuration:", config);
    return config;
}

// Re-export chain and config types
export { fluentDevnet } from './chain';
export { type TransportConfig, type SyncConfig } from './defaults';
