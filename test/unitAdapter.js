'use strict';

// Tests of the adapter logic in build/main.js - call `npm run build` first.
// @iobroker/adapter-core is replaced by an in-memory mock (test/lib/adapterMock.js). The MQTT side is real:
// a broker (aedes) and a second MQTT client that plays the remote side. No js-controller is needed.
// Set MQTT_CLIENT_TEST_LOG=1 to see the log of the adapter.

const assert = require('node:assert');
const AdapterMock = require('./lib/adapterMock');
const TestBroker = require('./lib/testBroker');
const TestClient = require('./lib/testClient');
const { waitFor, sleep } = require('./lib/waitFor');

// replace @iobroker/adapter-core before the adapter is loaded
const adapterCorePath = require.resolve('@iobroker/adapter-core');
require.cache[adapterCorePath] = {
    id: adapterCorePath,
    filename: adapterCorePath,
    loaded: true,
    exports: { Adapter: AdapterMock },
};
/** @type {(options: { config?: Partial<ioBroker.AdapterConfig> }) => AdapterMock} */
const createAdapter = require('../build/main.js');

const NS = 'mqtt-client.0';

function stateObject(type, custom) {
    const obj = {
        type: 'state',
        common: { name: 'test', type, role: 'state', read: true, write: true },
        native: {},
    };
    if (custom) {
        obj.common.custom = { [NS]: { enabled: true, ...custom } };
    }
    return obj;
}

function countLogs(adapter, level, fragment) {
    return adapter.logs.filter(l => l.level === level && l.message.includes(fragment)).length;
}

function hasLog(adapter, level, fragment) {
    return countLogs(adapter, level, fragment) > 0;
}

