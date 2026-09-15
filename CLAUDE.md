# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## What this is

`iobroker.mqtt-client` is an ioBroker adapter that connects to an external MQTT broker and syncs **other adapters' states** with it. Which states are synced is configured per object in `common.custom['mqtt-client.<i>']` (the "custom" dialog in admin), not in the instance config. Additionally, topics listed in `config.subscriptions` create new states inside the adapter's own namespace.

TypeScript (CommonJS output). Sources live in `src/`, the published/runnable code is the compiled `build/` (`package.json` `main` is `build/main.js`). `build/` is gitignored — always run the build before starting the adapter or the tests.

## Commands

```bash
npm run build                             # tsc -p tsconfig.build.json  -> build/
npm run watch                             # same in watch mode
npm run check                             # type check only (tsconfig.json, noEmit)
npm run lint                              # eslint (@iobroker/eslint-config, flat config)
npx eslint -c eslint.config.mjs --fix src # autofix + prettier formatting

npm run test:unit                         # topic conversion + adapter tests - run against build/, build first!
npx mocha test/unitAdapter --exit --grep "loop protection"   # single adapter test (MQTT_CLIENT_TEST_LOG=1 prints the adapter log)
npm run test:package                      # validates package.json / io-package.json / admin JSON (fast)
npm run test:integration                  # starts a real js-controller + adapter instance
npm run release-patch                     # @alcalzone/release-script, moves README changelog into io-package news
```

There is deliberately **no `prepare` script** — `npm ci`/`npm install` does not build. Because `build/` is neither committed nor built on install, `common.nogit` is `true` in `io-package.json`: the adapter can only be installed from npm, not from GitHub. The integration test requires that **no** js-controller is running on the machine, otherwise it aborts with "JS-Controller is already running!".

## Architecture

### Layout

| Path | Content |
| --- | --- |
| `src/main.ts` | the whole adapter: one `MqttClient extends utils.Adapter` class |
| `src/lib/topics.ts` | `convertID2Topic()` / `convertTopic2ID()` - pure functions, unit tested in `test/unitTopics.js` |
| `src/lib/types.ts` | `MqttCustomSettings` (per-object settings) and `StateMessage` |
| `src/lib/adapter-config.d.ts` | augments `ioBroker.AdapterConfig` |
| `admin/jsonConfig.json` | instance configuration (broker, prefixes, additional subscriptions) |
| `admin/jsonCustom.json` | per-object settings (topic, publish, subscribe) |

`src/lib/adapter-config.d.ts` is hand-maintained and must be kept in sync with `native` in `io-package.json` **and** with `admin/jsonConfig.json` — nothing generates it. `native` contains keys that have no field in `jsonConfig.json`: `reconnectPeriod` and the defaults of the per-object settings (`enabled` … `setAck`, of which only `qos`/`subQos` are read).

### Startup

