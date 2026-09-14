import { Adapter, type AdapterOptions } from '@iobroker/adapter-core';
import {
    connect,
    type IClientOptions,
    type IClientPublishOptions,
    type ISubscriptionMap,
    type MqttClient as MqttConnection,
} from 'mqtt';

import { convertID2Topic, convertTopic2ID } from './lib/topics';
import type { MqttCustomSettings, StateMessage } from './lib/types';

// mqtt does not re-export these types from mqtt-packet
type QoS = NonNullable<IClientPublishOptions['qos']>;
type MqttProtocolVersion = NonNullable<IClientOptions['protocolVersion']>;

class MqttClient extends Adapter {
    /** cache of the mqtt-client settings of all enabled objects */
    private readonly custom: Record<string, MqttCustomSettings> = {};
    /** subscribed mqtt topics (without prefix) and their QoS */
    private readonly subTopics: Record<string, number> = {};
    /** maps mqtt topics to ioBroker ids */
    private readonly topic2id: Record<string, string> = {};
    /** additional mqtt topics to subscribe to (`config.subscriptions`) and their QoS */
    private readonly addTopics: Record<string, number> = {};
    /** received mqtt topics (without prefix) for which a new object was created */
    private readonly addedTopics = new Set<string>();

    private brokerConnected = false;
    private client: MqttConnection | null = null;
    /** ioBroker ids whose state changes are subscribed */
    private readonly iobSubscribes: string[] = [];
    private adapterFinished = false;

    public constructor(options: Partial<AdapterOptions> = {}) {
        super({
            ...options,
            name: 'mqtt-client',
        });

        this.on('ready', () => this.onReady());
        this.on('objectChange', (id, obj) => this.onObjectChange(id, obj));
        this.on('stateChange', (id, state) => this.onStateChange(id, state));
        this.on('message', obj => this.onMessage(obj));
        this.on('unload', callback => this.onUnload(callback));
    }

    private onBrokerConnect(): void {
        this.log.info('connected to broker');

        if (!this.brokerConnected) {
            this.brokerConnected = true;
            void this.setState('info.connection', true, true);
        }

        if (this.config.onConnectTopic && this.config.onConnectMessage) {
            const topic = this.config.onConnectTopic;

            this.client?.publish(
                this.topicAddPrefixOut(topic),
                this.config.onConnectMessage,
                { qos: 2, retain: true },
                () =>
                    this.log.debug(
                        `successfully published ${JSON.stringify({
                            topic: topic,
                            message: this.config.onConnectMessage,
                        })}`,
                    ),
            );
        }

        //initially subscribe to topics
        if (Object.keys(this.subTopics).length) {
            this.subscribeTopics(this.subTopics, () =>
                this.log.debug(`subscribed to: ${JSON.stringify(this.subTopics)}`),
            );
        }

        if (Object.keys(this.addTopics).length) {
            this.subscribeTopics(this.addTopics, () =>
                this.log.debug(`subscribed to additional topics: ${JSON.stringify(this.addTopics)}`),
            );
        }
    }

    private onBrokerReconnect(): void {
        this.log.debug('trying to reconnect to broker');
    }

    private onBrokerDisconnect(): void {
        if (this.brokerConnected) {
            this.brokerConnected = false;
            void this.setState('info.connection', false, true);
        }
        this.log.warn('disconnected from broker');
    }

    private onBrokerOffline(): void {
        if (this.brokerConnected) {
            this.brokerConnected = false;
            void this.setState('info.connection', false, true);
        }
        this.log.warn('client offline');
    }

    private onBrokerError(err: Error): void {
        this.log.warn(`client error: ${String(err)}`);
    }

