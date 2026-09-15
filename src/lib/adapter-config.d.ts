// Augments the globally declared ioBroker types with everything this adapter adds.
// The attributes of `AdapterConfig` must be kept in sync with `native` in io-package.json
// and with admin/jsonConfig.json.

declare global {
    namespace ioBroker {
        interface AdapterConfig {
            /** IP address or hostname of the broker */
            host: string;
            port: number;
            /** 3 = MQTT 3.1, 4 = MQTT 3.1.1, 5 = MQTT 5 */
            mqttVersion: number;
            websocket: boolean;
            ssl: boolean;
            rejectUnauthorized: boolean;
            clientId: string;
            username: string;
            /** stored encrypted (`encryptedNative`) */
            password: string;

            onConnectTopic: string;
            onConnectMessage: string;
            onDisconnectTopic: string;
            onDisconnectMessage: string;
            lastWillTopic: string;
            lastWillMessage: string;

            /** comma separated list of additional topics to subscribe to */
            subscriptions: string;
            /** comma separated MQTT topic filters: JSON objects received on these topics are split into states (#322) */
            splitJsonTopics: string;
            /** milliseconds between two reconnection attempts - not in admin/jsonConfig.json */
            reconnectPeriod: number;
            /** prefix for publishing topics */
            outbox: string;
            /** prefix for subscribing topics */
            inbox: string;

            // Defaults of the per-object settings (admin/jsonCustom.json) - not in admin/jsonConfig.json.
            // Only `qos` and `subQos` are read by the adapter.
            enabled: boolean;
            publish: boolean;
            pubChangesOnly: boolean;
            pubAsObject: boolean;
            qos: number;
            retain: boolean;
            subscribe: boolean;
            subChangesOnly: boolean;
            subAsObject: boolean;
            subQos: number;
            setAck: boolean;
        }
    }
}

// this is required so the above is treated as a module
export {};
