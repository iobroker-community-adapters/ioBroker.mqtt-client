/* jshint -W097 */// jshint strict:false
/*jslint node: true */
"use strict";
var utils      = require(__dirname + '/lib/utils'); // Get common adapter utils
var mqtt = require('mqtt');

var custom = {};
var subTopics = {};
var topic2id = {};
var addTopics = {};
var addedTopics = {};
var client = null;

var adapter = utils.adapter({

    name: 'mqtt-client',

    objectChange: function (id, obj) {
        if (obj && obj.common && obj.common.custom && obj.common.custom[adapter.namespace]) {
            var pubState = custom[id] ? custom[id].pubState : null;
            var state = custom[id] ? custom[id].state : null;

            custom[id] = obj.common.custom;
            custom[id].pubState = pubState;
            custom[id].state = state;
            custom[id].type = obj.common.type;

            custom[id][adapter.namespace].topic           = custom[id][adapter.namespace].topic || convertID2Topic(id, adapter.namespace);

            custom[id][adapter.namespace].publish         = custom[id][adapter.namespace].publish === true;
            custom[id][adapter.namespace].pubChangesOnly  = custom[id][adapter.namespace].pubChangesOnly === true;
            custom[id][adapter.namespace].pubAsObject     = custom[id][adapter.namespace].pubAsObject === true;
            custom[id][adapter.namespace].retain          = custom[id][adapter.namespace].retain  === true;
            custom[id][adapter.namespace].qos             = parseInt(custom[id][adapter.namespace].qos || adapter.config.qos, 10) || 0;

            custom[id][adapter.namespace].subscribe       = custom[id][adapter.namespace].subscribe === true;
            custom[id][adapter.namespace].subChangesOnly  = custom[id][adapter.namespace].subChangesOnly === true;
            custom[id][adapter.namespace].subAsObject     = custom[id][adapter.namespace].subAsObject === true;
            custom[id][adapter.namespace].setAck          = custom[id][adapter.namespace].setAck !== false;
            custom[id][adapter.namespace].subQos          = parseInt(custom[id][adapter.namespace].subQos || adapter.config.subQos, 10) || 0;

            if (custom[id][adapter.namespace].subscribe) {
                subTopics[custom[id][adapter.namespace].topic] = custom[id][adapter.namespace].subQos;
                topic2id[custom[id][adapter.namespace].topic] = id;
                var sub = {};
                sub[custom[id][adapter.namespace].topic] = custom[id][adapter.namespace].subQos;
                subscribe(sub, function () { 
                    adapter.log.info('subscribed to ' + JSON.stringify(sub));
                });
            } else {
                delete subTopics[custom[id][adapter.namespace].topic];
                delete topic2id[custom[id][adapter.namespace].topic];
                unsubscribe(custom[id][adapter.namespace].topic, function () {
                    adapter.log.info('unsubscribed from ' + custom[id][adapter.namespace].topic);
                });
            }

            adapter.log.info('enabled syncing of ' + id + ' (publish/subscribe:' + custom[id][adapter.namespace].publish.toString() + '/' + custom[id][adapter.namespace].subscribe.toString() + ')');
        } else {
            if (custom[id]) {
                if (custom[id][adapter.namespace]) {
                    var topic = custom[id][adapter.namespace].topic;
                    unsubscribe(topic, function () {
                        adapter.log.info('unsubscribed from ' + topic);
                    });
                    delete subTopics[custom[id][adapter.namespace].topic];
                    delete topic2id[custom[id][adapter.namespace].topic];
                }
                delete custom[id];
                adapter.log.info('disabled syncing of ' + id);
            }
        }
    },

    stateChange: function (id, state) {
        if (custom[id]) {
            custom[id].state = state;
            if (custom[id][adapter.namespace].enabled && custom[id][adapter.namespace].publish) {
                //prevent republishing to same broker
                if (state.from !== 'system.adapter.' + adapter.namespace) publish(id, state);
            }
        }
    },

    unload: function (callback) {
        finish(callback);
    },

    ready: function () {
        main();
    }
});

