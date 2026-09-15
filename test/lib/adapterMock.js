'use strict';

// Stand-in for the `Adapter` class of @iobroker/adapter-core. It keeps objects and states in memory and emits
// the events js-controller would emit, so build/main.js can be tested without a js-controller.
// Only the methods used by src/main.ts are implemented. Methods starting with `test` are helpers for the tests.

const { EventEmitter } = require('node:events');
const { native } = require('../../io-package.json');

/**
 * @param {string} pattern id pattern with "*"
 * @returns {RegExp}
 */
function patternToRegExp(pattern) {
    return new RegExp(`^${pattern.split('*').map(part => part.replace(/[.+?^${}()|[\]\\]/g, '\\$&')).join('.*')}$`);
}

class AdapterMock extends EventEmitter {
    /**
     * @param {{ name: string, config?: Partial<ioBroker.AdapterConfig> }} options
     */
    constructor(options) {
        super();
        this.name = options.name;
        this.namespace = `${options.name}.0`;
        this.config = { ...JSON.parse(JSON.stringify(native)), ...(options.config || {}) };

        /** @type {Record<string, ioBroker.Object>} */
        this.objects = {};
        /** @type {Record<string, ioBroker.State>} */
        this.states = {};
        /** @type {{ level: string, message: string }[]} */
        this.logs = [];
        /** @type {{ instance: string, command: string, message: unknown, callback: unknown }[]} */
        this.sentMessages = [];
        /** @type {{ reason?: string, exitCode?: number } | null} */
        this.terminated = null;

        this.subscribedStates = new Set();
        /** @type {RegExp[]} */
        this.subscribedStatePatterns = [];
        this.objectsSubscribed = false;
        this.timers = new Set();

        const log = level => message => {
            this.logs.push({ level, message });
            if (process.env.MQTT_CLIENT_TEST_LOG) {
                console.log(`    [${level}] ${message}`);
            }
        };
        this.log = { silly: log('silly'), debug: log('debug'), info: log('info'), warn: log('warn'), error: log('error') };
    }

    fullId(id) {
        return id.startsWith(`${this.namespace}.`) ? id : `${this.namespace}.${id}`;
    }

    // ---- states

    isStateSubscribed(id) {
        return this.subscribedStates.has(id) || this.subscribedStatePatterns.some(re => re.test(id));
    }

    writeState(id, state, from) {
        const now = Date.now();
        const old = this.states[id];
        const stored = {
            val: state.val,
            ack: !!state.ack,
            ts: state.ts ?? now,
            lc: state.lc ?? (old && old.val === state.val ? old.lc : now),
            from: state.from ?? from,
            q: 0,
        };
        this.states[id] = stored;
        if (this.isStateSubscribed(id)) {
            setImmediate(() => this.emit('stateChange', id, stored));
        }
        return stored;
    }

    setState(id, state, ack) {
        const st = state !== null && typeof state === 'object' ? state : { val: state, ack };
        this.writeState(this.fullId(id), st, `system.adapter.${this.namespace}`);
        return Promise.resolve(this.fullId(id));
    }

    setForeignState(id, state, ack) {
        const st = state !== null && typeof state === 'object' ? state : { val: state, ack };
        this.writeState(id, st, `system.adapter.${this.namespace}`);
        return Promise.resolve(id);
    }

    setForeignStateAsync(id, state, ack) {
        return this.setForeignState(id, state, ack);
    }

    getStateAsync(id) {
        return Promise.resolve(this.states[this.fullId(id)] ?? null);
    }

    getForeignStateAsync(id) {
        return Promise.resolve(this.states[id] ?? null);
    }

    subscribeForeignStatesAsync(id) {
        this.subscribedStates.add(id);
        return Promise.resolve();
    }

    unsubscribeForeignStatesAsync(id) {
        this.subscribedStates.delete(id);
        return Promise.resolve();
    }

