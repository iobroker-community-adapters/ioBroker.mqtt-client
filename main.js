'use strict';

// The adapter-core module gives you access to the core ioBroker functions
// you need to create an adapter
const utils = require('@iobroker/adapter-core');
const mqtt  = require('mqtt');

let _context = {
	custom:      {},
	subTopics:   {},
	topic2id:    {},
	addTopics:   {},
	addedTopics: {},
};

let _subscribes = [];
let _connected = false;
let client = null;
let adapterFinished = false;

class MqttClient extends utils.Adapter {

	/**
	 * @param {Partial<ioBroker.AdapterOptions>} [options={}]
	 */

	constructor(options) {
		super({
			...options,
			name: 'mqtt-client',
		});
		this.on('ready',        this.onReady.bind(this));
		this.on('objectChange', this.onObjectChange.bind(this));
		this.on('stateChange',  this.onStateChange.bind(this));
		this.on('message',      this.onMessage.bind(this));
		this.on('unload',       this.onUnload.bind(this));
	}

	connect() {
		this.log.info('connected to broker');

		if (!this._connected) {
			this._connected = true;
			this.setState('info.connection', true, true);
		}

		if (this.config.onConnectTopic && this.config.onConnectMessage) {
			let topic = this.config.onConnectTopic;

			//add outgoing prefix
			if (this.config.outbox) {
				topic = this.config.outbox + '/' + topic;
			}

			client.publish(topic, this.config.onConnectMessage, { qos: 2, retain: true }, () =>
				this.log.debug('succesfully published ' + JSON.stringify({ topic: topic, message: this.config.onConnectMessage })));
		}

		const subTopics = _context.subTopics;
		const addTopics = _context.addTopics;

		//initially subscribe to topics
		if (Object.keys(subTopics).length) {
			this.subscribe(subTopics, () =>
				this.log.debug('subscribed to: ' + JSON.stringify(subTopics)));
		}
		if (Object.keys(addTopics).length) {
			this.subscribe(addTopics, () =>
				this.log.debug('subscribed to additional topics: ' + JSON.stringify(addTopics)));
		}
	}

	reconnect() {
		this.log.info('trying to reconnect to broker');
	}

	disconnect() {
		if (_connected) {
			_connected = false;
			this.setState('info.connection', false, true);
		}
		this.log.warn('disconnected from broker');
	}

	offline() {
		if (_connected) {
			_connected = false;
			this.setState('info.connection', false, true);
		}
		this.log.warn('client offline');
	}

	error(err) {
		this.log.warn('client error: ' + err);
	}

	message(topic, msg) {
		const custom = _context.custom;
		const topic2id = _context.topic2id;
		const addedTopics = _context.addedTopics;
		msg = msg.toString();
		this.log.debug('received message ' + msg);

		//remove inbox prefix if exists
		if (this.config.inbox && topic.substring(0, this.config.inbox.length) === this.config.inbox) {
			topic = topic.substr(this.config.inbox.length + 1);
		}

		//if topic2id[topic] does not exist automatically convert topic to id with guiding adapter namespace
		const id = topic2id[topic] || this.convertTopic2ID(topic, this.namespace);

		this.log.debug('for id ' + id + '=>' + JSON.stringify(custom[id]));

		if (topic2id[topic] && custom[id] && custom[id]) {

			if (custom[id].subAsObject) {
				this.setStateObj(id, msg);
			} else {
				this.setStateVal(id, msg);
			}
		} else if (!addedTopics[topic]) {
			addedTopics[topic] = null;
			let obj = {
				type: 'state',
				role: 'text',
				common: {
					name: id.split('.').pop(),
					type: 'mixed',
					read: true,
					write: true,
					desc: 'created from topic',
					custom: {
					}
				},
				native: {
					topic: topic
				}
			};
			obj.common.custom[this.namespace] = {
				enabled: true,
				topic: topic,
				publish: false,
				pubChangesOnly: false,
				pubAsObject: false,
				qos: 0,
				retain: false,
				subscribe: true,
				subChangesOnly: false,
				subAsObject: false,
				subQos: 0,
				setAck: true
			};
			this.setObjectNotExists(id, obj, () =>
				this.log.debug('created and subscribed to new state: ' + id));
		} else {
			this.log.debug('state already exists');
		}
	}