    private async onBrokerMessage(topic: string, payload: Buffer): Promise<void> {
        const msg = payload.toString();

        topic = this.topicRemovePrefixIn(topic);

        // if topic2id[topic] does not exist, automatically convert topic to id with guiding adapter namespace
        const id = this.topic2id[topic] || convertTopic2ID(topic);

        this.log.debug(`received message ${msg} for id ${id}=>${JSON.stringify(this.custom[id])}`);

        if (this.topic2id[topic] && this.custom[id]?.subscribe) {
            if (this.custom[id].subAsObject) {
                void this.setStateObj(id, msg);
            } else {
                void this.setStateVal(id, msg);
            }
        } else if (!this.addedTopics.has(topic)) {
            // prevents the object from being created again until onObjectChange() has added the topic to topic2id.
            // onObjectChange() removes the topic again when the object is deleted or its syncing is disabled.
            this.addedTopics.add(topic);
            const obj: ioBroker.SettableStateObject = {
                type: 'state',
                common: {
                    name: id.split('.').pop() as string,
                    type: 'mixed',
                    role: 'text',
                    read: true,
                    write: true,
                    desc: 'created from topic',
                    custom: {
                        [this.namespace]: {
                            enabled: true,
                            topic,
                            publish: false,
                            pubChangesOnly: false,
                            pubAsObject: false,
                            qos: 0,
                            retain: false,
                            subscribe: true,
                            subChangesOnly: false,
                            subAsObject: false,
                            subQos: 0,
                            setAck: true,
                        },
                    },
                },
                native: {
                    topic,
                },
            };

            try {
                await this.setObjectNotExistsAsync(id, obj);
                this.log.debug(`created and subscribed to new state: ${id}`);
                // onObjectChange should now receive this object
            } catch (e) {
                // allow another attempt with the next message
                this.addedTopics.delete(topic);
                this.log.error(`Cannot create state ${id} for topic "${topic}": ${(e as Error).message}`);
            }
        } else {
            this.log.debug('state already exists');
        }
    }

    private async setStateObj(id: string, msg: string): Promise<void> {
        let state: ioBroker.State | null | undefined;
        try {
            state = await this.getForeignStateAsync(id);
        } catch {
            state = undefined;
        }

        try {
            const obj = JSON.parse(msg) as StateMessage;
            this.log.debug(JSON.stringify(obj));

            if (Object.prototype.hasOwnProperty.call(obj, 'val')) {
                if (Object.prototype.hasOwnProperty.call(obj, 'ts') && state && obj.ts! <= state.ts) {
                    this.log.debug(`object ts not newer than current state ts: ${msg}`);
                    return;
                }
                if (Object.prototype.hasOwnProperty.call(obj, 'lc') && state && obj.lc! < state.lc) {
                    this.log.debug(`object lc not newer than current state lc: ${msg}`);
                    return;
                }
                // todo: !== correct???
                // Intentionally kept from the JS version: if the state does not exist yet, accessing
                // `state.val` throws and the message is reported as "could not parse" below.
                if (
                    this.config.inbox === this.config.outbox &&
                    this.custom[id].publish &&
                    !Object.prototype.hasOwnProperty.call(obj, 'ts') &&
                    !Object.prototype.hasOwnProperty.call(obj, 'lc') &&
                    obj.val !== (state as ioBroker.State).val
                ) {
                    this.log.debug(`object value did not change (loop protection): ${msg}`);
                    return;
                }
                // todo: !== correct???
                if (this.custom[id].subChangesOnly && obj.val !== (state as ioBroker.State).val) {
                    this.log.debug(`object value did not change: ${msg}`);
                    return;
                }
                if (this.custom[id].setAck) {
                    obj.ack = true;
                }
                delete obj.from;
                void this.setForeignState(id, obj as ioBroker.SettableState);
                this.log.debug(`object set (as object) to ${JSON.stringify(obj)}`);
                return;
            }
            this.log.warn(`no value in object: ${msg}`);
        } catch {
            this.log.warn(`could not parse message as object: ${msg}`);
        }
    }

    private async setStateVal(id: string, msg: string): Promise<void> {
        let state: ioBroker.State | null | undefined;
        try {
            state = await this.getForeignStateAsync(id);
        } catch {
            state = undefined;
        }

        if (state && this.val2String(state.val) === msg) {
            if (this.config.inbox === this.config.outbox && this.custom[id]?.publish) {
                this.log.debug('value did not change (loop protection)');
                return;
            } else if (this.custom[id]?.subChangesOnly) {
                this.log.debug('value did not change');
                return;
            }
        }
        // `val` is undefined for the message "undefined" - kept from the JS version
        const _state = {
            val: this.stringToVal(id, msg),
            ack: this.custom[id]?.setAck,
        } as ioBroker.SettableState;
        void this.setForeignState(id, _state);
        this.log.debug(`value of ${id} set to ${JSON.stringify(_state)}`);
    }

