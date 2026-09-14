'use strict';

// A real MQTT broker (aedes) for the tests. aedes does not support MQTT 5 yet.

const net = require('node:net');

class TestBroker {
    /**
     * @param {number} [port] 0 = a free port
     * @returns {Promise<TestBroker>}
     */
    static async start(port = 0) {
        // aedes is an ES module
        const mod = await import('aedes');
        const Aedes = mod.Aedes ?? mod.default;
        const aedes = typeof Aedes.createBroker === 'function' ? await Aedes.createBroker() : new Aedes();
        const server = net.createServer(aedes.handle);
        await new Promise((resolve, reject) => {
            server.once('error', reject);
            server.listen(port, '127.0.0.1', () => resolve());
        });

        const broker = new TestBroker();
        broker.aedes = aedes;
        broker.server = server;
        broker.port = /** @type {net.AddressInfo} */ (server.address()).port;
        return broker;
    }

    /** Disconnects all clients and stops listening */
    async stop() {
        await new Promise(resolve => this.aedes.close(() => resolve()));
        await new Promise(resolve => this.server.close(() => resolve()));
    }
}

module.exports = TestBroker;
