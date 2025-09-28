# ioBroker MQTT Client Adapter Development with GitHub Copilot

**Version:** 0.4.0
**Template Source:** https://github.com/DrozmotiX/ioBroker-Copilot-Instructions

This file contains instructions and best practices for GitHub Copilot when working on the ioBroker MQTT Client adapter development.

## Project Context

You are working on an ioBroker MQTT Client adapter. ioBroker is an integration platform for the Internet of Things, focused on building smart home and industrial IoT solutions. This adapter specifically enables bidirectional communication between ioBroker and MQTT brokers, allowing ioBroker states to be published to MQTT topics and MQTT messages to be subscribed to and converted to ioBroker states.

### MQTT Client Adapter Specifics
- **Purpose**: Synchronize ioBroker states with MQTT brokers through publish/subscribe mechanisms
- **Target Systems**: Any MQTT broker (Mosquitto, AWS IoT, Azure IoT Hub, etc.)
- **Key Features**:
  - Bidirectional MQTT communication (publish & subscribe)
  - WebSocket and native MQTT protocol support
  - SSL/TLS encryption support
  - QoS level configuration
  - Last Will and Testament (LWT) support
  - Connection status monitoring
  - Topic prefix configuration for inbox/outbox separation
- **Main Dependencies**: `mqtt` library for MQTT client functionality
- **Configuration**: Uses jsonConfig for modern instance settings UI

## Testing

### Unit Testing
- Use Jest as the primary testing framework for ioBroker adapters
- Create tests for all adapter main functions and helper methods
- Test error handling scenarios and edge cases
- Mock external MQTT broker connections for unit tests
- For MQTT connectivity tests, provide example message payloads and broker responses
- Example test structure:
  ```javascript
  describe('MQTT Client Adapter', () => {
    let adapter;
    
    beforeEach(() => {
      // Setup test adapter instance with mocked MQTT client
    });
    
    test('should initialize MQTT connection correctly', () => {
      // Test adapter initialization and MQTT connection setup
    });
    
    test('should handle MQTT message subscription', () => {
      // Test MQTT message handling and state updates
    });
  });
  ```

### Integration Testing

**IMPORTANT**: Use the official `@iobroker/testing` framework for all integration tests. This is the ONLY correct way to test ioBroker adapters.

**Official Documentation**: https://github.com/ioBroker/testing

#### Framework Structure
Integration tests MUST follow this exact pattern:

```javascript
const path = require('path');
const { tests } = require('@iobroker/testing');

// Define test MQTT broker configuration
const TEST_MQTT_CONFIG = {
    host: 'test.mosquitto.org', // Public test broker
    port: 1883,
    clientId: 'iobroker-test-client',
    reconnectPeriod: 30000
};

const wait = ms => new Promise(resolve => setTimeout(resolve, ms));

// Use tests.integration() with defineAdditionalTests
tests.integration(path.join(__dirname, '..'), {
    defineAdditionalTests({ suite }) {
        suite('Test MQTT Client adapter with specific configuration', (getHarness) => {
            let harness;

            before(() => {
                harness = getHarness();
            });

            it('should configure and start MQTT client adapter', function () {
                return new Promise(async (resolve, reject) => {
                    try {
                        harness = getHarness();
                        
                        // Get adapter object using promisified pattern
                        const obj = await new Promise((res, rej) => {
                            harness.objects.getObject('system.adapter.mqtt-client.0', (err, o) => {
                                if (err) return rej(err);
                                res(o);
                            });
                        });
                        
                        if (!obj) {
                            return reject(new Error('Adapter object not found'));
                        }

                        // Configure MQTT adapter properties
                        Object.assign(obj.native, {
                            host: TEST_MQTT_CONFIG.host,
                            port: TEST_MQTT_CONFIG.port,
                            clientId: TEST_MQTT_CONFIG.clientId,
                            reconnectPeriod: TEST_MQTT_CONFIG.reconnectPeriod,
                            inbox: 'ioBroker/test',
                            outbox: 'ioBroker/test',
                            ssl: false,
                            websocket: false,
                            enabled: true
                        });

                        // Set the updated configuration
                        harness.objects.setObject(obj._id, obj);

                        console.log('✅ Step 1: MQTT configuration written, starting adapter...');
                        
                        // Start adapter and wait
                        await harness.startAdapterAndWait();
                        
                        console.log('✅ Step 2: MQTT adapter started');

                        // Wait for MQTT connection to establish
                        const waitMs = 15000;
                        await wait(waitMs);

                        console.log('🔍 Step 3: Checking MQTT connection state...');
                        
                        // Check if MQTT connection was established
                        const connectionState = await new Promise((res, rej) => {
                            harness.states.getState('mqtt-client.0.info.connection', (err, state) => {
                                if (err) return rej(err);
                                res(state);
                            });
                        });

                        if (connectionState && connectionState.val === true) {
                            console.log('✅ SUCCESS: MQTT connection established');
                            resolve();
                        } else {
                            reject(new Error('MQTT connection was not established within timeout'));
                        }
                    } catch (e) {
                        console.error('❌ Test failed:', e.message);
                        reject(e);
                    }
                });
            }).timeout(60000);
        });
    }
});
```