process.on('SIGINT', function () {
    if (adapter && adapter.setState) {
        finish();
    }
});

function finish(callback) {
    if (client) {
        client.end();
        client = null;
    }
    if (callback) callback();
}

function main() {
    if (adapter.config.host && adapter.config.host !== '') {
        var _url = ((!adapter.config.ssl) ? 'mqtt' : 'mqtts') + '://' + (adapter.config.username ? (adapter.config.username + ':' + adapter.config.password + '@') : '') + adapter.config.host + (adapter.config.port ? (':' + adapter.config.port) : '') + '?clientId=' + adapter.config.clientId;
        var __url = ((!adapter.config.ssl) ? 'mqtt' : 'mqtts') + '://' + (adapter.config.username ? (adapter.config.username + ':*******************@') : '') + adapter.config.host + (adapter.config.port ? (':' + adapter.config.port) : '') + '?clientId=' + adapter.config.clientId;
        adapter.objects.getObjectView('custom', 'state', {}, function (err, doc) {
            if (doc && doc.rows) {
                for (var i = 0, l = doc.rows.length; i < l; i++) {
                    if (doc.rows[i].value && doc.rows[i].value.custom) {
                        var id = doc.rows[i].id;
                        custom[id] = doc.rows[i].value.custom;
                        custom[id].type = doc.rows[i].value.type;
                        custom[id][adapter.namespace].topic = custom[id][adapter.namespace].topic || convertID2Topic(id, adapter.namespace);
                        if (!custom[id][adapter.namespace] || custom[id][adapter.namespace].enabled === false) {
                            if (custom[id][adapter.namespace]) {
                                delete subTopics[custom[id][adapter.namespace].topic];
                                delete topic2id[custom[id][adapter.namespace].topic];
                            }
                            delete custom[id];
                        } else {
                            custom[id][adapter.namespace].publish         = custom[id][adapter.namespace].publish === true;
                            custom[id][adapter.namespace].pubChangesOnly  = custom[id][adapter.namespace].pubChangesOnly === true;
                            custom[id][adapter.namespace].pubAsObject     = custom[id][adapter.namespace].pubAsObject === true;
                            custom[id][adapter.namespace].retain          = custom[id][adapter.namespace].retain  === true;
                            custom[id][adapter.namespace].qos             = parseInt(custom[id][adapter.namespace].qos || adapter.config.qos, 10) || 0;

                            custom[id][adapter.namespace].subscribe       = custom[id][adapter.namespace].subscribe === true;
                            custom[id][adapter.namespace].subChangesOnly  = custom[id][adapter.namespace].subChangesOnly === true;
                            custom[id][adapter.namespace].subAsObject     = custom[id][adapter.namespace].subAsObject === true;
                            custom[id][adapter.namespace].setAck          = custom[id][adapter.namespace].setAck !== false;
                            custom[id][adapter.namespace].subQos          = parseInt(custom[id][adapter.namespace].subQos || adapter.config.subQos, 10) || 0;

                            if (custom[id][adapter.namespace].subscribe) {
                                subTopics[custom[id][adapter.namespace].topic] = custom[id][adapter.namespace].subQos;
                                topic2id[custom[id][adapter.namespace].topic] = id;
                            } else {
                                delete subTopics[custom[id][adapter.namespace].topic];
                                delete topic2id[custom[id][adapter.namespace].topic];
                            }
                            adapter.log.debug('enabled syncing of ' + id + ' (publish/subscribe:' + custom[id][adapter.namespace].publish.toString() + '/' + custom[id][adapter.namespace].subscribe.toString() + ')');
                        }
                    }
                }
            }
            var subarr = adapter.config.subscriptions.split(',');
            for (var j = 0; j < subarr.length; j++) {
                if (subarr[j].trim() !== '') {
                    addTopics[subarr[j].trim()] = 0;
                }
            }
            if (adapter.config.lastWillTopic && adapter.config.lastWillTopic !== '' && adapter.config.lastWillMessage && adapter.config.lastWillMessage !== '') {
                adapter.log.info('Try to connect to ' + __url + ' with lwt');
                client = mqtt.connect(_url, {
                    host: adapter.config.host,
                    port: adapter.config.port,
                    ssl: adapter.config.ssl,
                    reconnectPeriod: adapter.config.reconnectPeriod,
                    username: adapter.config.username,
                    password: adapter.config.password,
                    clientId: adapter.config.clientId,
                    clean: true,
                    will: {
                        topic: adapter.config.lastWillTopic,
                        payload: adapter.config.lastWillMessage,
                        qos: 2,
                        retain: true
                    }
                });
            } else {
                adapter.log.info('Try to connect to ' + __url);
                client = mqtt.connect(_url, {
                    host: adapter.config.host,
                    port: adapter.config.port,
                    ssl: adapter.config.ssl,
                    reconnectPeriod: adapter.config.reconnectPeriod,
                    username: adapter.config.username,
                    password: adapter.config.password,
                    clientId: adapter.config.clientId,
                    clean: true
                });
            }
            client.on('connect', connect);
            client.on('reconnect', reconnect);
            client.on('disconnect', disconnect);
            client.on('offline', offline);
            client.on('message', message);
            client.on('error', error);
            adapter.subscribeForeignStates('*');
        });
    }
    adapter.subscribeForeignObjects('*');
}