	setStateObj(id, msg) {
		this.getForeignState(id, (err, state) => {
			try {
				const obj = JSON.parse(msg);
				this.log.debug(JSON.stringify(obj));

				if (obj.hasOwnProperty('val')) {
					const custom = _context.custom;
					if (obj.hasOwnProperty('ts') && state && obj.ts <= state.ts) {
						this.log.debug('object ts not newer than current state ts: ' + msg);
						return false;
					}
					if (obj.hasOwnProperty('lc') && state && obj.lc < state.lc) {
						this.log.debug('object lc not newer than current state lc: ' + msg);
						return false;
					}
					// todo: !== correct???
					if (this.config.inbox === this.config.outbox &&
						custom[id].publish &&
						!obj.hasOwnProperty('ts') &&
						!obj.hasOwnProperty('lc') &&
						obj.val !== state.val) {
						this.log.debug('object value did not change (loop protection): ' + msg);
						return false;
					}
					// todo: !== correct???
					if (custom[id].subChangesOnly && obj.val !== state.val) {
						this.log.debug('object value did not change: ' + msg);
						return false;
					}
					if (custom[id].setAck) obj.ack = true;
					if (obj && obj.from) delete obj.from;
					this.setForeignState(id, obj);
					this.log.debug('object set (as object) to ' + JSON.stringify(obj));
					return true;
				} else {
					this.log.warn('no value in object: ' + msg);
					return false;
				}
			} catch (e) {
				this.log.warn('could not parse message as object: ' + msg);
				return false;
			}
		});
	}

	setStateVal(id, msg) {
		const custom = _context.custom;
		//this.log.debug('state for id: '+ id);
		this.getForeignState(id, (err, state) => {

			if (state && this.val2String(state.val) === msg) {
				//this.log.debug('setVAL: ' + JSON.stringify(state) + '; value: ' + this.val2String(state.val) + '=> ' + msg);
				if (this.config.inbox === this.config.outbox && custom[id].publish) {
					this.log.debug('value did not change (loop protection)');
					return false;
				} else if (custom[id].subChangesOnly) {
					this.log.debug('value did not change');
					return false;
				}
			}
			const _state = {val: this.stringToVal(custom, id, msg), ack: custom[id].setAck};
			this.setForeignState(id, _state);
			this.log.debug('value set to ' + JSON.stringify(_state));
			return true;
		});
	}

	publish(id, state) {
		if (client) {
			const custom = _context.custom;
			const settings = custom[id];
			if (!settings || !state) return false;
			if (custom[id].pubState && settings.pubChangesOnly && (state.ts !== state.lc)) return false;

			custom[id].pubState = state;
			this.log.debug('publishing ' + id);

			let topic = settings.topic;

			const message = settings.pubAsObject ? JSON.stringify(state) : this.val2String(state.val);

			//add outgoing prefix
			if (this.config.outbox) {
				topic = this.config.outbox + '/' + topic;
			}

			client.publish(topic, message, { qos: settings.qos, retain: settings.retain }, () =>
				this.log.debug('successfully published ' + id + ': ' + JSON.stringify({ topic: topic, message: message })));

			return true;
		}
	}

	unpublish(id) {
		if (client) {
			const custom = _context.custom;
			const settings = custom[id];
			if (!settings) return false;

			custom[id].pubState = null;
			this.log.debug('unpublishing ' + id);

			let topic = settings.topic;
			//add outgoing prefix
			if (this.config.outbox) {
				topic = this.config.outbox + '/' + topic;
			}

			client.publish(topic, null, { qos: settings.qos, retain: false }, () =>
				this.log.debug('successfully unpublished ' + id));

			return true;
		}
	}

