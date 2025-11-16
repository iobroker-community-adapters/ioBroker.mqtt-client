# ioBroker Adapter Development with GitHub Copilot

**Version:** 0.4.0
**Template Source:** https://github.com/DrozmotiX/ioBroker-Copilot-Instructions

This file contains instructions and best practices for GitHub Copilot when working on ioBroker adapter development.

## Project Context

You are working on an ioBroker adapter. ioBroker is an integration platform for the Internet of Things, focused on building smart home and industrial IoT solutions. Adapters are plugins that connect ioBroker to external systems, devices, or services.

### MQTT Client Adapter Context

This adapter serves as a client to connect ioBroker states to MQTT brokers. It provides bidirectional communication between ioBroker and MQTT brokers with the following key features:

- **Connection Management**: Supports TCP, SSL/TLS, and WebSocket connections to MQTT brokers
- **Topic Management**: Configurable inbox/outbox prefixes for organizing MQTT topics
- **State Synchronization**: Bi-directional sync between ioBroker states and MQTT topics
- **Quality of Service**: Configurable QoS levels for reliable message delivery
- **Advanced Features**: Last Will Testament (LWT), connection status monitoring, and reconnection handling
- **Protocol Support**: MQTT v3.1, v3.1.1, and v5.0 support
- **Data Handling**: JSON object support and custom value transformations

## Testing

### Unit Testing
- Use Jest as the primary testing framework for ioBroker adapters
- Create tests for all adapter main functions and helper methods
- Test error handling scenarios and edge cases
- Mock external API calls and hardware dependencies
- For adapters connecting to APIs/devices not reachable by internet, provide example data files to allow testing of functionality without live connections
- Example test structure:
  ```javascript
  describe('AdapterName', () => {
    let adapter;
    
    beforeEach(() => {
      // Setup test adapter instance
    });
    
    test('should initialize correctly', () => {
      // Test adapter initialization
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

// Define test coordinates or configuration
const TEST_COORDINATES = '52.520008,13.404954'; // Berlin
const wait = ms => new Promise(resolve => setTimeout(resolve, ms));

// Use tests.integration() with defineAdditionalTests
tests.integration(path.join(__dirname, '..'), {
    defineAdditionalTests({ suite }) {
        suite('Test adapter with specific configuration', (getHarness) => {
            let harness;

            before(() => {
                harness = getHarness();
            });

            it('should configure and start adapter', function () {
                return new Promise(async (resolve, reject) => {
                    try {
                        harness = getHarness();
                        
                        // Get adapter object using promisified pattern
                        const obj = await new Promise((res, rej) => {
                            harness.objects.getObject('system.adapter.your-adapter.0', (err, o) => {
                                if (err) return rej(err);
                                res(o);
                            });
                        });
                        
                        if (!obj) {
                            return reject(new Error('Adapter object not found'));
                        }

                        // Configure adapter properties
                        Object.assign(obj.native, {
                            position: TEST_COORDINATES,
                            createCurrently: true,
                            createHourly: true,
                            createDaily: true,
                            // Add other configuration as needed
                        });

                        // Set the updated configuration
                        harness.objects.setObject(obj._id, obj);

                        console.log('✅ Step 1: Configuration written, starting adapter...');
                        
                        // Start adapter and wait
                        await harness.startAdapterAndWait();
                        
                        console.log('✅ Step 2: Adapter started');

                        // Wait for adapter to process data
                        const waitMs = 15000;
                        await wait(waitMs);

                        console.log('🔍 Step 3: Checking states after adapter run...');
                        
                        // Verify expected states exist and have values
                        const states = await harness.states.getObjectListAsync({
                            startkey: harness.adapterName + '.0.',
                            endkey: harness.adapterName + '.0.\u9999'
                        });
                        
                        console.log(`Found ${states.rows.length} states`);
                        
                        // Check specific states based on adapter functionality
                        const connectionState = await harness.states.getStateAsync(harness.adapterName + '.0.info.connection');
                        if (connectionState) {
                            console.log(`✅ Connection state: ${connectionState.val}`);
                        }

                        resolve();
                        
                    } catch (err) {
                        console.error('❌ Test failed:', err);
                        reject(err);
                    }
                });
            }).timeout(60000); // 60 second timeout
        });
    }
});
```

#### Error Handling in Tests
- Always use try-catch blocks in async tests
- Provide meaningful error messages
- Clean up resources in finally blocks or after hooks
- Use appropriate timeouts (60+ seconds for integration tests)

#### Testing MQTT-Specific Functionality

For the MQTT client adapter, create specific tests for:

