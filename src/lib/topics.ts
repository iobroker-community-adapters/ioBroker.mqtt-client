/**
 * Characters that must not end up in an automatically derived topic:
 * - '+' and '#' are wildcards and are not allowed in a topic name (MQTT 5.0, 4.7.0)
 * - '/' is the topic level separator and would add levels that do not exist in the id
 * - whitespace is valid in a topic, but must not end up in ioBroker ids; convertTopic2ID() maps it to '_' as well
 */
const INVALID_TOPIC_CHARS = /[+#/\s]/g;

/**
 * Convert an ioBroker id into a valid mqtt topic
 *
 * @param id ioBroker id, e.g. "shelly.0.SHSW-1#B96701#1.Relay0.Switch"
 * @param namespace adapter namespace to strip from the id, e.g. "mqtt-client.0"
 * @returns mqtt topic, e.g. "shelly/0/SHSW-1_B96701_1/Relay0/Switch"
 */
export function convertID2Topic(id: string, namespace?: string): string {
    let topic: string;

    // if necessary, remove namespace before converting, e.g. "mqtt-client.0..."
    if (namespace && id.startsWith(`${namespace}.`)) {
        topic = id.substring(namespace.length + 1);
    } else {
        topic = id;
    }

    //replace characters that must not end up in a derived topic. This must happen before dots become separators
    topic = topic.replace(INVALID_TOPIC_CHARS, '_');

    //replace dots with slashes
    topic = topic.replace(/\./g, '/');
    return topic;
}

/**
 * Convert a mqtt topic into an ioBroker id
 *
 * @param topic mqtt topic (without prefix)
 * @returns ioBroker id
 */
export function convertTopic2ID(topic: string): string {
    if (!topic) {
        return topic;
    }

    //replace slashes with dots and spaces with underscores
    topic = topic.replace(/\//g, '.').replace(/\s/g, '_');

    //replace leading and trailing dot
    if (topic[0] === '.') {
        topic = topic.substring(1);
    }
    if (topic[topic.length - 1] === '.') {
        topic = topic.substring(0, topic.length - 1);
    }

    return topic;
}
