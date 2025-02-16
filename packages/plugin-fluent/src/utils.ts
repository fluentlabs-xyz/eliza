import { UUID, stringToUuid } from "@elizaos/core";
import { createPublicClient, http } from "viem";
import { type ServiceConfig } from "./config";
import { EventId, SubscriptionId } from "./subscription";

/**
 * Client Utils
 */
export function createViemClient(config: ServiceConfig, customClient?: any) {
    if (customClient) return customClient;

    const client = createPublicClient({
        chain: config.chain,
        transport: http(config.rpcUrl),
    });

    return client;
}

/**
 * Service States
 */
export type ServiceState = "stopped" | "initializing" | "running" | "error";

export const ServiceState = {
    STOPPED: "stopped" as ServiceState,
    INITIALIZING: "initializing" as ServiceState,
    RUNNING: "running" as ServiceState,
    ERROR: "error" as ServiceState,
};

/**
 * ID Generation Utils
 */
export function contractRoomId(chainId: number, contract: string): UUID {
    return stringToUuid(`contract-room-${chainId}-${contract.toLowerCase()}`);
}

export function subscriptionId(id: SubscriptionId): UUID {
    return stringToUuid(JSON.stringify(id));
}

export function eventId(id: EventId): UUID {
    return stringToUuid(JSON.stringify(id));
}

/**
 * Event Args Normalization
 */
export function normalizeEventArgs(value: any): any {
    if (value == null) return null;

    if (typeof value === "bigint") {
        return value.toString();
    }

    if (typeof value === "string" && value.startsWith("0x")) {
        return value.toLowerCase();
    }

    if (Array.isArray(value)) {
        return value.map(normalizeEventArgs);
    }

    if (typeof value === "object") {
        return Object.fromEntries(
            Object.entries(value).map(([k, v]) => [k, normalizeEventArgs(v)])
        );
    }

    return value;
}
