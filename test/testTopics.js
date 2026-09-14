'use strict';

const { expect } = require('chai');
const { convertID2Topic, convertTopic2ID } = require('../lib/topics');

describe('lib/topics => convertID2Topic()', () => {
    it('replaces dots with slashes', () => {
        expect(convertID2Topic('hm-rpc.0.ABC0123456.1.STATE', 'mqtt-client.0')).to.equal(
            'hm-rpc/0/ABC0123456/1/STATE',
        );
    });

    it('removes the own namespace', () => {
        expect(convertID2Topic('mqtt-client.0.foo.bar', 'mqtt-client.0')).to.equal('foo/bar');
    });

    it('only removes the namespace on a level boundary', () => {
        expect(convertID2Topic('mqtt-client.01.foo', 'mqtt-client.0')).to.equal('mqtt-client/01/foo');
    });

    it('replaces the mqtt wildcard "#" (e.g. shelly ids)', () => {
        expect(convertID2Topic('shelly.0.SHSW-1#B96701#1.Relay0.Switch', 'mqtt-client.0')).to.equal(
            'shelly/0/SHSW-1_B96701_1/Relay0/Switch',
        );
    });

    it('replaces the mqtt wildcard "+"', () => {
        expect(convertID2Topic('javascript.0.my+state', 'mqtt-client.0')).to.equal('javascript/0/my_state');
    });

    it('replaces slashes contained in the id so that no additional topic level is created', () => {
        expect(convertID2Topic('0_userdata.0.a/b', 'mqtt-client.0')).to.equal('0_userdata/0/a_b');
    });

    it('replaces whitespace', () => {
        expect(convertID2Topic('0_userdata.0.my state', 'mqtt-client.0')).to.equal('0_userdata/0/my_state');
    });

    it('works without a namespace', () => {
        expect(convertID2Topic('shelly.0.SHSW-1#B96701#1.online')).to.equal('shelly/0/SHSW-1_B96701_1/online');
    });
});

describe('lib/topics => convertTopic2ID()', () => {
    it('replaces slashes with dots', () => {
        expect(convertTopic2ID('hm-rpc/0/ABC0123456/1/STATE')).to.equal('hm-rpc.0.ABC0123456.1.STATE');
    });

    it('removes leading and trailing separators', () => {
        expect(convertTopic2ID('/foo/bar/')).to.equal('foo.bar');
    });

    it('replaces whitespace', () => {
        expect(convertTopic2ID('foo/my state')).to.equal('foo.my_state');
    });

    it('passes empty input through', () => {
        expect(convertTopic2ID('')).to.equal('');
    });
});
