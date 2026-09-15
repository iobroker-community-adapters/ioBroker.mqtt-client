'use strict';

// Runs against the compiled code - call `npm run build` first
const assert = require('node:assert');
const {
    topicMatchesFilter,
    parseTopicFilters,
    keyToIdPart,
    parseJsonObject,
    splitJson,
    buildSetPayload,
} = require('../build/lib/splitJson');

describe('lib/splitJson => topicMatchesFilter()', () => {
    const cases = [
        ['zigbee2mqtt/sensor', 'zigbee2mqtt/+', true],
        ['zigbee2mqtt/sensor/availability', 'zigbee2mqtt/+', false],
        ['zigbee2mqtt', 'zigbee2mqtt/+', false],
        ['zigbee2mqtt/bridge/devices', 'zigbee2mqtt/#', true],
        ['zigbee2mqtt', 'zigbee2mqtt/#', true],
        ['zigbee2mqtt/sensor', 'zigbee2mqtt/sensor', true],
        ['zigbee2mqtt/sensor', 'zigbee2mqtt/other', false],
        ['a/b/c', '+/b/+', true],
        ['a/b/c', '#', true],
        ['other/sensor', 'zigbee2mqtt/+', false],
    ];
    for (const [topic, filter, expected] of cases) {
        it(`"${topic}" ${expected ? 'matches' : 'does not match'} "${filter}"`, () => {
            assert.strictEqual(topicMatchesFilter(topic, filter), expected);
        });
    }
});

describe('lib/splitJson => parseTopicFilters()', () => {
    it('splits a comma separated list and removes empty entries', () => {
        assert.deepStrictEqual(parseTopicFilters(' zigbee2mqtt/+ ,, zwave/# ,'), ['zigbee2mqtt/+', 'zwave/#']);
    });

    it('returns no filter for an empty or missing list', () => {
        assert.deepStrictEqual(parseTopicFilters(''), []);
        assert.deepStrictEqual(parseTopicFilters(undefined), []);
    });
});

describe('lib/splitJson => keyToIdPart()', () => {
    it('replaces dots, whitespace and forbidden characters', () => {
        assert.strictEqual(keyToIdPart('a.b c'), 'a_b_c');
        assert.strictEqual(keyToIdPart('temp*[1]'), 'temp_1_');
        assert.strictEqual(keyToIdPart('linkquality'), 'linkquality');
    });

    it('never returns an empty id part', () => {
        assert.strictEqual(keyToIdPart(''), '_');
    });
});

describe('lib/splitJson => parseJsonObject()', () => {
    it('returns JSON objects only', () => {
        assert.deepStrictEqual(parseJsonObject('{"a":1}'), { a: 1 });
        assert.strictEqual(parseJsonObject('[1,2]'), null);
        assert.strictEqual(parseJsonObject('42'), null);
        assert.strictEqual(parseJsonObject('null'), null);
        assert.strictEqual(parseJsonObject('online'), null);
    });
});

describe('lib/splitJson => splitJson()', () => {
    it('converts values to typed leaves and nested objects to channels', () => {
        const result = splitJson({
            battery: 100,
            occupancy: false,
            action: 'on',
            last_seen: null,
            color: { x: 0.3, y: 0.4 },
            groups: [1, 2],
        });
        assert.deepStrictEqual(result.channels, [{ path: ['color'] }]);
        assert.deepStrictEqual(result.leaves, [
            { path: ['battery'], value: 100, type: 'number', role: 'value' },
            { path: ['occupancy'], value: false, type: 'boolean', role: 'state' },
            { path: ['action'], value: 'on', type: 'string', role: 'text' },
            { path: ['last_seen'], value: null, type: 'mixed', role: 'state' },
            { path: ['color', 'x'], value: 0.3, type: 'number', role: 'value' },
            { path: ['color', 'y'], value: 0.4, type: 'number', role: 'value' },
            { path: ['groups'], value: '[1,2]', type: 'string', role: 'json' },
        ]);
    });

    it('stores objects nested deeper than the limit as JSON text', () => {
        const result = splitJson({ a: { b: { c: 1 } } }, 2);
        assert.deepStrictEqual(result.channels, [{ path: ['a'] }]);
        assert.deepStrictEqual(result.leaves, [{ path: ['a', 'b'], value: '{"c":1}', type: 'string', role: 'json' }]);
    });
});

describe('lib/splitJson => buildSetPayload()', () => {
    it('builds the nested object for a path', () => {
        assert.deepStrictEqual(buildSetPayload(['color', 'x'], 0.5), { color: { x: 0.5 } });
        assert.deepStrictEqual(buildSetPayload(['state'], 'ON'), { state: 'ON' });
    });
});
