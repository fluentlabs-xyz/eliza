import { Plugin } from "@elizaos/core";
import { IFluentService, FluentService, BLOCKCHAIN_SERVICE } from "./service";

import {
    ContentType,
    EventConfig,
    EventContent,
    SubscriptionStatus,
    SubscriptionErrorType,
    SubscriptionError,
    ISubscription,
    ISubscriptionStorage,
} from "./subscription";
import { SubscriptionStorage } from "./subscription/storage";

import { fluentDevnet, getConfig, ServiceConfig } from "./config";
import { createViemClient } from "./utils";
// Export types
export {
    EventConfig,
    EventContent,
    IFluentService,
    ISubscription,
    createViemClient,
    ISubscriptionStorage,
    ServiceConfig as FluentConfig,
    getConfig,
    fluentDevnet,
    BLOCKCHAIN_SERVICE,
};

// Export enums
export { ContentType, SubscriptionStatus, SubscriptionErrorType };

// Export error classes
export { SubscriptionError };

// Export utilities
export { contractRoomId, eventId, subscriptionId } from "./utils";

/**
 * Blockchain event listener plugin for ElizaOS.
 *
 * Features:
 * - Automatic provider management and health checks
 * - Event persistence with PostgreSQL
 * - Subscription state management
 * - Block finalization checks
 * - Reorg detection
 */
export const fluentPlugin: Plugin = {
    name: "fluent",
    description: "Blockchain event listener plugin for ElizaOS",
    services: [new FluentService()],
};

// Export service class for direct usage
export { FluentService, SubscriptionStorage as MemorySubscriptionStorage };
