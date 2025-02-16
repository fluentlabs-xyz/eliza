# Fluent Blockchain Plugin for ElizaOS

A specialized plugin that connects ElizaOS agents to the [Fluent blockchain](https://fluent.xyz/). This plugin enables agents to monitor and react to on-chain events, allowing them to build sophisticated behavioral logic based on blockchain state and transactions.

## Quick Start

The primary way to use Fluent is by defining actions that respond to blockchain events. Here's a real-world example from the [chess-ai project](https://github.com/fluentlabs-xyz/chess-ai) where an ElizaOS agent participates in on-chain chess games:

```typescript
// Chess game event monitoring
export const chessGameAction: Action = {
    name: "CHESS_MOVE",
    description: "Handles chess game moves",
    
    async validate(runtime: IAgentRuntime, message: Memory): Promise<boolean> {
        const content = message.content as EventContent;
        return content?.type === "blockchain_event" && 
               content?.action === "MoveMade";
    },

    async handler(runtime: IAgentRuntime, message: Memory): Promise<void> {
        const content = message.content as EventContent;
        const [gameId, player, move] = content.args;
        
        // Chess game move handling logic
    },

    examples: [{
        content: {
            type: "blockchain_event",
            action: "MoveMade",
            eventConfig: {
                signature: "MoveMade(uint256 indexed gameId, address indexed player, string move)",
                contractAddress: "0x..." // Chess contract address
            }
        }
    }]
}
```

### Important: Event Signatures

When defining event signatures, always use the complete format including parameter names and indexed attributes:

✅ Correct:

```typescript
"event Transfer(address indexed from, address indexed to, uint256 amount)"
"event Approval(address indexed owner, address indexed spender, uint256 value)"
"event GameCreated(uint256 indexed gameId, address indexed white, address indexed black)"
```

❌ Incorrect:

```typescript
"Transfer(address,address,uint256)"  // Missing 'event' keyword and parameter names
"event Approval(address owner,address,uint256)"  // Incomplete parameter names
"GameCreated(uint256,address,address)"  // Missing 'event' keyword and indexed attributes
```

The full signature format is required for:

- Proper event filtering
- Correct parameter decoding
- Accurate event identification
- Event reorg handling

## Configuration

### Required Settings

```typescript
FLUENT_RPC_URL="https://your-rpc-endpoint"  # Primary RPC endpoint
```

### Optional Settings

```typescript
// Provider Configuration
FLUENT_FALLBACK_URLS="https://backup1,https://backup2"  # Comma-separated fallback URLs
FLUENT_HEALTH_CHECK_INTERVAL=30000     # Health check interval in ms
FLUENT_MAX_RETRIES=5                   # Maximum retry attempts
FLUENT_MIN_RECONNECT_DELAY=1000        # Minimum reconnection delay
FLUENT_MAX_RECONNECT_DELAY=30000       # Maximum reconnection delay
FLUENT_RESPONSE_THRESHOLD=5000         # Response time threshold

// Subscription Configuration
FLUENT_FILTER_REFRESH_INTERVAL=60000   # Filter refresh interval in ms
FLUENT_MAX_MISSED_BLOCKS=1000          # Maximum blocks to catch up
FLUENT_MAX_ATTEMPTS=5                  # Maximum retry attempts
FLUENT_INITIAL_DELAY=1000             # Initial retry delay
FLUENT_MAX_DELAY=30000                # Maximum retry delay
FLUENT_BACKOFF_FACTOR=2               # Retry backoff factor
```

## Integration Patterns

### 1. Basic: Action-Based Event Handling (Recommended)

This is the primary way to use Fluent. Simply define actions that respond to blockchain events:

1. Define event configuration in action examples
2. Implement validation logic
3. Implement handling logic

Benefits:

- Simple to implement
- Declarative approach
- Automatic event subscription
- Built-in error handling

### 2. Advanced: Service Integration

For more complex use cases where you need direct control over event handling:

```typescript
import { BLOCKCHAIN_SERVICE, FluentService } from "@elizaos/plugin-fluent";
import { type EventConfig } from "@elizaos/plugin-fluent";

export class YourService extends Service {
    async initialize(runtime: IAgentRuntime): Promise<void> {
        const fluentService = runtime.getService<FluentService>(BLOCKCHAIN_SERVICE);
        
        // Configure events to listen for
        const eventConfigs: EventConfig[] = [{
            contractAddress: "0x...",
            signature: "event Transfer(address indexed from, address indexed to, uint256 amount)"
        }];
        
        // Initialize and start listening
        await fluentService.initialize(eventConfigs);
    }
}
```

## Features

### Event Processing

- Efficient event signature parsing and validation
- Automatic parameter indexing detection
- Robust error handling with detailed messages
- Type-safe event configuration

### Subscription Management

- Block finalization verification
- Reorg detection and handling
- Batch processing of historical events
- Automatic resubscription on reconnection
- Event filtering and validation

### Storage

- PostgreSQL-based event persistence
- Subscription state management
- Query support for historical events
- Transaction tracking

## Advanced Usage

### Event Handling

```typescript
import { type EventConfig, validateEventConfig } from "@elizaos/plugin-fluent";

// Define and validate event config
const config: EventConfig = {
    signature: "event Transfer(address indexed from, address indexed to, uint256 amount)",
    contractAddress: "0x1234...",
    filters: {
        from: "0xabcd..."
    }
};

// Validate configuration
validateEventConfig(config);
```

### Error Handling

```typescript
import { SubscriptionError, SubscriptionErrorType } from "@elizaos/plugin-fluent";

try {
    await subscription.initialize();
} catch (error) {
    if (error instanceof SubscriptionError) {
        switch (error.type) {
            case SubscriptionErrorType.NETWORK:
                // Handle network errors
                break;
            case SubscriptionErrorType.DECODE:
                // Handle decoding errors
                break;
            case SubscriptionErrorType.STORAGE:
                // Handle storage errors
                break;
        }
    }
}
```

## Best Practices

1. **Event Configuration**
   - Always use complete event signatures with 'event' keyword
   - Include parameter names and indexed attributes
   - Validate configs before use
   - Use type-safe event definitions

2. **Error Handling**
   - Handle specific error types appropriately
   - Implement proper retry logic
   - Log errors with context
   - Monitor subscription states

3. **Performance Optimization**
   - Use appropriate filter configurations
   - Monitor event processing times
   - Implement proper error recovery
   - Keep handlers focused and efficient

## Troubleshooting

Common issues and solutions:

1. **Missing Events**
   - Verify event signature includes 'event' keyword
   - Check parameter names and indexed attributes
   - Validate event configuration
   - Monitor subscription status

2. **Connection Issues**
   - Verify RPC endpoint
   - Check network connectivity
   - Monitor error logs
   - Implement proper retry logic

3. **Event Processing**
   - Verify event signature matches contract exactly
   - Check filter configurations
   - Monitor handler execution
   - Review error logs

4. **Type Errors**
   - Use provided type definitions
   - Validate event configurations
   - Check import paths
   - Use proper type assertions

## Contributing

Please refer to the main ElizaOS repository's contributing guidelines.

## License

This project is licensed under the MIT License - see the [LICENSE](LICENSE) file for details.

## Support

For support:

1. Check the troubleshooting guide above
2. Open an issue in the repository
3. Contact the maintainers
