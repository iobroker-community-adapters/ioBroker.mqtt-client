'use strict';

// Runs against the compiled code - call `npm run build` first
const assert = require('node:assert');
const { convertID2Topic, convertTopic2ID } = require('../build/lib/topics');

describe('lib/topics => convertID2Topic()', () => {
    it('replaces dots with slashes', () => {
        assert.strictEqual(convertID2Topic('hm-rpc.0.ABC0123456.1.STATE', 'mqtt-client.0'), 'hm-rpc/0/ABC0123456/1/STATE');
    });

    it('removes the own namespace', () => {
        assert.strictEqual(convertID2Topic('mqtt-client.0.foo.bar', 'mqtt-client.0'), 'foo/bar');
    });

    it('only removes the namespace on a level boundary', () => {
        assert.strictEqual(convertID2Topic('mqtt-client.01.foo', 'mqtt-client.0'), 'mqtt-client/01/foo');
    });

    it('replaces the mqtt wildcard "#" (e.g. shelly ids)', () => {
        assert.strictEqual(
            convertID2Topic('shelly.0.SHSW-1#B96701#1.Relay0.Switch', 'mqtt-client.0'),
            'shelly/0/SHSW-1_B96701_1/Relay0/Switch',
        );
    });

    it('replaces the mqtt wildcard "+"', () => {
        assert.strictEqual(convertID2Topic('javascript.0.my+state', 'mqtt-client.0'), 'javascript/0/my_state');
    });

    it('replaces slashes contained in the id so that no additional topic level is created', () => {
        assert.strictEqual(convertID2Topic('0_userdata.0.a/b', 'mqtt-client.0'), '0_userdata/0/a_b');
    });

    it('replaces whitespace', () => {
        assert.strictEqual(convertID2Topic('0_userdata.0.my state', 'mqtt-client.0'), '0_userdata/0/my_state');
    });

    it('works without a namespace', () => {
        assert.strictEqual(convertID2Topic('shelly.0.SHSW-1#B96701#1.online'), 'shelly/0/SHSW-1_B96701_1/online');
    });
});

describe('lib/topics => convertTopic2ID()', () => {
    it('replaces slashes with dots', () => {
        assert.strictEqual(convertTopic2ID('hm-rpc/0/ABC0123456/1/STATE'), 'hm-rpc.0.ABC0123456.1.STATE');
    });

    it('removes leading and trailing separators', () => {
        assert.strictEqual(convertTopic2ID('/foo/bar/'), 'foo.bar');
    });

    it('replaces whitespace', () => {
        assert.strictEqual(convertTopic2ID('foo/my state'), 'foo.my_state');
    });

    it('passes empty input through', () => {
        assert.strictEqual(convertTopic2ID(''), '');
    });
});