    private publishState(id: string, state: ioBroker.State): void {
        if (!this.client) {
            return;
        }
        const settings = this.custom[id];
        if (!settings || !state) {
            return;
        }
        if (settings.pubState && settings.pubChangesOnly && state.ts !== state.lc) {
            return;
        }

        settings.pubState = state;
        this.log.debug(`publishing ${id}`);

        const topic = settings.topic;

        const message = settings.pubAsObject ? JSON.stringify(state) : this.val2String(state.val);

        this.client.publish(
            this.topicAddPrefixOut(topic),
            message,
            { qos: settings.qos as QoS, retain: settings.retain },
            () => this.log.debug(`successfully published ${id}: ${JSON.stringify({ topic: topic, message: message })}`),
        );
    }

    private topicAddPrefixOut(topic: string): string {
        //add outgoing prefix
        return this.config.outbox ? `${this.config.outbox}/${topic}` : topic;
    }

    private topicAddPrefixIn(topic: string): string {
        //add incoming prefix
        return this.config.inbox ? `${this.config.inbox}/${topic}` : topic;
    }

    private topicRemovePrefixIn(topic: string): string {
        if (this.config.inbox && topic.substring(0, this.config.inbox.length) === this.config.inbox) {
            topic = topic.substring(this.config.inbox.length + 1);
        }
        return topic;
    }

    private unpublish(id: string): void {
        if (!this.client) {
            return;
        }
        const settings = this.custom[id];
        if (!settings) {
            return;
        }

        settings.pubState = null;
        this.log.debug(`unpublishing ${id}`);

        const topic = settings.topic;

        // an empty payload deletes the retained message (the JS version passed `null`, which mqtt sends as empty payload)
        this.client.publish(this.topicAddPrefixOut(topic), '', { qos: settings.qos as QoS, retain: false }, () =>
            this.log.debug(`successfully unpublished ${id}`),
        );
    }

    private subscribeTopics(topics: Record<string, number>, callback: () => void): void {
        if (!this.client) {
            return;
        }
        const subTopics: ISubscriptionMap = {};

        for (const key of Object.keys(topics)) {
            subTopics[this.topicAddPrefixIn(key)] = { qos: topics[key] as QoS };
        }

        this.log.debug(`trying to subscribe to ${Object.keys(subTopics).length} topics: ${JSON.stringify(subTopics)}`);
        this.client.subscribe(subTopics, (err, granted) => {
            if (!err) {
                this.log.debug(`successfully subscribed to ${granted?.length} topics`);
            } else {
                this.log.debug(`error subscribing to ${Object.keys(subTopics).length} topics`);
            }
            callback();
        });
    }

    private unsubscribeTopic(topic: string, callback: () => void): void {
        this.client?.unsubscribe(this.topicAddPrefixIn(topic), callback);
    }

    /**
     * Subscribe to the state changes of an id
     *
     * @param id ioBroker id
     * @returns true if the id was not subscribed before
     */
    private async iobSubscribe(id: string): Promise<boolean> {
        if (this.iobSubscribes.includes(id)) {
            return false;
        }
        this.iobSubscribes.push(id);
        this.iobSubscribes.sort();
        try {
            await this.subscribeForeignStatesAsync(id);
        } catch (e) {
            this.log.error(`Cannot subscribe to "${id}": ${(e as Error).message}`);
        }
        return true;
    }

    private iobUnsubscribe(id: string): void {
        const pos = this.iobSubscribes.indexOf(id);
        if (pos !== -1) {
            this.iobSubscribes.splice(pos, 1);
            void this.unsubscribeForeignStatesAsync(id);
        }
    }

    private val2String(val: ioBroker.StateValue | undefined): string {
        return val === null ? 'null' : val === undefined ? 'undefined' : val.toString();
    }

    private stringToVal(id: string, val: string): ioBroker.StateValue | undefined {
        if (val === 'undefined') {
            return undefined;
        }
        if (val === 'null') {
            return null;
        }
        const type = this.custom[id]?.type;
        if (!type || type === 'string' || type === 'mixed') {
            return val;
        }

        if (type === 'number') {
            if (val === 'true') {
                return 1;
            }
            if (val === 'false') {
                return 0;
            }
            return parseFloat(val.replace(',', '.')) || 0;
        }
        if (type === 'boolean') {
            if (val === '1' || val === 'true') {
                return true;
            }
            if (val === '0' || val === 'false') {
                return false;
            }
            return !!val;
        }
        return val;
    }

