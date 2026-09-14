'use strict';

/**
 * Polls until the condition returns a truthy value
 *
 * @template T
 * @param {() => T | Promise<T>} condition
 * @param {string} description used in the error message
 * @param {number} timeout milliseconds
 * @returns {Promise<T>} the truthy value
 */
async function waitFor(condition, description, timeout = 3000) {
    const start = Date.now();
    for (;;) {
        const result = await condition();
        if (result) {
            return result;
        }
        if (Date.now() - start > timeout) {
            throw new Error(`Timeout after ${timeout} ms waiting for: ${description}`);
        }
        await new Promise(resolve => setTimeout(resolve, 20));
    }
}

/**
 * @param {number} ms
 * @returns {Promise<void>}
 */
function sleep(ms) {
    return new Promise(resolve => setTimeout(resolve, ms));
}

module.exports = { waitFor, sleep };
