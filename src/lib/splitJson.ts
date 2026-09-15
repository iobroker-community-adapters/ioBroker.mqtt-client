/**
 * Splitting JSON payloads into single states (#322), e.g. zigbee2mqtt publishes
 * `zigbee2mqtt/<device>` = `{"battery":100,"occupancy":false,"color":{"x":0.3,"y":0.4}}`.
 * Pure functions, unit tested in test/unitSplitJson.js.
 */

/** Objects nested deeper than this are stored as JSON text */
export const MAX_SPLIT_DEPTH = 5;

/** Characters that are not allowed in ioBroker ids (same as `FORBIDDEN_CHARS` of js-controller) */
const FORBIDDEN_CHARS = /[^._\-/ :!#$%&()+=@^{}|~\p{Ll}\p{Lu}\p{Nd}]+/gu;

export interface SplitChannel {
    /** original JSON keys from the root of the message */
    path: string[];
}

export interface SplitLeaf {
    /** original JSON keys from the root of the message */
    path: string[];
    value: ioBroker.StateValue;
    type: ioBroker.CommonType;
    role: string;
}

export interface SplitResult {
    channels: SplitChannel[];
    leaves: SplitLeaf[];
}

/**
 * Checks if a topic matches a MQTT topic filter with the wildcards `+` (one level) and `#` (all remaining levels)
 *
 * @param topic topic without prefix, e.g. "zigbee2mqtt/sensor"
 * @param filter topic filter, e.g. "zigbee2mqtt/+"
 */
export function topicMatchesFilter(topic: string, filter: string): boolean {
    const topicLevels = topic.split('/');
    const filterLevels = filter.split('/');
    for (let i = 0; i < filterLevels.length; i++) {
        if (filterLevels[i] === '#') {
            return true;
        }
        if (i >= topicLevels.length) {
            return false;
        }
        if (filterLevels[i] !== '+' && filterLevels[i] !== topicLevels[i]) {
            return false;
        }
    }
    return topicLevels.length === filterLevels.length;
}

/**
 * Parses the comma separated filter list of `config.splitJsonTopics`
 *
 * @param list e.g. "zigbee2mqtt/+, zwave/#"
 */
export function parseTopicFilters(list: string | undefined): string[] {
    return (list || '')
        .split(',')
        .map(filter => filter.trim())
        .filter(filter => filter);
}

/**
 * Converts a JSON key into one level of an ioBroker id: dots, whitespace and forbidden characters become "_"
 *
 * @param key JSON key
 */
export function keyToIdPart(key: string): string {
    return key.replace(FORBIDDEN_CHARS, '_').replace(/[.\s]/g, '_') || '_';
}

/**
 * Parses a payload and returns the object if it is a JSON object (no array, no primitive)
 *
 * @param payload received payload
 */
export function parseJsonObject(payload: string): Record<string, unknown> | null {
    try {
        const parsed: unknown = JSON.parse(payload);
        return parsed !== null && typeof parsed === 'object' && !Array.isArray(parsed)
            ? (parsed as Record<string, unknown>)
            : null;
    } catch {
        return null;
    }
}

/**
 * Splits a JSON object into channels (nested objects) and leaves (values)
 *
 * @param obj parsed JSON object
 * @param maxDepth objects nested deeper are stored as JSON text
 */
export function splitJson(obj: Record<string, unknown>, maxDepth = MAX_SPLIT_DEPTH): SplitResult {
    const result: SplitResult = { channels: [], leaves: [] };
    const walk = (current: Record<string, unknown>, path: string[]): void => {
        for (const [key, value] of Object.entries(current)) {
            const childPath = [...path, key];
            if (value !== null && typeof value === 'object' && !Array.isArray(value) && childPath.length < maxDepth) {
                result.channels.push({ path: childPath });
                walk(value as Record<string, unknown>, childPath);
            } else {
                result.leaves.push({ path: childPath, ...toStateValue(value) });
            }
        }
    };
    walk(obj, []);
    return result;
}

function toStateValue(value: unknown): { value: ioBroker.StateValue; type: ioBroker.CommonType; role: string } {
    switch (typeof value) {
        case 'number':
            return { value, type: 'number', role: 'value' };
        case 'boolean':
            return { value, type: 'boolean', role: 'state' };
        case 'string':
            return { value, type: 'string', role: 'text' };
        default:
            if (value === null || value === undefined) {
                return { value: null, type: 'mixed', role: 'state' };
            }
            // arrays and objects nested too deep
            return { value: JSON.stringify(value), type: 'string', role: 'json' };
    }
}

/**
 * Builds the payload that sets one value, e.g. path ["color", "x"] and 0.5 → {"color":{"x":0.5}}
 *
 * @param path original JSON keys
 * @param value value to set
 */
export function buildSetPayload(path: string[], value: unknown): Record<string, unknown> {
    let payload: unknown = value;
    for (let i = path.length - 1; i >= 0; i--) {
        payload = { [path[i]]: payload };
    }
    return payload as Record<string, unknown>;
}