    private addTopic2Id(topic: string, id: string): void {
        //derived topics can collide, e.g. "a#b" and "a+b" both become "a_b"
        if (this.topic2id[topic] && this.topic2id[topic] !== id) {
            this.log.warn(
                `topic "${topic}" is used by ${this.topic2id[topic]} and ${id}, only ${id} will receive messages. Please configure an explicit topic for one of them`,
            );
        }
        this.topic2id[topic] = id;
    }

    private checkSettings(
        id: string,
        custom: MqttCustomSettings,
        aNamespace: string,
        qos: number,
        subQos: number,
    ): void {
        if (!custom.topic) {
            custom.topic = convertID2Topic(id, aNamespace);
            this.log.debug(`derived topic "${custom.topic}" for ${id}`);
        }
        // the stored values are not guaranteed to have the right type
        custom.enabled = custom.enabled === true;
        custom.publish = custom.publish === true;
        custom.pubChangesOnly = custom.pubChangesOnly === true;
        custom.pubAsObject = custom.pubAsObject === true;
        custom.retain = custom.retain === true;
        custom.qos = parseInt(String(custom.qos || qos), 10) || 0;

        custom.subscribe = custom.subscribe === true;
        custom.subChangesOnly = custom.subChangesOnly === true;
        custom.subAsObject = custom.subAsObject === true;
        custom.setAck = custom.setAck !== false;
        custom.subQos = parseInt(String(custom.subQos || subQos), 10) || 0;
    }

    /** read the objects one after another, ids that cannot be read are skipped */
    private async loadObjects(ids: string[]): Promise<Record<string, ioBroker.Object>> {
        const result: Record<string, ioBroker.Object> = {};
        for (const id of ids) {
            try {
                const obj = await this.getForeignObjectAsync(id);
                if (obj) {
                    result[obj._id] = obj;
                }
            } catch {
                // ignore
            }
        }
        return result;
    }

    /**
     * Is called when databases are connected and adapter received configuration.
     */
    private async onReady(): Promise<void> {
        let state: ioBroker.State | null | undefined;
        try {
            state = await this.getStateAsync('info.connection');
        } catch {
            state = undefined;
        }
        if (!state || state.val) {
            void this.setState('info.connection', false, true);
        }

        this.config.inbox = this.config.inbox.trim();
        this.config.outbox = this.config.outbox.trim();

        if (this.config.host) {
            // not awaited: the object subscription below is requested at the same time as in the JS version
            this.startClient().catch(e => this.log.error(`Cannot start client: ${(e as Error).message}`));
        }

        void this.subscribeForeignObjectsAsync('*');
    }