	subscribe(topics, callback) {
		if (client) {
			let subTopics = {};

			if (this.config.inbox) {
				//add inbox prefix to all subscriptions
				const keys = Object.keys(topics);
				for (let j = 0; j < keys.length; j++) {
					const key = this.config.inbox + '/' + keys[j];
					subTopics[key] = topics[keys[j]];
				}
			} else {
				subTopics = topics;
			}

			//this.log.debug('Subscribed: ' + subTopics);
			client.subscribe(subTopics, callback);
		}
	}

	unsubscribe(topic, callback) {
		client && client.unsubscribe(topic, callback);
	}

	iobSubscribe(id) {
		if (!_subscribes.includes(id)) {
			_subscribes.push(id);
			_subscribes.sort();
			this.subscribeForeignStates(id);
		}
	}

	iobUnsubscribe(id) {
		const pos = _subscribes.indexOf(id);
		if (pos !== -1) {
			_subscribes.splice(pos, 1);
			this.unsubscribeForeignStates(id);
		}
	}

	val2String(val) {
		return val === null ? 'null' : (val === undefined ? 'undefined' : val.toString());
	}

	stringToVal(custom, id, val) {
		if (val === 'undefined' || val === undefined) return undefined;
		if (val === 'null' || val === null) return null;
		if (!custom[id] || !custom[id].type || custom[id].type === 'string' || custom[id].type === 'mixed') return val;

		if (custom[id].type === 'number') {
			if (val === true  || val === 'true')  val = 1;
			if (val === false || val === 'false') val = 0;
			val = val.replace(',', '.');
			val = parseFloat(val) || 0;
			return val;
		}
		if (custom[id].type === 'boolean') {
			if (val === '1' || val === 'true') val = true;
			if (val === '0' || val === 'false') val = false;
			return !!val;
		}
		return val;
	}

