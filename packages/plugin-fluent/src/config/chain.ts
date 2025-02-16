import { defineChain } from "viem";
import type { Chain } from "viem";
/**
 * Fluent DevNet chain configuration for viem
 * @see https://docs.fluentlabs.xyz/learn/developer-preview/connect-to-the-fluent-devnet
 */
export const fluentDevnet = defineChain({
    id: 20993,
    name: "Fluent DevNet",

    nativeCurrency: {
        decimals: 18,
        name: "ETH",
        symbol: "ETH",
    },

    rpcUrls: {
        default: {
            http: ["https://rpc.dev.gblend.xyz/"],
        },
    },

    blockExplorers: {
        default: {
            name: "FluentScan",
            url: "https://blockscout.dev.gblend.xyz/",
        },
    },
    testnet: true,
    blockTime: 2, // Expected block time in seconds
}) as Chain;