    private async startClient(): Promise<void> {
        const protocol = `${this.config.websocket ? 'ws' : 'mqtt'}${this.config.ssl ? 's' : ''}`;
        const _url = `${protocol}://${
            this.config.username ? `${this.config.username}:${this.config.password}@` : ''
        }${this.config.host}${this.config.port ? `:${this.config.port}` : ''}?clientId=${this.config.clientId}`;
        const __url = `${protocol}://${
            this.config.username ? `${this.config.username}:*******************@` : ''
        }${this.config.host}${this.config.port ? `:${this.config.port}` : ''}?clientId=${this.config.clientId}`;

        let doc:
            | { rows: { id: string; value: Record<string, { enabled?: boolean } | undefined> | null }[] }
            | undefined;
        try {
            doc = await this.getObjectViewAsync('system', 'custom', {});
        } catch {
            doc = undefined;
        }

        const ids: string[] = [];
        if (doc?.rows) {
            for (let i = 0, l = doc.rows.length; i < l; i++) {
                const cust = doc.rows[i].value;
                if (cust?.[this.namespace]?.enabled) {
                    ids.push(doc.rows[i].id);
                }
            }
        }

        // we need type of object
        const objs = await this.loadObjects(ids);
        for (const id of Object.keys(objs)) {
            const common = objs[id].common as ioBroker.StateCommon;
            this.custom[id] = common.custom![this.namespace] as MqttCustomSettings;
            this.custom[id].type = common.type;

            this.checkSettings(id, this.custom[id], this.namespace, this.config.qos, this.config.subQos);

            if (this.custom[id].subscribe) {
                this.subTopics[this.custom[id].topic] = this.custom[id].subQos;
                this.addTopic2Id(this.custom[id].topic, id);
            }

            // subscribe on changes
            if (this.custom[id].enabled) {
                void this.iobSubscribe(id);
            }

            this.log.debug(
                `enabled syncing of ${id} (publish/subscribe:${this.custom[id].publish.toString()}/${this.custom[
                    id
                ].subscribe.toString()})`,
            );
        }
        this.log.debug(`complete Custom: ${JSON.stringify(this.custom)}`);

        if (this.config.subscriptions) {
            for (const topic of this.config.subscriptions.split(',')) {
                if (topic?.trim()) {
                    this.addTopics[topic.trim()] = 0; // QoS
                }
            }
        }
        this.log.debug(`found ${Object.keys(this.addTopics).length} additional topic to subscribe to`);

        let will: IClientOptions['will'] = undefined;

        if (this.config.lastWillTopic && this.config.lastWillMessage) {
            this.log.info(
                `Try to connect to ${__url}, protocol version ${this.config.mqttVersion} with lwt "${this.config.lastWillTopic}"`,
            );

            will = {
                topic: this.topicAddPrefixOut(this.config.lastWillTopic),
                payload: this.config.lastWillMessage,
                qos: 2,
                retain: true,
            };
        } else {
            this.log.info(`Try to connect to ${__url}`);
        }
        const mqttVersion = Number.parseInt(String(this.config.mqttVersion || 4));
        // `ssl` is not an option of mqtt.js (the protocol comes from the url), it is passed on like in the JS version
        const options: IClientOptions & { ssl: boolean } = {
            host: this.config.host,
            port: this.config.port,
            protocolVersion: mqttVersion as MqttProtocolVersion,
            ssl: this.config.ssl,
            rejectUnauthorized: this.config.rejectUnauthorized,
            reconnectPeriod: this.config.reconnectPeriod,
            username: this.config.username,
            password: this.config.password,
            clientId: this.config.clientId,
            clean: true,
            will,
        };
        try {
            this.client = connect(_url, options);
        } catch (e) {
            this.log.error(String(e));
            this.finish(() => {
                this.setTimeout(() => this.terminate(), 200);
            });
            return;
        }

        this.client.on('connect', () => this.onBrokerConnect());
        this.client.on('reconnect', () => this.onBrokerReconnect());
        this.client.on('disconnect', () => this.onBrokerDisconnect());
        this.client.on('offline', () => this.onBrokerOffline());
        this.client.on('message', (topic, payload) => this.onBrokerMessage(topic, payload));
        this.client.on('error', err => this.onBrokerError(err));
    }

    /**
     * Publishes the disconnect message and closes the client
     *
     * @param callback called after the client was closed
     */
    private finish(callback?: () => void): void {
        if (this.adapterFinished) {
            // e.g. unload after stopInstance: the client is already closed or closing
            callback?.();
            return;
        }
        if (this.client && this.config.onDisconnectTopic && this.config.onDisconnectMessage) {
            const topic = this.config.onDisconnectTopic;

            this.log.info(`Disconnecting with message "${this.config.onDisconnectMessage}" on topic "${topic}"`);
            this.client.publish(
                this.topicAddPrefixOut(topic),
                this.config.onDisconnectMessage,
                { qos: 2, retain: true },
                () => {
                    this.log.debug(
                        `successfully published ${JSON.stringify({
                            topic: topic,
                            message: this.config.onDisconnectMessage,
                        })}`,
                    );
                    this.end(callback);
                },
            );
        } else {
            this.end(callback);
        }
    }

    /**
     * Closes the client
     *
     * @param callback called after the client was closed
     */
    private end(callback?: () => void): void {
        this.adapterFinished = true;
        if (!this.client) {
            // no broker configured
            callback?.();
            return;
        }
        this.client.end(false, {}, () => {
            this.log.debug(`closed client`);
            void this.setState('info.connection', false, true);
            callback?.();
        });
    }