	convertID2Topic(id, namespace) {
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

	convertTopic2ID(topic, namespace) {
		if (!topic) return topic;

		//replace slashes with dots and spaces with underscores
		topic = topic.replace(/\//g, '.').replace(/\s/g, '_');

		//replace guiding and trailing dot
		if (topic[0] === '.') topic = topic.substring(1);
		if (topic[topic.length - 1] === '.') topic = topic.substring(0, topic.length - 1);

		//add namespace to id if exists
		//if (namespace && namespace !== '') {
		//	topic = namespace + '.' + topic;
		//}
		return topic;
	}

	checkSettings(id, custom, aNamespace, qos, subQos) {
		custom.topic = custom.topic || this.convertID2Topic(id, aNamespace);
		custom.enabled = custom.enabled === true;
		custom.publish = custom.publish === true;
		custom.pubChangesOnly = custom.pubChangesOnly === true;
		custom.pubAsObject = custom.pubAsObject === true;
		custom.retain = custom.retain === true;
		custom.qos = parseInt(custom.qos || qos, 10) || 0;

		custom.subscribe = custom.subscribe === true;
		custom.subChangesOnly = custom.subChangesOnly === true;
		custom.subAsObject = custom.subAsObject === true;
		custom.setAck = custom.setAck !== false;
		custom.subQos = parseInt(custom.subQos || subQos, 10) || 0;
	}

	getObjects(adapter, ids, callback, _result) {
		_result = _result || {};
		//const that=this;
		if (!ids || !ids.length) {
			callback(_result);
		} else {
			//adapter.log.info('IDs:' + ids);
			adapter.getForeignObject(ids.shift(), (err, obj) => {
				if (obj) {
					_result[obj._id] = obj;
				}
				setImmediate(adapter.getObjects, adapter, ids, callback, _result);
			});
		}
	}

	main() {
		this.getState('info.connection', (err, state) => {
			(!state || state.val) && this.setState('info.connection', false, true);

			if (this.config.host && this.config.host !== '') {
				const custom = _context.custom;
				const subTopics = _context.subTopics;
				const topic2id = _context.topic2id;
				const addTopics = _context.addTopics;

				const _url  = (!this.config.ssl ? 'mqtt' : 'mqtts') + '://' + (this.config.username ? (this.config.username + ':' + this.config.password + '@') : '') + this.config.host + (this.config.port ? (':' + this.config.port) : '') + '?clientId=' + this.config.clientId;
				const __url = (!this.config.ssl ? 'mqtt' : 'mqtts') + '://' + (this.config.username ? (this.config.username + ':*******************@')          : '') + this.config.host + (this.config.port ? (':' + this.config.port) : '') + '?clientId=' + this.config.clientId;

				this.getObjectView('system', 'custom', {}, (err, doc) => {
					const ids = [];
					if (doc && doc.rows) {
						for (let i = 0, l = doc.rows.length; i < l; i++) {
							const cust = doc.rows[i].value;
							if (cust && cust[this.namespace] && cust[this.namespace].enabled) {
								ids.push(doc.rows[i].id);
							}
						}
					}

					// we need type of object
					this.getObjects(this, ids, objs => {
						Object.keys(objs).forEach(id => {
							custom[id] = objs[id].common.custom[this.namespace];
							custom[id].type = objs[id].common.type;
							this.log.debug('complete Custom: ' + JSON.stringify(custom));

							this.checkSettings(id, custom[id], this.namespace, this.config.qos, this.config.subQos);

							if (custom[id].subscribe) {
								subTopics[custom[id].topic] = custom[id].subQos;
								topic2id[custom[id].topic] = id;
							}

							// subscribe on changes
							if (custom[id].enabled) {
								this.iobSubscribe(id);
							}

							this.log.info('enabled syncing of ' + id + ' (publish/subscribe:' + custom[id].publish.toString() + '/' + custom[id].subscribe.toString() + ')');
						});

						this.config.subscriptions && this.config.subscriptions.split(',').forEach(topic => {
							if (topic && topic.trim()) {
								addTopics[topic.trim()] = 0; // QoS
							}
						});

						let will = undefined;

						if (this.config.lastWillTopic && this.config.lastWillMessage) {
							this.log.info('Try to connect to ' + __url + ' with lwt "' + this.config.lastWillTopic + '"');

							will = {
								topic:   this.config.lastWillTopic,
								payload: this.config.lastWillMessage,
								qos:     2,
								retain:  true
							};
						} else {
							this.log.info('Try to connect to ' + __url);
						}

						client = mqtt.connect(_url, {
							host:            this.config.host,
							port:            this.config.port,
							ssl:             this.config.ssl,
							reconnectPeriod: this.config.reconnectPeriod,
							username:        this.config.username,
							password:        this.config.password,
							clientId:        this.config.clientId,
							clean:           true,
							will
						});

						client.on('connect',    this.connect.bind(this));
						client.on('reconnect',  this.reconnect.bind(this));
						client.on('disconnect', this.disconnect.bind(this));
						client.on('offline',    this.offline.bind(this));
						client.on('message',    this.message.bind(this));
						client.on('error',      this.error.bind(this));
					});
				});
			}

			this.subscribeForeignObjects('*');
		});
	}

	/**
     * Is called when databases are this. and adapter received configuration.
     */
	async onReady() {

		client = null;
		_subscribes = [];
		_connected = false;

		this.main();
	}

	/**
	 * Is called when adapter shuts down - callback has to be called under any circumstances!
	 * @param {() => void} callback
	 */
	finish(callback) {
		if (adapterFinished) {
			return;
		}
		this.log.info('cleaned everything up...');
		client && client.end();
		callback && setTimeout(callback, 200);
		adapterFinished = true;
	}

	/**
	 * Is called when adapter shuts down - callback has to be called under any circumstances!
	 * @param {() => void} callback
	 */
	onUnload(callback) {
		try {
			this.finish(callback);
			//if (callback) callback();
		} catch (e) {
			if (callback) callback();
		}
	}


	/**
	 * Is called if a subscribed object changes
	 * @param {string} id
	 * @param {ioBroker.Object | null | undefined} obj
	 */
	onObjectChange(id, obj) {
		const custom    = _context.custom;
		const subTopics = _context.subTopics;
		const topic2id  = _context.topic2id;

		if (obj && obj.common && obj.common.custom && obj.common.custom[this.namespace] && obj.common.custom[this.namespace].enabled) {
			//const pubState = custom[id] ? custom[id].pubState : null;
			//const state = custom[id] ? custom[id].state : null;

			custom[id] = obj.common.custom[this.namespace];
			//this.log.info('object common: ' + JSON.stringify(obj.common.custom[this.namespace]));
			//custom[id].pubState = pubState;
			//custom[id].state = state;
			custom[id].type = obj.common.type;


			this.checkSettings(id, custom[id], this.namespace, this.config.qos, this.config.subQos);

			if (custom[id].subscribe) {
				subTopics[custom[id].topic] = custom[id].subQos;
				topic2id[custom[id].topic] = id;
				const sub = {};
				sub[custom[id].topic] = custom[id].subQos;

				this.subscribe(sub, () =>
					this.log.info('subscribed to ' + JSON.stringify(sub)));
			} else {
				delete subTopics[custom[id].topic];
				delete topic2id[custom[id].topic];
				this.iobUnsubscribe(id);

				this.unsubscribe(custom[id].topic, () =>
					this.log.info('unsubscribed from ' + custom[id].topic));
			}

			if (custom[id].enabled) {
				this.iobSubscribe(id);
			}

			this.log.info('enabled syncing of ' + id +
				' (publish/subscribe:' + custom[id].publish.toString() +
				'/' + custom[id].subscribe.toString() + ')');
		} else if (custom[id]) {
			const topic = custom[id].topic;

			this.unsubscribe(topic, () =>
				this.log.info('unsubscribed from ' + topic));

			if (subTopics[custom[id].topic]) {
				delete subTopics[custom[id].topic];
			}
			if (topic2id[custom[id].topic]) {
				delete topic2id[custom[id].topic];
			}
			if (custom[id].publish) {
				this.iobUnsubscribe(id);
			}

			delete custom[id];

			this.log.info('disabled syncing of ' + id);
		}
	}

	/**
	 * Is called if a subscribed state changes
	 * @param {string} id
	 * @param {ioBroker.State | null | undefined} state
	 */
	onStateChange(id, state) {
		const custom = _context.custom;

		if (custom[id]) {
			custom[id].state = state;

			if (custom[id].enabled && custom[id].publish) {
				if (!state) {
					// The state was deleted/expired, make sure it is no longer retained
					this.unpublish(id);
				} else if (state.from !== 'system.adapter.' + this.namespace) {
					// prevent republishing to same broker
					this.publish(id, state);
				}
			}
		}
	}

	/**
	 * Some message was sent to this instance over message box. Used by email, pushover, text2speech, ...
	 * Using this method requires "common.message" property to be set to true in io-package.json
	 * @param {ioBroker.Message} obj
	 */
	onMessage(obj) {
		if (typeof obj === 'object' && obj.command) {
			if (obj.command === 'stopInstance') {
				// e.g. send email or pushover or whatever
				this.log.info('Stop Instance command received...');

				this.finish(() => {
					this.sendTo(obj.from, obj.command, 'Message received', obj.callback);
					setTimeout(() => this.terminate ? this.terminate() : process.exit(0), 200);
				});
				// Send response in callback if required
				// if (obj.callback) this.sendTo(obj.from, obj.command, 'Message received', obj.callback);
			}
		}
	}
}

// @ts-ignore parent is a valid property on module
if (module.parent) {
	// Export the constructor in compact mode
	/**
	 * @param {Partial<ioBroker.AdapterOptions>} [options={}]
	 */
	module.exports = (options) => new MqttClient(options);
} else {
	// otherwise start the instance directly
	new MqttClient();
}