#### MQTT-Specific Testing Considerations
- Use public test MQTT brokers for integration tests (test.mosquitto.org, broker.hivemq.com)
- Test both publish and subscribe functionality
- Verify QoS levels are respected
- Test SSL/TLS connections if supported by test broker
- Test WebSocket MQTT connections
- Verify Last Will and Testament functionality
- Test connection recovery after network interruption

## Adapter Structure

### Main Implementation (main.js)
The MQTT Client adapter follows the standard ioBroker adapter pattern:

```javascript
class MqttClient extends utils.Adapter {
    constructor(options) {
        super({
            ...options,
            name: 'mqtt-client',
        });
        this.on('ready', this.onReady.bind(this));
        this.on('stateChange', this.onStateChange.bind(this));
        this.on('objectChange', this.onObjectChange.bind(this));
        this.on('message', this.onMessage.bind(this));
        this.on('unload', this.onUnload.bind(this));
    }

    async onReady() {
        // Initialize MQTT client connection
        // Set up subscriptions and publications
    }

    onStateChange(id, state) {
        // Handle ioBroker state changes for MQTT publishing
    }

    onObjectChange(id, obj) {
        // Handle object changes for dynamic MQTT topic management
    }

    onUnload(callback) {
        try {
            // Clean up MQTT connections
            if (this.mqttClient) {
                this.mqttClient.end();
            }
            callback();
        } catch (e) {
            callback();
        }
    }
}
```

### Configuration Management
- Uses encrypted storage for MQTT passwords
- Supports both username/password and certificate authentication
- Dynamic topic configuration through custom object settings
- Connection pooling for multiple MQTT brokers (if needed)

## Code Style and Standards

- Follow JavaScript/TypeScript best practices
- Use async/await for asynchronous operations
- Implement proper resource cleanup in `unload()` method, especially MQTT client connections
- Use semantic versioning for adapter releases
- Include proper JSDoc comments for public methods
- Handle MQTT connection errors gracefully with retry mechanisms
- Validate MQTT topic names and QoS levels
- Implement proper logging levels (debug, info, warn, error)

## CI/CD and Testing Integration

### GitHub Actions for MQTT Testing
For the MQTT Client adapter, implement separate CI/CD jobs for different MQTT broker types:

```yaml
# Tests MQTT connectivity with public test brokers
mqtt-integration-tests:
  if: contains(github.event.head_commit.message, '[skip ci]') == false
  
  runs-on: ubuntu-22.04
  
  strategy:
    matrix:
      mqtt-broker:
        - 'test.mosquitto.org'
        - 'broker.hivemq.com'
  
  steps:
    - name: Checkout code
      uses: actions/checkout@v4
      
    - name: Use Node.js 20.x
      uses: actions/setup-node@v4
      with:
        node-version: 20.x
        cache: 'npm'
        
    - name: Install dependencies
      run: npm ci
      
    - name: Run MQTT integration tests
      run: npm run test:integration
      env:
        TEST_MQTT_BROKER: ${{ matrix.mqtt-broker }}
```

### CI/CD Best Practices for MQTT
- Run MQTT connectivity tests separately from main test suite
- Use ubuntu-22.04 for consistency
- Don't make MQTT broker connectivity tests required for deployment (external dependency)
- Provide clear failure messages for MQTT connectivity issues
- Use appropriate timeouts for MQTT connection attempts (30+ seconds)
- Test both secure (SSL/TLS) and non-secure connections when possible