`onReady()` requests the `system/custom` view and **at the same time** subscribes to all foreign objects (`subscribeForeignObjects('*')`). `startClient()` loads every object whose custom settings are enabled, normalizes them with `checkSettings()`, fills the caches and then calls `mqtt.connect()`. The URL only contains protocol, host and port; user name, password and client ID are passed as options — mqtt.js parses the URL with `url.parse`, so credentials in the URL break on `%` or `:` and override the options (#200). On every broker `connect` event all cached topics are (re)subscribed and the on-connect message is published.

All runtime state lives in instance fields (`custom`, `subTopics`, `topic2id`, `addTopics`, `addedTopics`) — the JS version kept them in a module global that was shared between instances in compact mode.

### Per-object settings

- `onObjectChange()` is the single place where settings are added, changed or removed at runtime. The cached `custom[id]` is the object's `common.custom` entry mutated by `checkSettings()` plus runtime-only fields (`type`, `pubState`, `state`, see `MqttCustomSettings`).
- `checkSettings()` coerces the stored values: booleans must be `=== true` (except `setAck`, which is `!== false`), `qos`/`subQos` fall back to the instance config.
- An empty `topic` is derived with `convertID2Topic()`. The derived topic is **not stored** in the object, so changing the conversion changes the topics of existing installations.

### Topics

- `convertID2Topic()`: strips the own namespace (only on a level boundary), replaces `+`, `#`, `/` and whitespace with `_`, then dots with `/`.
- `convertTopic2ID()`: `/` → `.`, whitespace → `_`, strips a leading/trailing dot. Used for received topics that are not in `topic2id`.
- `topic2id` maps topics to ids for subscribed objects. Two ids with the same topic are logged as a warning by `addTopic2Id()`; the last one wins.
- `config.outbox` is prepended to published topics, `config.inbox` to subscribed topics and stripped from received topics (`topicAddPrefixOut` / `topicAddPrefixIn` / `topicRemovePrefixIn`). Both are trimmed on startup.

### Publishing (ioBroker → broker)

`onStateChange()` → `publishState()`. States written by this adapter itself (`state.from === system.adapter.<ns>`) are not published again. "changes only" compares `ts` and `lc`. A deleted/expired state (`state === null`) publishes an empty retained payload (`unpublish()`) to clear the retained message.

### Subscribing (broker → ioBroker)

`onBrokerMessage()`:

- known topic + `subscribe` enabled → `setStateVal()` (string payload converted by `common.type` in `stringToVal()`) or `setStateObj()` (JSON state, respects `ts`/`lc`).
- unknown topic → a new state `mqtt-client.<i>.<converted topic>` is created with subscribe enabled; `onObjectChange()` then picks it up. The message that triggers the creation is **not** written to the state. Until `onObjectChange()` has added the topic to `topic2id`, the `addedTopics` set blocks further creation attempts; `onObjectChange()` removes the topic from the set when the object is deleted or its syncing is disabled, and a failed creation removes it right away.
- Loop protection: when `inbox === outbox` and the object also publishes, an unchanged value is not written back.

### Shutdown

`onUnload()` → `finish()` publishes the on-disconnect message (if configured) and `end()` closes the client. The `stopInstance` message (`common.supportStopInstance`) does the same and then terminates the process.

### Legacy behaviour kept on purpose

These look wrong but are kept to not change behaviour; they are marked with comments in `src/main.ts`:

- The publish-once after enabling an object in `onObjectChange()` only happens when the id was not subscribed before.

## Tests

- `test/unitTopics.js` — `convertID2Topic()` / `convertTopic2ID()`.
- `test/unitAdapter.js` — the adapter logic end to end without js-controller. `@iobroker/adapter-core` is replaced via `require.cache` by `test/lib/adapterMock.js`: objects and states live in memory, `objectChange`/`stateChange` are emitted like js-controller does, and log, `sendTo` and `terminate` are recorded (helpers start with `test`). The MQTT side is real: an `aedes` broker (`test/lib/testBroker.js`) and a second client that plays the remote side (`test/lib/testClient.js`). aedes does not support MQTT 5, so protocol version 5 is not covered.
- Wait for conditions with `waitFor()` instead of fixed sleeps, and use unique topics per test — the broker keeps retained messages for the whole file.
- `test/packageFiles.js` / `test/integrationAdapter.js` — `@iobroker/testing`; the integration test starts a real js-controller and aborts if one is already running on the machine.

## Release flow

Changelog lives in `README.md` under the `### **WORK IN PROGRESS**` placeholder comment; `release-script` (config in `.releaseconfig.json`, including the `manual-review` plugin) moves it into `io-package.json` `common.news`. CI (`.github/workflows/test-and-release.yml`) type-checks, lints and runs `test:package`, then builds and runs `test:unit` + `test:integration` on Node 22/24/26 × Linux/Windows/macOS, and publishes to npm (with build) on version tags.