describe('mqtt-client adapter', function () {
    this.timeout(10000);

    /** @type {TestBroker} */
    let broker;
    /** @type {AdapterMock[]} */
    let adapters = [];
    /** @type {TestClient[]} */
    let clients = [];
    let counter = 0;

    /**
     * Starts the adapter against the test broker and waits until it is connected and has subscribed
     *
     * @param {Partial<ioBroker.AdapterConfig>} config
     * @param {Record<string, object>} objects objects that exist before the start
     * @param {TestBroker} [useBroker]
     */
    async function startAdapter(config = {}, objects = {}, useBroker = broker) {
        const adapter = createAdapter({
            config: {
                host: '127.0.0.1',
                port: useBroker.port,
                clientId: `adapter-${++counter}`,
                reconnectPeriod: 200,
                inbox: 'in',
                outbox: 'out',
                ...config,
            },
        });
        adapters.push(adapter);
        for (const [id, obj] of Object.entries(objects)) {
            adapter.objects[id] = { ...JSON.parse(JSON.stringify(obj)), _id: id };
        }

        adapter.emit('ready');
        await waitFor(() => adapter.states[`${NS}.info.connection`]?.val === true, 'connection to the broker');
        if (Object.values(objects).some(obj => obj.common.custom?.[NS]?.subscribe)) {
            await waitFor(() => hasLog(adapter, 'debug', 'subscribed to: '), 'initial subscriptions');
        }
        if (config.subscriptions) {
            await waitFor(
                () => hasLog(adapter, 'debug', 'subscribed to additional topics'),
                'additional subscriptions',
            );
        }
        return adapter;
    }

    /** Starts the adapter without a broker configured */
    async function startAdapterWithoutBroker() {
        const adapter = createAdapter({ config: { host: '' } });
        adapters.push(adapter);
        adapter.emit('ready');
        await waitFor(() => adapter.objectsSubscribed, 'object subscription');
        return adapter;
    }

    /**
     * @param {string | string[]} [subscribe]
     * @param {TestBroker} [useBroker]
     */
    async function connectClient(subscribe, useBroker = broker) {
        const client = await TestClient.connect(useBroker.port, `remote-${++counter}`, subscribe);
        clients.push(client);
        return client;
    }

    before(async () => {
        broker = await TestBroker.start();
    });

    afterEach(async () => {
        for (const client of clients) {
            await client.end().catch(() => {});
        }
        for (const adapter of adapters) {
            await adapter.testUnload();
            adapter.testClearTimers();
        }
        clients = [];
        adapters = [];
    });

    after(async () => {
        await broker.stop();
    });

    describe('without broker', () => {
        it('calls the unload callback when no broker is configured', async () => {
            const adapter = await startAdapterWithoutBroker();

            assert.strictEqual(await adapter.testUnload(), true, 'unload callback must be called');
            assert.strictEqual(adapter.states[`${NS}.info.connection`].val, false);
        });

        it('answers the stopInstance message and terminates', async () => {
            const adapter = await startAdapterWithoutBroker();

            adapter.emit('message', { command: 'stopInstance', from: 'system.adapter.admin.0', callback: { id: 1 } });

            await waitFor(() => adapter.terminated, 'terminate()');
            assert.deepStrictEqual(
                adapter.sentMessages.map(m => [m.instance, m.command, m.message]),
                [['system.adapter.admin.0', 'stopInstance', 'Message received']],
            );
        });
    });

    describe('connection', () => {
        it('connects to the broker and sets info.connection', async () => {
            const adapter = await startAdapter();

            assert.strictEqual(adapter.states[`${NS}.info.connection`].ack, true);
        });

        it('publishes the on-connect message retained with the outbox prefix', async () => {
            const remote = await connectClient('iob/status/connect');
            await startAdapter({ outbox: 'iob', onConnectTopic: 'status/connect', onConnectMessage: 'online' });

            const live = await remote.waitForMessage('iob/status/connect');
            assert.strictEqual(live.payload, 'online');

            const late = await connectClient('iob/status/connect');
            const retained = await late.waitForMessage('iob/status/connect');
            assert.strictEqual(retained.payload, 'online');
            assert.strictEqual(retained.retain, true);
        });

        it('publishes the on-disconnect message on unload and calls the unload callback', async () => {
            const remote = await connectClient('out/status/disconnect');
            const adapter = await startAdapter({ onDisconnectTopic: 'status/disconnect', onDisconnectMessage: 'offline' });

            assert.strictEqual(await adapter.testUnload(), true, 'unload callback must be called');
            const msg = await remote.waitForMessage('out/status/disconnect');
            assert.strictEqual(msg.payload, 'offline');
            assert.strictEqual(adapter.states[`${NS}.info.connection`].val, false);
        });

        it('lets the broker publish the last will when the connection breaks', async () => {
            const remote = await connectClient('out/status/will');
            const adapter = await startAdapter({ lastWillTopic: 'status/will', lastWillMessage: 'gone' });

            // break the connection without a DISCONNECT packet
            adapter.client.stream.destroy();

            const msg = await remote.waitForMessage('out/status/will');
            assert.strictEqual(msg.payload, 'gone');
        });

        it('sets info.connection to false while the broker is down and reconnects', async () => {
            const ownBroker = await TestBroker.start();
            const port = ownBroker.port;
            const adapter = await startAdapter({}, {}, ownBroker);

            await ownBroker.stop();
            await waitFor(() => adapter.states[`${NS}.info.connection`].val === false, 'connection lost');

            const restarted = await TestBroker.start(port);
            try {
                await waitFor(() => adapter.states[`${NS}.info.connection`].val === true, 'reconnected', 5000);
            } finally {
                await adapter.testUnload();
                await restarted.stop();
            }
        });
    });

    describe('publish (ioBroker -> broker)', () => {
        it('publishes a state change to the derived topic with the outbox prefix', async () => {
            const remote = await connectClient('out/#');
            const adapter = await startAdapter({}, { 'javascript.0.pub1': stateObject('number', { publish: true }) });

            adapter.testSetState('javascript.0.pub1', 42);

            const msg = await remote.waitForMessage('out/javascript/0/pub1');
            assert.strictEqual(msg.payload, '42');
        });

        it('replaces "#", "+", "/" and whitespace of the id in the derived topic', async () => {
            const id = 'shelly.0.SHSW-1#B96701#1.Relay 0.Switch';
            const remote = await connectClient('out/#');
            const adapter = await startAdapter({}, { [id]: stateObject('boolean', { publish: true }) });

            adapter.testSetState(id, true);

            const msg = await remote.waitForMessage('out/shelly/0/SHSW-1_B96701_1/Relay_0/Switch');
            assert.strictEqual(msg.payload, 'true');
        });

        it('publishes the whole state as JSON with "as object"', async () => {
            const remote = await connectClient('out/#');
            const adapter = await startAdapter(
                {},
                { 'javascript.0.pub2': stateObject('boolean', { publish: true, pubAsObject: true }) },
            );

            adapter.testSetState('javascript.0.pub2', true);

            const msg = await remote.waitForMessage('out/javascript/0/pub2');
            const state = JSON.parse(msg.payload);
            assert.strictEqual(state.val, true);
            assert.strictEqual(state.ack, false);
            assert.strictEqual(state.from, 'system.adapter.javascript.0');
        });

        it('uses the configured topic and retain', async () => {
            const remote = await connectClient('out/house/light');
            const adapter = await startAdapter(
                {},
                { 'javascript.0.pub3': stateObject('string', { publish: true, topic: 'house/light', retain: true }) },
            );

            adapter.testSetState('javascript.0.pub3', 'on');
            await remote.waitForMessage('out/house/light');

            const late = await connectClient('out/house/light');
            const retained = await late.waitForMessage('out/house/light');
            assert.strictEqual(retained.payload, 'on');
            assert.strictEqual(retained.retain, true);
        });

        it('publishes only changed values with "changes only"', async () => {
            const remote = await connectClient('out/#');
            const adapter = await startAdapter(
                {},
                { 'javascript.0.pub4': stateObject('number', { publish: true, pubChangesOnly: true }) },
            );

            adapter.testSetState('javascript.0.pub4', 1);
            await remote.waitForMessage('out/javascript/0/pub4', m => m.payload === '1');
            await sleep(5);
            adapter.testSetState('javascript.0.pub4', 1);
            await sleep(5);
            adapter.testSetState('javascript.0.pub4', 2);
            await remote.waitForMessage('out/javascript/0/pub4', m => m.payload === '2');

            assert.deepStrictEqual(
                remote.messagesOn('out/javascript/0/pub4').map(m => m.payload),
                ['1', '2'],
            );
        });

        it('does not publish values written by the adapter itself', async () => {
            const remote = await connectClient('out/#');
            const adapter = await startAdapter({}, { 'javascript.0.pub5': stateObject('number', { publish: true }) });

            adapter.testSetState('javascript.0.pub5', 5, { from: `system.adapter.${NS}` });
            adapter.testSetState('javascript.0.pub5', 6);
            await remote.waitForMessage('out/javascript/0/pub5', m => m.payload === '6');

            assert.deepStrictEqual(
                remote.messagesOn('out/javascript/0/pub5').map(m => m.payload),
                ['6'],
            );
        });

        it('publishes an empty payload when the state is deleted', async () => {
            const remote = await connectClient('out/#');
            const adapter = await startAdapter({}, { 'javascript.0.pub6': stateObject('number', { publish: true }) });

            adapter.testSetState('javascript.0.pub6', 1);
            await remote.waitForMessage('out/javascript/0/pub6', m => m.payload === '1');
            adapter.testDeleteState('javascript.0.pub6');

            await remote.waitForMessage('out/javascript/0/pub6', m => m.payload === '');
        });

        it('clears the retained message when a state published with retain is deleted', async () => {
            const id = 'javascript.0.pub7';
            const remote = await connectClient('out/javascript/0/pub7');
            const adapter = await startAdapter({}, { [id]: stateObject('string', { publish: true, retain: true }) });

            adapter.testSetState(id, 'on');
            await remote.waitForMessage('out/javascript/0/pub7', m => m.payload === 'on');
            adapter.testDeleteState(id);
            await remote.waitForMessage('out/javascript/0/pub7', m => m.payload === '');

            const late = await connectClient('out/javascript/0/pub7');
            await sleep(300);
            assert.deepStrictEqual(late.messagesOn('out/javascript/0/pub7'), [], 'no retained message may be left');
        });

        it('publishes the current value once when an object is enabled at runtime', async () => {
            const remote = await connectClient('out/#');
            const adapter = await startAdapter();
            adapter.testSetState('javascript.0.late', 7);

            adapter.testSetObject('javascript.0.late', stateObject('number', { publish: true }));

            const msg = await remote.waitForMessage('out/javascript/0/late');
            assert.strictEqual(msg.payload, '7');
        });
    });

    describe('subscribe (broker -> ioBroker)', () => {
        it('converts received values to the type of the object and sets ack', async () => {
            const cases = [
                ['number', '12,5', 12.5],
                ['number', 'true', 1],
                ['number', 'abc', 0],
                ['boolean', '1', true],
                ['boolean', 'false', false],
                ['boolean', 'yes', true],
                ['string', 'hello', 'hello'],
                ['mixed', '42', '42'],
                ['number', 'null', null],
            ];
            const objects = {};
            cases.forEach(([type], i) => (objects[`javascript.0.conv${i}`] = stateObject(type, { subscribe: true })));
            const remote = await connectClient();
            const adapter = await startAdapter({}, objects);

            for (let i = 0; i < cases.length; i++) {
                await remote.publish(`in/javascript/0/conv${i}`, cases[i][1]);
            }

            for (let i = 0; i < cases.length; i++) {
                const [type, payload, expected] = cases[i];
                const state = await waitFor(() => adapter.states[`javascript.0.conv${i}`], `state conv${i}`);
                assert.strictEqual(state.val, expected, `${type} "${payload}"`);
                assert.strictEqual(state.ack, true);
            }
        });

        it('sets ack=false when "ack" is disabled', async () => {
            const remote = await connectClient();
            const adapter = await startAdapter(
                {},
                { 'javascript.0.sub1': stateObject('number', { subscribe: true, setAck: false }) },
            );

            await remote.publish('in/javascript/0/sub1', '3');

            const state = await waitFor(() => adapter.states['javascript.0.sub1'], 'state');
            assert.strictEqual(state.val, 3);
            assert.strictEqual(state.ack, false);
        });

        it('uses the configured topic', async () => {
            const remote = await connectClient();
            const adapter = await startAdapter(
                {},
                { 'javascript.0.sub2': stateObject('string', { subscribe: true, topic: 'my/explicit/topic' }) },
            );

            await remote.publish('in/my/explicit/topic', 'x');

            const state = await waitFor(() => adapter.states['javascript.0.sub2'], 'state');
            assert.strictEqual(state.val, 'x');
        });

        it('writes a received value to an id with "#" in it instead of creating a new state', async () => {
            const id = 'shelly.0.SHSW-1#B96701#1.Relay0.Switch';
            const remote = await connectClient();
            const adapter = await startAdapter({}, { [id]: stateObject('boolean', { subscribe: true }) });

            await remote.publish('in/shelly/0/SHSW-1_B96701_1/Relay0/Switch', 'true');

            const state = await waitFor(() => adapter.states[id], 'state');
            assert.strictEqual(state.val, true);
            assert.deepStrictEqual(
                Object.keys(adapter.objects).filter(key => key.startsWith(`${NS}.`)),
                [],
                'no state may be created in the own namespace',
            );
        });

        it('warns when two ids derive to the same topic', async () => {
            const adapter = await startAdapter(
                {},
                {
                    'javascript.0.a#b': stateObject('string', { subscribe: true }),
                    'javascript.0.a+b': stateObject('string', { subscribe: true }),
                },
            );

            assert.ok(
                hasLog(adapter, 'warn', 'topic "javascript/0/a_b" is used by javascript.0.a#b and javascript.0.a+b'),
                'collision warning expected',
            );
        });

        it('writes only changed values with "changes only"', async () => {
            const id = 'javascript.0.sub3';
            const remote = await connectClient();
            const adapter = await startAdapter(
                {},
                { [id]: stateObject('number', { subscribe: true, subChangesOnly: true }) },
            );
            adapter.states[id] = { val: 5, ack: true, ts: 1000, lc: 1000, from: 'system.adapter.javascript.0' };

            await remote.publish('in/javascript/0/sub3', '5');
            await waitFor(() => hasLog(adapter, 'debug', 'value did not change'), 'unchanged value skipped');
            assert.strictEqual(adapter.states[id].ts, 1000, 'the unchanged value must not be written');

            await remote.publish('in/javascript/0/sub3', '6');
            await waitFor(() => adapter.states[id].val === 6, 'changed value written');
        });

        it('does not write back an unchanged value it publishes to the same topic (loop protection)', async () => {
            const id = 'javascript.0.loop';
            const adapter = await startAdapter(
                { inbox: 'iob', outbox: 'iob' },
                { [id]: stateObject('number', { publish: true, subscribe: true }) },
            );

            // the adapter publishes the value and receives its own message
            adapter.testSetState(id, 3);

            await waitFor(
                () => hasLog(adapter, 'debug', 'value did not change (loop protection)'),
                'loop protection',
            );
            assert.strictEqual(adapter.states[id].from, 'system.adapter.javascript.0');
            assert.strictEqual(adapter.states[id].ack, false);
        });

        it('stops writing received values after syncing was disabled', async () => {
            const id = 'javascript.0.sub4';
            const remote = await connectClient();
            const adapter = await startAdapter({}, { [id]: stateObject('string', { subscribe: true }) });
            await remote.publish('in/javascript/0/sub4', 'first');
            await waitFor(() => adapter.states[id]?.val === 'first', 'first value');

            adapter.testSetObject(id, stateObject('string', { subscribe: true, enabled: false }));
            await waitFor(() => hasLog(adapter, 'debug', 'unsubscribed from javascript/0/sub4'), 'unsubscribed');

            await remote.publish('in/javascript/0/sub4', 'second');
            await sleep(300);
            assert.strictEqual(adapter.states[id].val, 'first');
        });

        describe('as object', () => {
            it('writes a received JSON state and sets ack', async () => {
                const id = 'javascript.0.obj1';
                const remote = await connectClient();
                const adapter = await startAdapter(
                    {},
                    { [id]: stateObject('number', { subscribe: true, subAsObject: true }) },
                );

                await remote.publish(
                    'in/javascript/0/obj1',
                    JSON.stringify({ val: 10, ack: false, from: 'system.adapter.other.0' }),
                );

                const state = await waitFor(() => adapter.states[id], 'state');
                assert.strictEqual(state.val, 10);
                assert.strictEqual(state.ack, true, '"ack" is enabled by default');
                assert.strictEqual(state.from, `system.adapter.${NS}`, '"from" of the message is removed');
            });

            it('ignores a state that is not newer than the current one', async () => {
                const id = 'javascript.0.obj2';
                const remote = await connectClient();
                const adapter = await startAdapter(
                    {},
                    { [id]: stateObject('number', { subscribe: true, subAsObject: true }) },
                );
                const now = Date.now();
                adapter.states[id] = { val: 1, ack: true, ts: now, lc: now, from: 'system.adapter.javascript.0' };

                await remote.publish('in/javascript/0/obj2', JSON.stringify({ val: 2, ts: now - 1000 }));

                await waitFor(() => hasLog(adapter, 'debug', 'object ts not newer'), 'older state ignored');
                assert.strictEqual(adapter.states[id].val, 1);
            });

            it('skips an unchanged value and writes a changed one with "changes only"', async () => {
                const id = 'javascript.0.obj3';
                const remote = await connectClient();
                const adapter = await startAdapter(
                    {},
                    { [id]: stateObject('number', { subscribe: true, subAsObject: true, subChangesOnly: true }) },
                );
                adapter.states[id] = { val: 5, ack: true, ts: 1000, lc: 1000, from: 'system.adapter.javascript.0' };

                await remote.publish('in/javascript/0/obj3', JSON.stringify({ val: 5 }));
                await waitFor(() => hasLog(adapter, 'debug', 'object value did not change: '), 'unchanged value skipped');
                assert.strictEqual(adapter.states[id].ts, 1000, 'the unchanged value must not be written');

                await remote.publish('in/javascript/0/obj3', JSON.stringify({ val: 6 }));
                await waitFor(() => adapter.states[id].val === 6, 'changed value written');
            });

            it('writes the value when the state does not exist yet', async () => {
                const id = 'javascript.0.obj4';
                const remote = await connectClient();
                const adapter = await startAdapter(
                    {},
                    { [id]: stateObject('number', { subscribe: true, subAsObject: true, subChangesOnly: true }) },
                );

                await remote.publish('in/javascript/0/obj4', JSON.stringify({ val: 1 }));

                const state = await waitFor(() => adapter.states[id], 'state');
                assert.strictEqual(state.val, 1);
            });

            it('warns about invalid JSON and about a state without val', async () => {
                const remote = await connectClient();
                const adapter = await startAdapter(
                    {},
                    { 'javascript.0.obj5': stateObject('number', { subscribe: true, subAsObject: true }) },
                );

                await remote.publish('in/javascript/0/obj5', 'no json');
                await remote.publish('in/javascript/0/obj5', JSON.stringify({ ack: true }));

                await waitFor(() => hasLog(adapter, 'warn', 'could not parse message as object: no json'), 'parse warning');
                await waitFor(() => hasLog(adapter, 'warn', 'no value in object'), 'no value warning');
                assert.strictEqual(adapter.states['javascript.0.obj5'], undefined);
            });
        });
    });

    describe('additional subscriptions', () => {
        it('creates a state for a received unknown topic and writes the following values', async () => {
            const id = `${NS}.sensors.temp`;
            const remote = await connectClient();
            const adapter = await startAdapter({ subscriptions: 'sensors/#' });

            await remote.publish('in/sensors/temp', '21');

            const obj = await waitFor(() => adapter.objects[id], 'created object');
            assert.strictEqual(obj.type, 'state');
            assert.strictEqual(obj.common.type, 'mixed');
            assert.strictEqual(obj.common.role, 'text');
            assert.strictEqual(obj.role, undefined, 'role belongs to common');
            assert.strictEqual(obj.native.topic, 'sensors/temp');
            assert.strictEqual(obj.common.custom[NS].topic, 'sensors/temp');
            assert.strictEqual(obj.common.custom[NS].subscribe, true);

            await waitFor(() => hasLog(adapter, 'debug', `subscribed to {"sensors/temp":0}`), 'object registered');
            // the message that creates the state is not written
            assert.strictEqual(adapter.states[id], undefined);

            await remote.publish('in/sensors/temp', '22');
            const state = await waitFor(() => adapter.states[id], 'state');
            assert.strictEqual(state.val, '22');
            assert.strictEqual(state.ack, true);
        });

        it('creates the state only once for messages received before the object is registered', async () => {
            const remote = await connectClient();
            const adapter = await startAdapter({ subscriptions: 'sensors/#' });

            await Promise.all([
                remote.publish('in/sensors/burst', '1'),
                remote.publish('in/sensors/burst', '2'),
                remote.publish('in/sensors/burst', '3'),
            ]);

            await waitFor(() => adapter.objects[`${NS}.sensors.burst`], 'created object');
            await sleep(300);
            assert.strictEqual(countLogs(adapter, 'debug', 'created and subscribed to new state: sensors.burst'), 1);
        });

        it('creates the state again after it was deleted', async () => {
            const id = `${NS}.sensors.gone`;
            const remote = await connectClient();
            const adapter = await startAdapter({ subscriptions: 'sensors/#' });

            await remote.publish('in/sensors/gone', 'a');
            await waitFor(() => hasLog(adapter, 'debug', `enabled syncing of ${id}`), 'object registered');

            adapter.testDeleteObject(id);
            await waitFor(() => hasLog(adapter, 'debug', `disabled syncing of ${id}`), 'object removed');
            assert.strictEqual(adapter.objects[id], undefined);

            await remote.publish('in/sensors/gone', 'b');

            await waitFor(() => adapter.objects[id], 'object created again');
            assert.strictEqual(countLogs(adapter, 'debug', 'created and subscribed to new state: sensors.gone'), 2);
        });
    });
});