    /**
     * Is called when the adapter shuts down - callback has to be called under any circumstances!
     *
     * @param callback
     */
    private onUnload(callback: () => void): void {
        try {
            this.finish(callback);
        } catch {
            callback();
        }
    }

    /**
     * Is called if a subscribed object changes
     *
     * @param id
     * @param obj
     */
    private onObjectChange(id: string, obj: ioBroker.Object | null | undefined): void {
        if (obj?.common?.custom?.[this.namespace]?.enabled) {
            this.custom[id] = obj.common.custom[this.namespace] as MqttCustomSettings;
            this.custom[id].type = (obj.common as ioBroker.StateCommon).type;

            this.checkSettings(id, this.custom[id], this.namespace, this.config.qos, this.config.subQos);

            if (this.custom[id].subscribe) {
                this.subTopics[this.custom[id].topic] = this.custom[id].subQos;
                this.addTopic2Id(this.custom[id].topic, id);
                const sub: Record<string, number> = {};
                sub[this.custom[id].topic] = this.custom[id].subQos;

                this.subscribeTopics(sub, () => {
                    this.log.debug(`subscribed to ${JSON.stringify(sub)}`);
                });
            } else {
                delete this.subTopics[this.custom[id].topic];
                delete this.topic2id[this.custom[id].topic];
                this.iobUnsubscribe(id);

                this.unsubscribeTopic(this.custom[id].topic, () => {
                    if (this.custom[id]) {
                        this.log.debug(`unsubscribed from ${this.custom[id].topic}`);
                    }
                });
            }

            if (this.custom[id].enabled) {
                //subscribe to state changes
                void this.iobSubscribe(id).then(async subscribed => {
                    //publish state once
                    if (!subscribed || !this.custom[id]?.publish) {
                        return;
                    }
                    let state: ioBroker.State | null | undefined;
                    try {
                        state = await this.getForeignStateAsync(id);
                    } catch {
                        return;
                    }
                    if (!state) {
                        return;
                    }
                    this.log.debug(`publish ${id} once: ${JSON.stringify(state)}`);
                    this.onStateChange(id, state);
                });
            }

            this.log.debug(
                `enabled syncing of ${id} (publish/subscribe:${this.custom[id].publish.toString()}/${this.custom[
                    id
                ].subscribe.toString()})`,
            );
        } else if (this.custom[id]) {
            const topic = this.custom[id].topic;

            this.unsubscribeTopic(topic, () => this.log.debug(`unsubscribed from ${topic}`));

            delete this.subTopics[this.custom[id].topic];
            delete this.topic2id[this.custom[id].topic];
            // a deleted state that was created from a topic may be created again by the next message
            this.addedTopics.delete(topic);

            if (this.custom[id].publish) {
                this.iobUnsubscribe(id);
            }

            delete this.custom[id];

            this.log.debug(`disabled syncing of ${id}`);
        }
    }

    /**
     * Is called if a subscribed state changes
     *
     * @param id
     * @param state
     */
    private onStateChange(id: string, state: ioBroker.State | null | undefined): void {
        const settings = this.custom[id];

        if (settings) {
            settings.state = state;

            if (settings.enabled && settings.publish) {
                if (!state) {
                    // The state was deleted/expired, make sure it is no longer retained
                    this.unpublish(id);
                } else if (state.from !== `system.adapter.${this.namespace}`) {
                    // prevent republishing to same broker
                    this.publishState(id, state);
                }
            }
        }
    }

    /**
     * Some message was sent to this instance over the message box.
     * Using this method requires the "common.messagebox" property to be set to true in io-package.json
     *
     * @param obj
     */
    private onMessage(obj: ioBroker.Message): void {
        if (typeof obj === 'object' && obj.command) {
            if (obj.command === 'stopInstance') {
                this.log.info('Stop Instance command received...');

                this.finish(() => {
                    this.sendTo(obj.from, obj.command, 'Message received', obj.callback);
                    this.setTimeout(() => this.terminate(), 200);
                });
            }
        }
    }
}

if (require.main !== module) {
    // Export the constructor in compact mode
    module.exports = (options: Partial<AdapterOptions> | undefined) => new MqttClient(options);
} else {
    // otherwise start the instance directly
    (() => new MqttClient())();
}