```javascript
// MQTT connection testing
suite('MQTT Connection Tests', (getHarness) => {
    it('should connect to MQTT broker', async function() {
        const harness = getHarness();
        
        // Configure MQTT settings
        await harness.changeAdapterConfig('mqtt-client', {
            native: {
                host: 'test.mosquitto.org',
                port: 1883,
                clientId: 'iobroker-test-client',
                inbox: 'ioBroker/test',
                outbox: 'ioBroker/test'
            }
        });
        
        await harness.startAdapterAndWait();
        
        // Check connection state
        const connectionState = await harness.states.getStateAsync('mqtt-client.0.info.connection');
        expect(connectionState.val).to.be.true;
    }).timeout(30000);
    
    it('should publish and subscribe to MQTT topics', async function() {
        // Test message flow between ioBroker and MQTT
    }).timeout(30000);
});
```

## Coding Patterns and Architecture

### ioBroker Adapter Structure
All ioBroker adapters should follow this standard structure:

```javascript
'use strict';

const utils = require('@iobroker/adapter-core');

class YourAdapter extends utils.Adapter {
    constructor(options) {
        super({
            ...options,
            name: 'your-adapter-name',
        });
        
        this.on('ready', this.onReady.bind(this));
        this.on('stateChange', this.onStateChange.bind(this));
        this.on('objectChange', this.onObjectChange.bind(this));
        this.on('message', this.onMessage.bind(this));
        this.on('unload', this.onUnload.bind(this));
    }

    async onReady() {
        // Initialize adapter
        this.setState('info.connection', false, true);
        
        // Set up your adapter logic here
    }

    onStateChange(id, state) {
        if (!state) {
            this.log.info(`state ${id} deleted`);
            return;
        }

        if (state.ack === false) {
            // Handle state changes from user/system
        }
    }

    onObjectChange(id, obj) {
        if (obj) {
            this.log.info(`object ${id} changed: ${JSON.stringify(obj)}`);
        } else {
            this.log.info(`object ${id} deleted`);
        }
    }

    onMessage(obj) {
        if (typeof obj === 'object' && obj.message) {
            if (obj.command === 'send') {
                // Handle commands
                this.sendTo(obj.from, obj.command, 'Message received', obj.callback);
            }
        }
    }

    onUnload(callback) {
        try {
            // Clean up resources
            if (this.connectionTimer) {
                clearTimeout(this.connectionTimer);
                this.connectionTimer = undefined;
            }
            // Close connections, clean up resources
            callback();
        } catch (e) {
            callback();
        }
    }
}

if (require.main !== module) {
    module.exports = (options) => new YourAdapter(options);
} else {
    new YourAdapter();
}
```

### MQTT Client Specific Patterns

For MQTT client functionality, follow these patterns:

```javascript
// Connection management
connect() {
    const protocol = `${this.config.websocket ? 'ws' : 'mqtt'}${this.config.ssl ? 's' : ''}`;
    const url = `${protocol}://${this.config.host}:${this.config.port}`;
    
    this.client = mqtt.connect(url, {
        clientId: this.config.clientId,
        username: this.config.username,
        password: this.config.password,
        protocolVersion: this.config.mqttVersion,
        rejectUnauthorized: this.config.rejectUnauthorized
    });
    
    this.client.on('connect', () => this.onMqttConnect());
    this.client.on('message', (topic, message) => this.onMqttMessage(topic, message));
    this.client.on('error', (error) => this.onMqttError(error));
}

// Topic management
convertID2Topic(id, namespace) {
    // Convert ioBroker ID to MQTT topic
    return id.substring(namespace.length + 1).replace(/\./g, '/');
}

