/**
 * mqtt-client settings of a single object, stored in `common.custom['mqtt-client.<instance>']`
 * and edited with admin/jsonCustom.json. The values are normalized by `checkSettings()` in main.ts.
 */
export interface MqttCustomSettings {
    enabled: boolean;
    /** topic without prefix, derived from the id if empty */
    topic: string;

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

    /** `common.type` of the object, used to convert received strings (runtime only, not stored) */
    type?: ioBroker.CommonType;
    /** last published state, used by "changes only" (runtime only, not stored) */
    pubState?: ioBroker.State | null;
    /** last state change of the object (runtime only, not stored) */
    state?: ioBroker.State | null;
}

/** A state received as JSON when "subscribe as object" is enabled */
export type StateMessage = Partial<ioBroker.State>;
