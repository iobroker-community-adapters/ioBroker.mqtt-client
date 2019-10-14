/* jshint -W097 */
/* jshint strict: false */
/* jslint node: true */
'use strict';
const utils       = require('@iobroker/adapter-core'); // Get common adapter utils
const mqtt        = require('mqtt');
const adapterName = require('./package.json').name.split('.').pop();

let gAdapter;

function checkSettings(id, custom, aNamespace, qos, subQos) {
    custom.topic = custom.topic || convertID2Topic(id, aNamespace);

    custom.publish        = custom.publish === true;
    custom.pubChangesOnly = custom.pubChangesOnly === true;
    custom.pubAsObject    = custom.pubAsObject === true;
    custom.retain         = custom.retain === true;
    custom.qos            = parseInt(custom.qos || qos, 10) || 0;

    custom.subscribe      = custom.subscribe === true;
    custom.subChangesOnly = custom.subChangesOnly === true;
    custom.subAsObject    = custom.subAsObject === true;
    custom.setAck         = custom.setAck !== false;
    custom.subQos         = parseInt(custom.subQos || subQos, 10) || 0;
}

function startAdapter(options) {
    options = options || {};
    options = Object.assign({}, options, {name: adapterName});

    let adapter = new utils.Adapter(options);

    adapter._context = {};
    adapter._context.custom      = {};
    adapter._context.subTopics   = {};
    adapter._context.topic2id    = {};
    adapter._context.addTopics   = {};
    adapter._context.addedTopics = {};

    adapter.on('objectChange',  (id, obj) => {
        const custom    = adapter._context.custom;
        const subTopics = adapter._context.subTopics;
        const topic2id  = adapter._context.topic2id;

        if (obj && obj.common && obj.common.custom && obj.common.custom[adapter.namespace] && obj.common.custom[adapter.namespace].enabled) {
            const pubState = custom[id] ? custom[id].pubState : null;
            const state    = custom[id] ? custom[id].state    : null;

            custom[id] = obj.common.custom[adapter.namespace];
            custom[id].pubState = pubState;
            custom[id].state = state;
            custom[id].type = obj.common.type;

            checkSettings(id, custom[id], adapter.namespace, adapter.config.qos, adapter.config.subQos);

            if (custom[id].subscribe) {
                subTopics[custom[id].topic] = custom[id].subQos;
                topic2id[custom[id].topic]  = id;
                const sub = {};
                sub[custom[id].topic] = custom[id].subQos;

                subscribe(adapter, sub, () =>
                    adapter.log.info('subscribed to ' + JSON.stringify(sub)));
            } else {
                delete subTopics[custom[id].topic];
                delete topic2id[custom[id].topic];
                iobUnsubscribe(adapter, id);

                unsubscribe(adapter, custom[id].topic, () =>
                    adapter.log.info('unsubscribed from ' + custom[id].topic));
            }

            if (custom[id].publish) {
                iobSubscribe(adapter, id);
            }

            adapter.log.info('enabled syncing of ' + id +
                ' (publish/subscribe:' + custom[id].publish.toString() +
                '/' + custom[id].subscribe.toString() + ')');
        } else if (custom[id]) {
            const topic = custom[id].topic;

            unsubscribe(adapter, topic, () =>
                adapter.log.info('unsubscribed from ' + topic));

            if (subTopics[custom[id].topic]) {
                delete subTopics[custom[id].topic];
            }
            if (topic2id[custom[id].topic]) {
                delete topic2id[custom[id].topic];
            }
            if (custom[id].publish) {
                iobUnsubscribe(id);
            }

            delete custom[id];

            adapter.log.info('disabled syncing of ' + id);
        }
    });

    adapter.on('stateChange', (id, state) => {
        const custom = adapter._context.custom;

        if (custom[id]) {
            custom[id].state = state;

            if (custom[id].enabled && custom[id].publish &&
                // prevent republishing to same broker
                state.from !== 'system.adapter.' + adapter.namespace) {
                publish(adapter, id, state);
            }
        }
    });

    adapter.on('unload', callback => finish(adapter, callback));

    adapter.on('ready', () => main(adapter));

    adapter._client = null;
    adapter._subscribes = [];
    adapter._connected = false;

    gAdapter = adapter;

    return adapter;
}

function finish(adapter, callback) {
    if (adapter._client) {
        adapter._client.end();
        adapter._client = null;
    }
    callback && callback();
}

function iobSubscribe(adapter, id) {
    if (!adapter._subscribes.includes(id)) {
        adapter._subscribes.push(id);
        adapter._subscribes.sort();
        adapter.subscribeForeignStates(id);
    }
}