    subscribeStatesAsync(pattern) {
        this.subscribedStatePatterns.push(patternToRegExp(this.fullId(pattern)));
        return Promise.resolve();
    }

    // ---- objects

    getForeignObjectAsync(id) {
        return Promise.resolve(this.objects[id] ? JSON.parse(JSON.stringify(this.objects[id])) : null);
    }

    setObjectNotExistsAsync(id, obj) {
        return this.setForeignObjectNotExistsAsync(this.fullId(id), obj);
    }

    setForeignObjectNotExistsAsync(id, obj) {
        if (!this.objects[id]) {
            this.storeObject(id, obj);
        }
        return Promise.resolve({ id });
    }

    getObjectViewAsync(design, search, params = {}) {
        const rows = [];
        if (design === 'system' && search === 'custom') {
            for (const [id, obj] of Object.entries(this.objects)) {
                if (obj.common?.custom) {
                    rows.push({ id, value: JSON.parse(JSON.stringify(obj.common.custom)) });
                }
            }
        } else if (design === 'system') {
            // views by object type, e.g. "state" or "channel", filtered by startkey/endkey
            for (const [id, obj] of Object.entries(this.objects)) {
                if (
                    obj.type === search &&
                    (params.startkey === undefined || id >= params.startkey) &&
                    (params.endkey === undefined || id <= params.endkey)
                ) {
                    rows.push({ id, value: JSON.parse(JSON.stringify(obj)) });
                }
            }
        }
        return Promise.resolve({ rows });
    }

    subscribeForeignObjectsAsync() {
        this.objectsSubscribed = true;
        return Promise.resolve();
    }

    storeObject(id, obj) {
        const stored = { ...JSON.parse(JSON.stringify(obj)), _id: id };
        this.objects[id] = stored;
        if (this.objectsSubscribed) {
            // js-controller delivers a copy of the object
            setImmediate(() => this.emit('objectChange', id, JSON.parse(JSON.stringify(stored))));
        }
    }

    // ---- misc

    setTimeout(callback, timeout, ...args) {
        const timer = setTimeout(() => {
            this.timers.delete(timer);
            callback(...args);
        }, timeout);
        this.timers.add(timer);
        return timer;
    }

    clearTimeout(timer) {
        clearTimeout(timer);
        this.timers.delete(timer);
    }

    terminate(reason, exitCode) {
        this.terminated = { reason, exitCode };
    }

    sendTo(instance, command, message, callback) {
        this.sentMessages.push({ instance, command, message, callback });
    }

    // ---- helpers for the tests

    /** Creates or changes an object like another adapter or the admin would do */
    testSetObject(id, obj) {
        this.storeObject(id, obj);
    }

    /** Deletes an object like the admin would do */
    testDeleteObject(id) {
        delete this.objects[id];
        if (this.objectsSubscribed) {
            setImmediate(() => this.emit('objectChange', id, null));
        }
    }

    /** Writes a state like another adapter would do */
    testSetState(id, val, options = {}) {
        return this.writeState(id, { val, ack: false, from: 'system.adapter.javascript.0', ...options });
    }

    /** Deletes a state (e.g. expired) like js-controller would do */
    testDeleteState(id) {
        delete this.states[id];
        if (this.isStateSubscribed(id)) {
            setImmediate(() => this.emit('stateChange', id, null));
        }
    }

    testLogs(level) {
        return this.logs.filter(l => l.level === level).map(l => l.message);
    }

    /**
     * Emits `unload` like js-controller
     *
     * @param {number} timeout milliseconds to wait for the callback
     * @returns {Promise<boolean>} true if the adapter called the callback in time
     */
    testUnload(timeout = 2000) {
        return new Promise(resolve => {
            const timer = setTimeout(() => resolve(false), timeout);
            this.emit('unload', () => {
                clearTimeout(timer);
                resolve(true);
            });
        });
    }

    testClearTimers() {
        for (const timer of this.timers) {
            clearTimeout(timer);
        }
        this.timers.clear();
    }
}

module.exports = AdapterMock;
