/* jshint -W097 */// jshint strict:false
/*jslint node: true */
"use strict";
var utils      = require(__dirname + '/lib/utils'); // Get common adapter utils
var mqtt = require('mqtt');

var sync = {};
var subTopics = {};
var topic2id = {};
var client = null;

var adapter = utils.adapter({

    name: 'mqtt-client',

    objectChange: function (id, obj) {
        if (obj && obj.common && obj.common.sync && obj.common.sync[adapter.namespace]) {
            var pubState = sync[id] ? sync[id].pubState : null;
            var state = sync[id] ? sync[id].state : null;

            sync[id] = obj.common.sync;
            sync[id].pubState = pubState;
            sync[id].state = state;
            sync[id].type = obj.common.type;

            sync[id][adapter.namespace].topic           = sync[id][adapter.namespace].topic             || convertID2Topic(id, adapter.config.prefix, adapter.namespace);

            sync[id][adapter.namespace].publish         = sync[id][adapter.namespace].publish           || adapter.config.publish           || false;
            sync[id][adapter.namespace].pubChangesOnly  = sync[id][adapter.namespace].pubChangesOnly    || adapter.config.pubChangesOnly    || false;
            sync[id][adapter.namespace].pubAsObject     = sync[id][adapter.namespace].pubAsObject       || adapter.config.pubAsObject       || false;
            sync[id][adapter.namespace].qos             = parseInt(sync[id][adapter.namespace].qos      || adapter.config.qos, 10)          || 0;
            sync[id][adapter.namespace].retain          = sync[id][adapter.namespace].retain            || adapter.config.retain            || false;

            sync[id][adapter.namespace].subscribe       = sync[id][adapter.namespace].subscribe         || adapter.config.subscribe         || false;
            sync[id][adapter.namespace].subChangesOnly  = sync[id][adapter.namespace].subChangesOnly    || adapter.config.subChangesOnly    || false;
            sync[id][adapter.namespace].subAsObject     = sync[id][adapter.namespace].subAsObject       || adapter.config.subAsObject       || false;
            sync[id][adapter.namespace].subQos          = parseInt(sync[id][adapter.namespace].subQos   || adapter.config.subQos, 10)       || 0;
            sync[id][adapter.namespace].setAck          = sync[id][adapter.namespace].setAck            || adapter.config.setAck            || false;

            if (sync[id][adapter.namespace].subscribe) {
                subTopics[sync[id][adapter.namespace].topic] = sync[id][adapter.namespace].subQos;
                topic2id[sync[id][adapter.namespace].topic] = id;
                var sub = {};
                sub[sync[id][adapter.namespace].topic] = sync[id][adapter.namespace].subQos;
                subscribe(sub, function () { 
                    adapter.log.info('subscribed to ' + JSON.stringify(sub));
                });
            } else {
                delete subTopics[sync[id][adapter.namespace].topic];
                delete topic2id[sync[id][adapter.namespace].topic];
                unsubscribe(sync[id][adapter.namespace].topic, function () { 
                    adapter.log.info('unsubscribed from ' + sync[id][adapter.namespace].topic);
                });
            }

            adapter.log.info('enabled syncing of ' + id + ' (publish/subscribe:' + sync[id][adapter.namespace].publish.toString() + '/' + sync[id][adapter.namespace].subscribe.toString() + ')');
        } else {
            if (sync[id]) {
                if (sync[id][adapter.namespace]) {
                    unsubscribe(sync[id][adapter.namespace].topic, function () { 
                        adapter.log.info('unsubscribed from ' + sync[id][adapter.namespace].topic);
                    });
                    delete subTopics[sync[id][adapter.namespace].topic];
                    delete topic2id[sync[id][adapter.namespace].topic];
                }
                delete sync[id];
                adapter.log.info('disabled syncing of ' + id);
            }
        }
    },

    stateChange: function (id, state) {
        if (sync[id]) {
            sync[id].state = state;
            if (sync[id][adapter.namespace].enabled && sync[id][adapter.namespace].publish) {
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
        adapter.objects.getObjectView('sync', 'state', {}, function (err, doc) {
            if (doc && doc.rows) {
                for (var i = 0, l = doc.rows.length; i < l; i++) {
                    if (doc.rows[i].value && doc.rows[i].value.sync) {
                        var id = doc.rows[i].id;
                        sync[id] = doc.rows[i].value.sync;
                        sync[id].type = doc.rows[i].value.type;
                        sync[id][adapter.namespace].topic = sync[id][adapter.namespace].topic || convertID2Topic(id, adapter.config.prefix, adapter.namespace);
                        if (!sync[id][adapter.namespace] || sync[id][adapter.namespace].enabled === false) {
                            if (sync[id][adapter.namespace]) {
                                delete subTopics[sync[id][adapter.namespace].topic];
                                delete topic2id[sync[id][adapter.namespace].topic];
                            }
                            delete sync[id];
                        } else {
                            sync[id][adapter.namespace].publish         = sync[id][adapter.namespace].publish           || adapter.config.publish           || false;
                            sync[id][adapter.namespace].pubChangesOnly  = sync[id][adapter.namespace].pubChangesOnly    || adapter.config.pubChangesOnly    || false;
                            sync[id][adapter.namespace].pubAsObject     = sync[id][adapter.namespace].pubAsObject       || adapter.config.pubAsObject       || false;
                            sync[id][adapter.namespace].qos             = parseInt(sync[id][adapter.namespace].qos      || adapter.config.qos, 10)          || 0;
                            sync[id][adapter.namespace].retain          = sync[id][adapter.namespace].retain            || adapter.config.retain            || false;

                            sync[id][adapter.namespace].subscribe       = sync[id][adapter.namespace].subscribe         || adapter.config.subscribe         || false;
                            sync[id][adapter.namespace].subChangesOnly  = sync[id][adapter.namespace].subChangesOnly    || adapter.config.subChangesOnly    || false;
                            sync[id][adapter.namespace].subAsObject     = sync[id][adapter.namespace].subAsObject       || adapter.config.subAsObject       || false;
                            sync[id][adapter.namespace].subQos          = parseInt(sync[id][adapter.namespace].subQos   || adapter.config.subQos, 10)       || 0;
                            sync[id][adapter.namespace].setAck          = sync[id][adapter.namespace].setAck            || adapter.config.setAck            || false;

                            if (sync[id][adapter.namespace].subscribe) {
                                subTopics[sync[id][adapter.namespace].topic] = sync[id][adapter.namespace].subQos;
                                topic2id[sync[id][adapter.namespace].topic] = id;
                            } else {
                                delete subTopics[sync[id][adapter.namespace].topic];
                                delete topic2id[sync[id][adapter.namespace].topic];
                            }
                            adapter.log.info('enabled syncing of ' + id + ' (publish/subscribe:' + sync[id][adapter.namespace].publish.toString() + '/' + sync[id][adapter.namespace].subscribe.toString() + ')');
                        }
                    }
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
                        message: adapter.config.lastWillMessage,
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
        var topic = adapter.config.prefix && adapter.config.prefix !== '' ? adapter.config.prefix + '/' : '';
        topic += adapter.config.onConnectTopic;
        client.publish(topic, adapter.config.onConnectMessage, {qos: 2, retain: true}, function () {
            adapter.log.info('succesfully published ' + JSON.stringify({topic: topic, message: adapter.config.onConnectMessage}));
        });
    }
    //initially subscribe to topics
    if (Object.keys(subTopics).length) subscribe(subTopics, function () { 
        adapter.log.info('subscribed to ' + JSON.stringify(subTopics));
    });
}

function reconnect() {
    adapter.log.info('trying to reconnect to broker');
}

function disconnect() {
    adapter.log.info('disconnected from broker');
}

function offline() {
    adapter.log.info('client offline');
}

function error(err) {
    adapter.log.warn('client error: ' + err);
}

function message(topic, msg) {
    msg = msg.toString();
    var id = topic2id[topic] || convertTopic2ID(topic, adapter.config.prefix, adapter.namespace);
    adapter.log.info('received message ' + topic + '=>' + id + ': ' + msg);

    if (topic2id[topic] && sync[id] && sync[id][adapter.namespace]) {
        if (sync[id][adapter.namespace].subAsObject) {
            setStateObj(id, msg);
        } else {
            setStateVal(id, msg);
        }
    } else {
        adapter.log.info('received unknown topic!');
    }
}

function setStateObj(id, msg) {
    try {
        var obj = JSON.parse(msg);
        adapter.log.info(JSON.stringify(obj));
        if (obj.hasOwnProperty('val')) {
            if (obj.hasOwnProperty('ts') && sync[id].state && obj.ts <= sync[id].state.ts) {
                adapter.log.info('object ts not newer than current state ts: ' + msg);
                return false;
            }
            if (obj.hasOwnProperty('lc') && sync[id].state && obj.lc < sync[id].state.lc) {
                adapter.log.info('object lc not newer than current state lc: ' + msg);
                return false;
            }
            if (sync[id][adapter.namespace].publish && !obj.hasOwnProperty('ts') && !obj.hasOwnProperty('lc') && obj.val !== sync[id].state.val) {
                adapter.log.info('object value did not change (loop protection): ' + msg);
                return false;
            }
            if (sync[id][adapter.namespace].subChangesOnly && obj.val !== sync[id].state.val) {
                adapter.log.info('object value did not change: ' + msg);
                return false;
            }
            if (sync[id][adapter.namespace].setAck) obj.ack = true;
            adapter.setForeignState(id, obj);
            adapter.log.info('object set');
            return true;
        } else {
            adapter.log.warn('no value in object: ' + msg);
            return false;
        }
    } catch (e) {
        adapter.log.warn('could not parse message as object: ' + msg);
        return false;
    }
    return false;
}

function setStateVal(id, msg) {
    if ((sync[id][adapter.namespace].subChangesOnly || sync[id][adapter.namespace].publish) && sync[id].state && val2String(sync[id].state.val) === msg) {
        adapter.log.info('value did not change');
        return false;
    }
    adapter.setForeignState(id, stringToVal(msg), sync[id][adapter.namespace].setAck);
    adapter.log.info('value set');
    return true;
}

function publish(id, state) {
    if (client) {
        var settings = sync[id][adapter.namespace];
        if (!settings || !state) return false;
        if (sync[id].pubState && settings.pubChangesOnly && (state.ts !== state.lc)) return false;

        sync[id].pubState = state;
        adapter.log.info('publishing ' + id);

        var topic = convertID2Topic(id, null, adapter.config.prefix, adapter.namespace);
        var message = settings.pubAsObject ? JSON.stringify(state) : val2String(state.val);

        client.publish(topic, message, {qos: settings.qos, retain: settings.retain}, function () {
            adapter.log.info('succesfully published ' + id + ': ' + JSON.stringify({topic: topic, message: message}));
        });
        return true;
    }
}

function subscribe(topics, callback) {
    if (client) {
        client.subscribe(topics, callback);
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
    if (!sync[id] || !sync[id].type || sync[id].type === 'string' || sync[id].type === 'mixed') return val;
    if (sync[id].type === 'number') {
        if (val === true  || val === 'true')  val = 1;
        if (val === false || val === 'false') val = 0;
        val = val.replace(',', '.');
        val = parseFloat(val) || 0;
        return val;
    }
    if (sync[id].type === 'boolean') {
        if (val === '1' || val === 'true')  val = true;
        if (val === '0' || val === 'false') val = false;
        return !!val;
    }
    return val;
}

function convertID2Topic(id, prefix, namespace) {
    var topic;
    if (namespace && id.substring(0, namespace.length) == namespace) {
        topic = id.substring(namespace.length + 1);
    } else {
        topic = id;
    }
    if (prefix && prefix !== '') {
        topic = prefix + '.' + topic;
    }
    topic = topic.replace(/\./g, '/').replace(/_/g, ' ');
    return topic;
}

function convertTopic2ID(topic, prefix, namespace) {
    if (!topic) return topic;
    topic = topic.replace(/\//g, '.').replace(/\s/g, '_');
    if (topic[0] == '.') topic = topic.substring(1);
    if (topic[topic.length - 1] == '.') topic = topic.substring(0, topic.length - 1);
    // Remove own prefix if
    if (prefix && topic.substring(0, prefix.length) == prefix) {
        topic = topic.substring(prefix.length);
    }
    //add namespace to id
    if (namespace && namespace !== '') {
        topic = namespace + '.' + topic;
    }
    return topic;
}