function iobUnsubscribe(adapter, id) {
    const pos = adapter._subscribes.includes(id);
    if (pos !== -1) {
        adapter._subscribes.splice(pos, 1);
        adapter.unsubscribeForeignStates(id);
    }
}

function getObjects(adapter, ids, callback, _result) {
    _result = _result || {};
    if (!ids || !ids.length) {
        callback(_result);
    } else {
        adapter.getForeignObject(ids.shift(), (err, obj) => {
            if (obj) {
                _result[obj._id] = obj;
            }
            setImmediate(getObjects, adapter, ids, callback, _result);
        })
    }
}

function main(adapter) {
    adapter.getState('info.connection', (err, state) => {
        (!state || state.val) && adapter.setState('info.connection', false, true);

        if (adapter.config.host && adapter.config.host !== '') {
            const custom    = adapter._context.custom;
            const subTopics = adapter._context.subTopics;
            const topic2id  = adapter._context.topic2id;
            const addTopics = adapter._context.addTopics;

            const _url  = ((!adapter.config.ssl) ? 'mqtt' : 'mqtts') + '://' + (adapter.config.username ? (adapter.config.username + ':' + adapter.config.password + '@') : '') + adapter.config.host + (adapter.config.port ? (':' + adapter.config.port) : '') + '?clientId=' + adapter.config.clientId;
            const __url = ((!adapter.config.ssl) ? 'mqtt' : 'mqtts') + '://' + (adapter.config.username ? (adapter.config.username + ':*******************@')             : '') + adapter.config.host + (adapter.config.port ? (':' + adapter.config.port) : '') + '?clientId=' + adapter.config.clientId;

            adapter.getObjectView('custom', 'state', {}, (err, doc) => {
                const ids = [];
                if (doc && doc.rows) {
                    for (let i = 0, l = doc.rows.length; i < l; i++) {
                        const cust = doc.rows[i].value;
                        if (cust && cust[adapter.namespace] && cust[adapter.namespace].enabled) {
                            ids.push(doc.rows[i].id);
                        }
                    }
                }

                // we need type of object
                getObjects(adapter, ids, objs => {
                    Object.keys(objs).forEach(id => {
                        custom[id] = objs[id].common.custom[adapter.namespace];
                        custom[id].type = objs[id].common.type;

                        checkSettings(id, custom[id], adapter.namespace, adapter.config.qos, adapter.config.subQos);

                        if (custom[id].subscribe) {
                            subTopics[custom[id].topic] = custom[id].subQos;
                            topic2id[custom[id].topic]  = id;
                        }

                        // subscribe on changes
                        if (custom[id].publish) {
                            iobSubscribe(adapter, id);
                        }

                        adapter.log.info('enabled syncing of ' + id + ' (publish/subscribe:' + custom[id].publish.toString() + '/' + custom[id].subscribe.toString() + ')');
                    });

                    adapter.config.subscriptions && adapter.config.subscriptions.split(',').forEach(topic => {
                        if (topic && topic.trim()) {
                            addTopics[topic.trim()] = 0; // QoS
                        }
                    });

                    let will = undefined;

                    if (adapter.config.lastWillTopic && adapter.config.lastWillMessage) {
                        adapter.log.info('Try to connect to ' + __url + ' with lwt "' + adapter.config.lastWillTopic + '"');

                        will = {
                            topic:          adapter.config.lastWillTopic,
                            payload:        adapter.config.lastWillMessage,
                            qos:            2,
                            retain:         true
                        };
                    } else {
                        adapter.log.info('Try to connect to ' + __url);
                    }

                    adapter._client = mqtt.connect(_url, {
                        host:               adapter.config.host,
                        port:               adapter.config.port,
                        ssl:                adapter.config.ssl,
                        reconnectPeriod:    adapter.config.reconnectPeriod,
                        username:           adapter.config.username,
                        password:           adapter.config.password,
                        clientId:           adapter.config.clientId,
                        clean:              true,
                        will,
                    });
                    adapter._client.on('connect',    connack => onConnect(adapter, connack));
                    adapter._client.on('reconnect',  () =>  onReconnect(adapter));
                    adapter._client.on('disconnect', () =>  onDisconnect(adapter));
                    adapter._client.on('offline',    () =>  onOffline(adapter));
                    adapter._client.on('message',    (topic, msg) =>  onMessage(adapter, topic, msg));
                    adapter._client.on('error',      err => onError(adapter, err));
                });
            });
        }

        adapter.subscribeForeignObjects('*');
    });
}

