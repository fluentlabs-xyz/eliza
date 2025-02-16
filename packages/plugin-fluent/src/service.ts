import {
    IAgentRuntime,
    Service,
    ServiceType,
    elizaLogger,
} from "@elizaos/core";
import { type PublicClient } from "viem";
import { getConfig } from "./config";
import {
    ContentType,
    EventConfig,
    ISubscription,
    ISubscriptionStorage,
    Subscription,
    ServiceHealth,
    SubscriptionStatus,
} from "./subscription";
import { SubscriptionStorage } from "./subscription/storage";
import { createViemClient, subscriptionId } from "./utils";

export interface IFluentService extends Service {
    initialize(runtime: IAgentRuntime): Promise<void>;
    start(): Promise<void>;
    stop(): Promise<void>;
    getClient(): PublicClient | null;
    checkHealth(): Promise<ServiceHealth>;
}

export const BLOCKCHAIN_SERVICE = "blockchain";

/**
 * Fluent service implementation for blockchain event handling.
 */
export class FluentService extends Service implements IFluentService {
    private client: PublicClient | null = null;
    private subscriptions = new Map<string, ISubscription>();
    private isInitialized: boolean = false;
    private runtime: IAgentRuntime | null = null;

    constructor(
        private customClient?: PublicClient,
        private customStorage?: ISubscriptionStorage
    ) {
        super();
    }

    static override get serviceType(): ServiceType {
        return BLOCKCHAIN_SERVICE as ServiceType;
    }

    override get serviceType(): ServiceType {
        return FluentService.serviceType;
    }

    override async initialize(runtime: IAgentRuntime): Promise<void> {
        elizaLogger.info("Initializing Fluent service...");
        if (this.isInitialized) {
            elizaLogger.warn("Fluent service already initialized");
            return;
        }
        this.runtime = runtime;

        try {
            // Get configuration and create client
            const config = getConfig(runtime);
            this.client = this.customClient || createViemClient(config);

            // Verify client connection
            const chainId = await this.client.getChainId();

            // Initialize subscription storage
            const storage =
                this.customStorage || new SubscriptionStorage(runtime);

            // Get configs from actions and evaluators
            const configs = this.getEventConfigs(runtime);
            elizaLogger.info("Found event configs:", {
                count: configs.length,
                configs: configs.map((c) => ({
                    contractAddress: c.contractAddress,
                    signature: c.signature,
                })),
            });

            // Create and initialize subscriptions
            for (const config of configs) {
                const subscription = new Subscription(
                    this.client,
                    config,
                    storage,
                    runtime
                );

                const key = subscriptionId({ chainId, config }).toString();
                this.subscriptions.set(key, subscription);
                await subscription.initialize();
            }

            this.isInitialized = true;
            elizaLogger.info("Fluent service initialized");
        } catch (error) {
            elizaLogger.error("Failed to initialize Fluent service:", error);
            await this.stop();
            throw error;
        }
    }

    async start(): Promise<void> {
        elizaLogger.info("Starting Fluent service subscriptions...");

        for (const subscription of this.subscriptions.values()) {
            await subscription.start();
        }

        elizaLogger.info("Fluent service subscriptions started");
    }

    async stop(): Promise<void> {
        elizaLogger.info("Stopping Fluent service");

        for (const subscription of this.subscriptions.values()) {
            await subscription.stop();
        }

        this.subscriptions.clear();
        this.client = null;
        this.isInitialized = false;
        this.runtime = null;

        elizaLogger.info("Fluent service stopped");
    }

    getClient(): PublicClient | null {
        return this.client;
    }

    /**
     * Check health of the service and its subscriptions
     */
    async checkHealth(): Promise<ServiceHealth> {
        const health: ServiceHealth = {
            client: false,
            subscriptions: {},
            totalSubscriptions: this.subscriptions.size,
            activeSubscriptions: 0,
            erroredSubscriptions: 0,
        };

        // Check client health
        try {
            if (this.client) {
                await this.client.getChainId();
                health.client = true;
            }
        } catch (error) {
            elizaLogger.error("Client health check failed:", error);
            health.client = false;
        }

        // Check subscriptions health
        for (const [key, subscription] of this.subscriptions) {
            const state = subscription.state;
            health.subscriptions[key] = {
                status: state.status,
                lastEventAt: state.stats.lastEventAt,
                errors: state.stats.errors,
                processedEvents: state.stats.processedEvents,
            };

            if (
                state.status === SubscriptionStatus.INITIALIZED ||
                state.status === SubscriptionStatus.RUNNING
            ) {
                health.activeSubscriptions++;
            } else if (state.status === SubscriptionStatus.ERROR) {
                health.erroredSubscriptions++;
            }
        }

        return health;
    }

    private getEventConfigs(runtime: IAgentRuntime): EventConfig[] {
        const filterEventConfigs = (messages: any[]) =>
            messages
                .filter(
                    (msg) =>
                        msg.content?.type === ContentType.EVENT &&
                        "eventConfig" in msg.content &&
                        msg.content.eventConfig
                )
                .map((msg) => msg.content.eventConfig as EventConfig);

        const actionConfigs = runtime.actions
            .flatMap((action) => action.examples)
            .flatMap(filterEventConfigs);

        const evaluatorConfigs = runtime.evaluators
            .flatMap((evaluator) => evaluator.examples)
            .flatMap((example) => filterEventConfigs(example.messages));

        return [...actionConfigs, ...evaluatorConfigs];
    }
}