convertTopic2ID(topic) {
    // Convert MQTT topic to ioBroker ID
    return topic.replace(/\//g, '.');
}
```

### Error Handling Best Practices
- Always wrap async operations in try-catch blocks
- Log errors with appropriate log levels (error, warn, info, debug)
- Implement graceful degradation for non-critical failures
- Use connection state indicators to show adapter status

```javascript
async onReady() {
    try {
        this.setState('info.connection', false, true);
        await this.initializeAdapter();
        this.log.info('Adapter initialized successfully');
    } catch (error) {
        this.log.error(`Failed to initialize adapter: ${error.message}`);
        this.setState('info.connection', false, true);
    }
}
```

## Code Style and Standards

- Follow JavaScript/TypeScript best practices
- Use async/await for asynchronous operations
- Implement proper resource cleanup in `unload()` method
- Use semantic versioning for adapter releases
- Include proper JSDoc comments for public methods

## CI/CD and Testing Integration

### GitHub Actions for API Testing
For adapters with external API dependencies, implement separate CI/CD jobs:

```yaml
# Tests API connectivity with demo credentials (runs separately)
demo-api-tests:
  if: contains(github.event.head_commit.message, '[skip ci]') == false
  
  runs-on: ubuntu-22.04
  
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
      
    - name: Run demo API tests
      run: npm run test:integration-demo
```

### CI/CD Best Practices
- Run credential tests separately from main test suite
- Use ubuntu-22.04 for consistency
- Don't make credential tests required for deployment
- Provide clear failure messages for API connectivity issues
- Use appropriate timeouts for external API calls (120+ seconds)

### Package.json Script Integration
Add dedicated script for credential testing:
```json
{
  "scripts": {
    "test:integration-demo": "mocha test/integration-demo --exit"
  }
}
```

### Practical Example: Complete API Testing Implementation
Here's a complete example based on lessons learned from the Discovergy adapter:

#### test/integration-demo.js
```javascript
const path = require("path");
const { tests } = require("@iobroker/testing");

// Helper function to encrypt password using ioBroker's encryption method
async function encryptPassword(harness, password) {
    const systemConfig = await harness.objects.getObjectAsync("system.config");
    
    if (!systemConfig || !systemConfig.native || !systemConfig.native.secret) {
        throw new Error("Could not retrieve system secret for password encryption");
    }
    
    const secret = systemConfig.native.secret;
    let result = '';
    for (let i = 0; i < password.length; ++i) {
        result += String.fromCharCode(secret[i % secret.length].charCodeAt(0) ^ password.charCodeAt(i));
    }
    
    return result;
}

// Run integration tests with demo credentials
tests.integration(path.join(__dirname, ".."), {
    defineAdditionalTests({ suite }) {
        suite("API Testing with Demo Credentials", (getHarness) => {
            let harness;
            
            before(() => {
                harness = getHarness();
            });

            it("Should connect to API and initialize with demo credentials", async () => {
                console.log("Setting up demo credentials...");
                
                if (harness.isAdapterRunning()) {
                    await harness.stopAdapter();
                }
                
                const encryptedPassword = await encryptPassword(harness, "demo_password");
                
                await harness.changeAdapterConfig("your-adapter", {
                    native: {
                        username: "demo@provider.com",
                        password: encryptedPassword,
                        // other config options
                    }
                });

                console.log("Starting adapter with demo credentials...");
                await harness.startAdapter();
                
                // Wait for API calls and initialization
                await new Promise(resolve => setTimeout(resolve, 60000));
                
                const connectionState = await harness.states.getStateAsync("your-adapter.0.info.connection");
                
                if (connectionState && connectionState.val === true) {
                    console.log("✅ SUCCESS: API connection established");
                    return true;
                } else {
                    throw new Error("API Test Failed: Expected API connection to be established with demo credentials. " +
                        "Check logs above for specific API errors (DNS resolution, 401 Unauthorized, network issues, etc.)");
                }
            }).timeout(120000);
        });
    }
});
```

### MQTT Testing Considerations

For MQTT client adapters, implement specific tests:

```javascript
// Test MQTT broker connectivity
it("Should connect to public MQTT broker for testing", async () => {
    await harness.changeAdapterConfig("mqtt-client", {
        native: {
            host: "test.mosquitto.org",
            port: 1883,
            clientId: `iobroker-test-${Math.random().toString(36).substr(2, 9)}`,
            inbox: "ioBroker/test/in",
            outbox: "ioBroker/test/out"
        }
    });
    
    await harness.startAdapter();
    await new Promise(resolve => setTimeout(resolve, 5000));
    
    const connectionState = await harness.states.getStateAsync("mqtt-client.0.info.connection");
    expect(connectionState.val).to.be.true;
}).timeout(30000);
```

## ioBroker-Specific Best Practices

### State Management
```javascript
// Always set connection state
this.setState('info.connection', true, true);

// Use proper state objects
await this.setObjectNotExistsAsync('sensors.temperature', {
    type: 'state',
    common: {
        name: 'Temperature',
        type: 'number',
        role: 'value.temperature',
        unit: '°C',
        read: true,
        write: false
    },
    native: {}
});
```

### Configuration Management
```javascript
// Access adapter configuration
const host = this.config.host;
const port = this.config.port || 1883;

// Validate configuration
if (!this.config.host) {
    this.log.error('No MQTT host configured');
    return;
}
```

### Logging Best Practices
```javascript
// Use appropriate log levels
this.log.error('Critical error occurred');
this.log.warn('Warning message');
this.log.info('Information message');
this.log.debug('Debug message (only in debug mode)');

// Include context in log messages
this.log.info(`Connected to MQTT broker at ${this.config.host}:${this.config.port}`);
```

## TypeScript Integration

If using TypeScript, ensure proper type definitions:

```typescript
import { AdapterConfig } from '@iobroker/adapter-core';

interface MqttClientConfig extends AdapterConfig {
    host: string;
    port: number;
    username?: string;
    password?: string;
    ssl: boolean;
    websocket: boolean;
    // ... other config properties
}
```

## Documentation Requirements

### README.md Structure
Ensure your README includes:
- Clear description of adapter functionality
- Installation instructions
- Configuration examples
- Changelog reference
- License information

### Code Documentation
- Use JSDoc comments for public methods
- Include parameter and return type information
- Document complex algorithms and business logic
- Provide usage examples for key functions

```javascript
/**
 * Converts ioBroker object ID to MQTT topic
 * @param {string} id - ioBroker object ID
 * @param {string} namespace - Adapter namespace
 * @returns {string} MQTT topic path
 */
convertID2Topic(id, namespace) {
    return id.substring(namespace.length + 1).replace(/\./g, '/');
}
```