### Package.json Script Integration
Add dedicated scripts for MQTT testing:
```json
{
  "scripts": {
    "test:integration": "mocha test/integration --exit",
    "test:mqtt": "mocha test/mqtt-integration --exit"
  }
}
```

### Practical Example: Complete MQTT Testing Implementation
Here's a complete example for MQTT-specific testing:

#### test/mqtt-integration.js
```javascript
const path = require("path");
const { tests } = require("@iobroker/testing");

// Helper function for MQTT connection testing
async function testMqttConnection(harness, brokerConfig) {
    const systemConfig = await harness.objects.getObjectAsync("system.config");
    
    if (!systemConfig) {
        throw new Error("Could not retrieve system configuration");
    }
    
    return new Promise((resolve, reject) => {
        const mqtt = require('mqtt');
        const testClient = mqtt.connect(`mqtt://${brokerConfig.host}:${brokerConfig.port}`, {
            clientId: 'iobroker-test-connection',
            connectTimeout: 10000
        });
        
        testClient.on('connect', () => {
            testClient.end();
            resolve(true);
        });
        
        testClient.on('error', (err) => {
            testClient.end();
            reject(err);
        });
        
        setTimeout(() => {
            testClient.end();
            reject(new Error('MQTT connection timeout'));
        }, 15000);
    });
}

// Run integration tests with test MQTT brokers
tests.integration(path.join(__dirname, ".."), {
    defineAdditionalTests({ suite }) {
        suite("MQTT Connectivity Testing", (getHarness) => {
            let harness;
            
            before(() => {
                harness = getHarness();
            });

            it("Should connect to test MQTT broker and establish communication", async () => {
                console.log("Testing MQTT broker connectivity...");
                
                const brokerConfig = {
                    host: process.env.TEST_MQTT_BROKER || 'test.mosquitto.org',
                    port: 1883
                };
                
                // First test direct MQTT connection
                try {
                    await testMqttConnection(harness, brokerConfig);
                    console.log("✅ Direct MQTT connection successful");
                } catch (err) {
                    throw new Error(`Direct MQTT connection failed: ${err.message}`);
                }
                
                if (harness.isAdapterRunning()) {
                    await harness.stopAdapter();
                }
                
                await harness.changeAdapterConfig("mqtt-client", {
                    native: {
                        host: brokerConfig.host,
                        port: brokerConfig.port,
                        clientId: 'iobroker-test-client',
                        inbox: 'ioBroker/test',
                        outbox: 'ioBroker/test',
                        enabled: true,
                        ssl: false,
                        websocket: false,
                        reconnectPeriod: 30000
                    }
                });

                console.log("Starting MQTT Client adapter...");
                await harness.startAdapter();
                
                // Wait for MQTT connection establishment
                await new Promise(resolve => setTimeout(resolve, 20000));
                
                const connectionState = await harness.states.getStateAsync("mqtt-client.0.info.connection");
                
                if (connectionState && connectionState.val === true) {
                    console.log("✅ SUCCESS: MQTT Client adapter connected to broker");
                    return true;
                } else {
                    throw new Error("MQTT Client Adapter Test Failed: Expected MQTT connection to be established. " +
                        "Check logs above for specific MQTT errors (DNS resolution, connection refused, authentication, etc.)");
                }
            }).timeout(120000);
        });
    }
});
```

## MQTT-Specific Development Guidelines

### Connection Management
- Implement robust reconnection logic with exponential backoff
- Handle MQTT client lifecycle properly (connect, disconnect, error events)
- Support connection pooling for multiple broker connections
- Implement proper cleanup in adapter unload

### Topic Management
- Validate MQTT topic names according to MQTT specification
- Support topic wildcards for subscriptions (+, #)
- Handle topic prefix configuration for inbox/outbox separation
- Implement topic mapping between ioBroker object IDs and MQTT topics

### Message Handling
- Support different QoS levels (0, 1, 2)
- Handle message retention settings
- Implement proper JSON parsing/serialization for object messages
- Support both string and binary message payloads

### Security Considerations
- Support SSL/TLS encryption with certificate validation
- Implement username/password authentication
- Support client certificate authentication
- Handle encrypted password storage using ioBroker's encryption mechanism

### Performance Optimization
- Implement message queuing for high-throughput scenarios
- Use efficient JSON serialization/deserialization
- Optimize subscription patterns to minimize broker load
- Implement proper error handling to prevent adapter crashes