function connect(connack) {
    adapter.log.info('connected to broker');
    if (adapter.config.onConnectTopic && adapter.config.onConnectTopic !== '' && adapter.config.onConnectMessage && adapter.config.onConnectMessage !== '') {
        var topic = adapter.config.onConnectTopic;

        //add outgoing prefix
        if (adapter.config.outbox) topic = adapter.config.outbox + '/' + topic;

        client.publish(topic, adapter.config.onConnectMessage, {qos: 2, retain: true}, function () {
            adapter.log.debug('succesfully published ' + JSON.stringify({topic: topic, message: adapter.config.onConnectMessage}));
        });
    }
    //initially subscribe to topics
    if (Object.keys(subTopics).length) subscribe(subTopics, function () { 
        adapter.log.debug('subscribed to: ' + JSON.stringify(subTopics));
    });
    if (Object.keys(addTopics).length) subscribe(addTopics, function () {
        adapter.log.debug('subscribed to additional topics: ' + JSON.stringify(addTopics));
    });
}

function reconnect() {
    adapter.log.info('trying to reconnect to broker');
}

function disconnect() {
    adapter.log.warn('disconnected from broker');
}

function offline() {
    adapter.log.warn('client offline');
}

function error(err) {
    adapter.log.warn('client error: ' + err);
}

function message(topic, msg) {
    msg = msg.toString();

    //remove inbox prefix if exists
    if (adapter.config.inbox && topic.substring(0, adapter.config.inbox.length) == adapter.config.inbox) {
        topic = topic.substr(adapter.config.inbox.length + 1);
    }

    //if topic2id[topic] does not exist automatically convert topic to id with guiding adapter namespace
    var id = topic2id[topic] || convertTopic2ID(topic, adapter.namespace);

    adapter.log.debug('received message ' + topic + '=>' + id + ': ' + msg);

    if (topic2id[topic] && custom[id] && custom[id][adapter.namespace]) {
        if (custom[id][adapter.namespace].subAsObject) {
            setStateObj(id, msg);
        } else {
            setStateVal(id, msg);
        }
    } else if (!addedTopics[topic]) {
        addedTopics[topic] = null;
        var obj = {
            type: "state",
            role: "text",
            common: {
                name: id.split('.').pop(),
                type: "mixed",
                read: true,
                write: true,
                desc: "created from topic",
                custom: {
                }
            },
            native: {
                topic: topic
            }
        };
        obj.common.custom[adapter.namespace] = {
            "enabled": true,
            "topic": topic,
            "publish": false,
            "pubChangesOnly": false,
            "pubAsObject": false,
            "qos": 0,
            "retain": false,
            "subscribe": true,
            "subChangesOnly": false,
            "subAsObject": false,
            "subQos": 0,
            "setAck": true
        };
        adapter.setObjectNotExists(id, obj, function () {
            adapter.log.info('created and subscribed to new state: ' + id);
        });
    } else {
        adapter.log.debug('state already exists');
    }
}