function onConnect(adapter, /* connack */) {
    adapter.log.info('connected to broker');

    if (!adapter._connected) {
        adapter._connected = true;
        adapter.setState('info.connection', true, true);
    }

    if (adapter.config.onConnectTopic && adapter.config.onConnectMessage) {
        let topic = adapter.config.onConnectTopic;

        //add outgoing prefix
        if (adapter.config.outbox) {
            topic = adapter.config.outbox + '/' + topic;
        }

        adapter._client.publish(topic, adapter.config.onConnectMessage, {qos: 2, retain: true}, () =>
            adapter.log.debug('succesfully published ' + JSON.stringify({topic: topic, message: adapter.config.onConnectMessage})));
    }

    const subTopics = adapter._context.subTopics;
    const addTopics = adapter._context.addTopics;

    //initially subscribe to topics
    if (Object.keys(subTopics).length) {
        subscribe(subTopics, () =>
            adapter.log.debug('subscribed to: ' + JSON.stringify(subTopics)));
    }
    if (Object.keys(addTopics).length) {
        subscribe(addTopics, () =>
            adapter.log.debug('subscribed to additional topics: ' + JSON.stringify(addTopics)));
    }
}

function onReconnect(adapter) {
    adapter.log.info('trying to reconnect to broker');
}

function onDisconnect(adapter) {
    if (adapter._connected) {
        adapter._connected = false;
        adapter.setState('info.connection', false, true);
    }

    adapter.log.warn('disconnected from broker');
}

function onOffline(adapter) {
    if (adapter._connected) {
        adapter._connected = false;
        adapter.setState('info.connection', false, true);
    }

    adapter.log.warn('client offline');
}

function onError(adapter, err) {
    adapter.log.warn('client error: ' + err);
}

function onMessage(adapter, topic, msg) {
    const custom      = adapter._context.custom;
    const topic2id    = adapter._context.topic2id;
    const addedTopics = adapter._context.addedTopics;

    msg = msg.toString();

    //remove inbox prefix if exists
    if (adapter.config.inbox && topic.substring(0, adapter.config.inbox.length) === adapter.config.inbox) {
        topic = topic.substr(adapter.config.inbox.length + 1);
    }

    //if topic2id[topic] does not exist automatically convert topic to id with guiding adapter namespace
    const id = topic2id[topic] || convertTopic2ID(topic, adapter.namespace);

    adapter.log.debug('received message ' + topic + '=>' + id + ': ' + msg);

    if (topic2id[topic] && custom[id] && custom[id]) {
        if (custom[id].subAsObject) {
            setStateObj(adapter, id, msg);
        } else {
            setStateVal(adapter, id, msg);
        }
    } else if (!addedTopics[topic]) {
        addedTopics[topic] = null;
        const obj = {
            type:       'state',
            role:       'text',
            common: {
                name:   id.split('.').pop(),
                type:   'mixed',
                read:   true,
                write:  true,
                desc:   'created from topic',
                custom: {
                }
            },
            native: {
                topic: topic
            }
        };
        obj.common.custom[adapter.namespace] = {
            enabled:        true,
            topic:          topic,
            publish:        false,
            pubChangesOnly: false,
            pubAsObject:    false,
            qos:            0,
            retain:         false,
            subscribe:      true,
            subChangesOnly: false,
            subAsObject:    false,
            subQos:         0,
            setAck:         true
        };
        adapter.setObjectNotExists(id, obj, () =>
            adapter.log.info('created and subscribed to new state: ' + id));
    } else {
        adapter.log.debug('state already exists');
    }
}

function setStateObj(adapter, id, msg) {
    try {
        const obj = JSON.parse(msg);
        adapter.log.debug(JSON.stringify(obj));
        if (obj.hasOwnProperty('val')) {
            const custom = adapter._context.custom;

            if (obj.hasOwnProperty('ts') && custom[id].state && obj.ts <= custom[id].state.ts) {
                adapter.log.debug('object ts not newer than current state ts: ' + msg);
                return false;
            }
            if (obj.hasOwnProperty('lc') && custom[id].state && obj.lc < custom[id].state.lc) {
                adapter.log.debug('object lc not newer than current state lc: ' + msg);
                return false;
            }
            //todo: !== correct???
            if (adapter.config.inbox === adapter.config.outbox &&
                custom[id].publish &&
                !obj.hasOwnProperty('ts') &&
                !obj.hasOwnProperty('lc') &&
                obj.val !== custom[id].state.val) {
                adapter.log.debug('object value did not change (loop protection): ' + msg);
                return false;
            }
            //todo: !== correct???
            if (custom[id].subChangesOnly && obj.val !== custom[id].state.val) {
                adapter.log.debug('object value did not change: ' + msg);
                return false;
            }

            if (custom[id].setAck) {
                obj.ack = true;
            }

            delete obj.from;

            adapter.setForeignState(id, obj);
            adapter.log.debug('object set to ' + JSON.stringify(obj));
            return true;
        } else {
            adapter.log.warn('no value in object: ' + msg);
            return false;
        }
    } catch (e) {
        adapter.log.warn('could not parse message as object: ' + msg);
        return false;
    }
}

