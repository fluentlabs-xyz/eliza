import { describe, it, expect, vi } from 'vitest';
import { getConfig } from '../src/config';
import { defaultConfig } from '../src/config/defaults';
import { fluentDevnet } from '../src/config/chain';
import { type IAgentRuntime } from '@elizaos/core';

describe('Config', () => {
    // Mock runtime
    const createRuntime = (settings: Record<string, string | undefined> = {}): IAgentRuntime => ({
        getSetting: vi.fn((key) => settings[key]),
        agentId: 'test-agent'
    } as unknown as IAgentRuntime);

    it('should use default config when no settings provided', () => {
        const runtime = createRuntime();
        const config = getConfig(runtime);

        // Check default values
        expect(config.chain).toBe(fluentDevnet);
        expect(config.rpcUrl).toBe(fluentDevnet.rpcUrls.default.http[0]);
        expect(config.transport).toEqual(defaultConfig.transport);
        expect(config.sync).toEqual(defaultConfig.sync);
    });

    it('should override settings from environment', () => {
        const runtime = createRuntime({
            FLUENT_RPC_URL: 'https://custom.rpc.url',
            FLUENT_START_BLOCK: '1000'
        });

        const config = getConfig(runtime);

        // Check overridden values
        expect(config.rpcUrl).toBe('https://custom.rpc.url');
        expect(config.sync.startBlock).toBe(1000);
        // Other settings should remain default
        expect(config.transport).toEqual(defaultConfig.transport);
        expect(config.sync.batchSize).toBe(defaultConfig.sync.batchSize);
        expect(config.sync.confirmations).toBe(defaultConfig.sync.confirmations);
    });

    it('should throw error for negative start block', () => {
        const runtime = createRuntime({
            FLUENT_START_BLOCK: '-1'
        });

        expect(() => getConfig(runtime)).toThrow('Start block number cannot be negative');
    });

    it('should handle invalid start block value', () => {
        const runtime = createRuntime({
            FLUENT_START_BLOCK: 'not-a-number'
        });

        const config = getConfig(runtime);
        expect(config.sync.startBlock).toBeUndefined();
    });
});