function setStateObj(id, msg) {
    try {
        var obj = JSON.parse(msg);
        adapter.log.debug(JSON.stringify(obj));
        if (obj.hasOwnProperty('val')) {
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
            custom[id][adapter.namespace].publish &&
            !obj.hasOwnProperty('ts') &&
            !obj.hasOwnProperty('lc') &&
            obj.val !== custom[id].state.val) {
                adapter.log.debug('object value did not change (loop protection): ' + msg);
                return false;
            }
            //todo: !== correct???
            if (custom[id][adapter.namespace].subChangesOnly && obj.val !== custom[id].state.val) {
                adapter.log.debug('object value did not change: ' + msg);
                return false;
            }
            if (custom[id][adapter.namespace].setAck) obj.ack = true;
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

function setStateVal(id, msg) {
    if (custom[id].state && val2String(custom[id].state.val) === msg) {
        if (adapter.config.inbox === adapter.config.outbox && custom[id][adapter.namespace].publish) {
            adapter.log.debug('value did not change (loop protection)');
            return false;
        } else if (custom[id][adapter.namespace].subChangesOnly) {
            adapter.log.debug('value did not change');
            return false;
        }
    }
    adapter.setForeignState(id, {val: stringToVal(id, msg), ack: custom[id][adapter.namespace].setAck});
    adapter.log.debug('value set to ' + JSON.stringify({val: stringToVal(id, msg), ack: custom[id][adapter.namespace].setAck}));
    return true;
}

function publish(id, state) {
    if (client) {
        var settings = custom[id][adapter.namespace];
        if (!settings || !state) return false;
        if (custom[id].pubState && settings.pubChangesOnly && (state.ts !== state.lc)) return false;

        custom[id].pubState = state;
        adapter.log.debug('publishing ' + id);

        var topic = settings.topic;

        var message = settings.pubAsObject ? JSON.stringify(state) : val2String(state.val);

        //add outgoing prefix
        if (adapter.config.outbox) topic = adapter.config.outbox + '/' + topic;

        client.publish(topic, message, {qos: settings.qos, retain: settings.retain}, function () {
            adapter.log.debug('succesfully published ' + id + ': ' + JSON.stringify({topic: topic, message: message}));
        });
        return true;
    }
}

function subscribe(topics, callback) {
    if (client) {
        var subTopics = {};

        if (adapter.config.inbox) {
            //add inbox prefix to all subscriptions
            var keys = Object.keys(topics);
            for (var j = 0; j < keys.length; j++) {
                var key = adapter.config.inbox + '/' + keys[j];
                subTopics[key] = topics[keys[j]];
            }
        } else {
            subTopics = topics;
        }


        client.subscribe(subTopics, callback);
    }
}

function unsubscribe(topic, callback) {
    if (client) {
        client.unsubscribe(topic, callback);
    }
}

function val2String(val) {
    return (val === null) ? 'null' : (val === undefined ? 'undefined' : val.toString());
}

function stringToVal(id, val) {
    if (val === 'undefined') return undefined;
    if (val === 'null') return null;
    if (!custom[id] || !custom[id].type || custom[id].type === 'string' || custom[id].type === 'mixed') return val;
    if (custom[id].type === 'number') {
        if (val === true  || val === 'true')  val = 1;
        if (val === false || val === 'false') val = 0;
        val = val.replace(',', '.');
        val = parseFloat(val) || 0;
        return val;
    }
    if (custom[id].type === 'boolean') {
        if (val === '1' || val === 'true')  val = true;
        if (val === '0' || val === 'false') val = false;
        return !!val;
    }
    return val;
}

function convertID2Topic(id, namespace) {
    var topic;

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
    if (!topic) return topic;

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