function setStateVal(adapter, id, msg) {
    const custom = adapter._context.custom;

    if (custom[id].state && val2String(custom[id].state.val) === msg) {
        if (adapter.config.inbox === adapter.config.outbox && custom[id].publish) {
            adapter.log.debug('value did not change (loop protection)');
            return false;
        } else if (custom[id].subChangesOnly) {
            adapter.log.debug('value did not change');
            return false;
        }
    }
    adapter.setForeignState(id, {val: stringToVal(custom, id, msg), ack: custom[id].setAck});
    adapter.log.debug('value set to ' + JSON.stringify({val: stringToVal(custom, id, msg), ack: custom[id].setAck}));
    return true;
}

function publish(adapter, id, state) {
    if (adapter._client) {
        const custom   = adapter._context.custom;
        const settings = custom[id];

        if (!settings || !state) {
            return false;
        }
        if (custom[id].pubState && settings.pubChangesOnly && (state.ts !== state.lc)) {
            return false;
        }

        custom[id].pubState = state;
        adapter.log.debug('publishing ' + id);

        let topic = settings.topic;

        const message = settings.pubAsObject ? JSON.stringify(state) : val2String(state.val);

        // add outgoing prefix
        if (adapter.config.outbox) {
            topic = adapter.config.outbox + '/' + topic;
        }

        adapter._client.publish(topic, message, {qos: settings.qos, retain: settings.retain}, () =>
            adapter.log.debug('succesfully published ' + id + ': ' + JSON.stringify({topic: topic, message: message})));

        return true;
    }
}

function subscribe(adapter, topics, callback) {
    if (adapter._client) {
        let subTopics = {};

        if (adapter.config.inbox) {
            //add inbox prefix to all subscriptions
            Object.keys(topics).forEach(key =>
                subTopics[adapter.config.inbox + '/' + key] = topics[key]);
        } else {
            subTopics = topics;
        }

        adapter._client.subscribe(subTopics, callback);
    }
}

function unsubscribe(adapter, topic, callback) {
    adapter._client && adapter._client.unsubscribe(topic, callback);
}

function val2String(val) {
    return val === null ? 'null' : (val === undefined ? 'undefined' : val.toString());
}

function stringToVal(custom, id, val) {
    if (val === 'undefined') {
        return undefined;
    }
    if (val === 'null') {
        return null;
    } else
    if (!custom[id] || !custom[id].type || custom[id].type === 'string' || custom[id].type === 'mixed') {
        return val;
    } else
    if (custom[id].type === 'number') {
        if (val === true  || val === 'true')  {
            val = 1;
        } else
        if (val === false || val === 'false') {
            val = 0;
        }
        val = val.replace(',', '.');
        val = parseFloat(val) || 0;
        return val;
    } else
    if (custom[id].type === 'boolean') {
        if (val === '1' || val === 'true')  {
            val = true;
        } else
        if (val === '0' || val === 'false') {
            val = false;
        }
        return !!val;
    } else {
        return val;
    }
}

function convertID2Topic(id, namespace) {
    let topic;

    //if necessary remove namespace before converting, e.g. "mqtt-client.0..."
    if (namespace && id.substring(0, namespace.length) === namespace) {
        topic = id.substring(namespace.length + 1);
    } else {
        topic = id;
    }

    //replace dots with slashes and underscores with spaces
    topic = topic.replace(/\./g, '/').replace(/_/g, ' ');
    return topic;
}

function convertTopic2ID(topic, namespace) {
    if (!topic) {
        return topic;
    }

    //replace slashes with dots and spaces with underscores
    topic = topic.replace(/\//g, '.').replace(/\s/g, '_');

    //replace guiding and trailing dot
    if (topic[0] === '.') topic = topic.substring(1);
    if (topic[topic.length - 1] === '.') topic = topic.substring(0, topic.length - 1);

    //add namespace to id if exists
    if (namespace && namespace !== '') {
        topic = namespace + '.' + topic;
    }
    return topic;
}

// If started as allInOne mode => return function to create instance
if (module.parent) {
    module.exports = startAdapter;
} else {
    // or start the instance directly
    startAdapter();
    process.on('SIGINT', () => gAdapter && gAdapter.setState && finish(gAdapter));
}
