'use strict';

// A second MQTT client connected to the test broker. It plays the remote side: it publishes messages the
// adapter subscribed to and records what the adapter publishes.

const { connectAsync } = require('mqtt');
const { waitFor } = require('./waitFor');

class TestClient {
    /**
     * @param {import('mqtt').MqttClient} client
     */
    constructor(client) {
        this.client = client;
        /** @type {{ topic: string, payload: string, retain: boolean, qos: number }[]} */
        this.messages = [];
        client.on('message', (topic, payload, packet) => {
            this.messages.push({ topic, payload: payload.toString(), retain: !!packet.retain, qos: packet.qos });
        });
    }

    /**
     * @param {number} port
     * @param {string} clientId
     * @param {string | string[]} [subscribe] topics to subscribe to
     * @returns {Promise<TestClient>}
     */
    static async connect(port, clientId, subscribe) {
        const client = await connectAsync(`mqtt://127.0.0.1:${port}`, { clientId, reconnectPeriod: 0 });
        const testClient = new TestClient(client);
        if (subscribe) {
            await client.subscribeAsync(subscribe, { qos: 1 });
        }
        return testClient;
    }

    publish(topic, payload, options = {}) {
        return this.client.publishAsync(topic, payload, { qos: 1, ...options });
    }

    /**
     * @param {string} topic
     * @param {(message: { topic: string, payload: string, retain: boolean }) => boolean} [predicate]
     * @param {number} [timeout]
     */
    waitForMessage(topic, predicate = () => true, timeout = 3000) {
        return waitFor(
            () => this.messages.find(m => m.topic === topic && predicate(m)),
            `message on "${topic}"`,
            timeout,
        );
    }

    /** @param {string} topic */
    messagesOn(topic) {
        return this.messages.filter(m => m.topic === topic);
    }

    end() {
        return this.client.endAsync(true);
    }
}

module.exports = TestClient;
