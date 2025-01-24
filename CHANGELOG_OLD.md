# Older changes
## 1.7.0 (2023-10-30)

* (mcm1957) Dependencies have been updated
* (mcm1957) Adapter requires nodejs 16 now

## 1.6.5 (2023-09-28)
* (foxriver76) prevent crash cases on invalid subscribe

## 1.6.4 (2023-07-26)
* (DutchmanNL) Option to allow self-signed certificates in adapter settings added.

## 1.6.3 (2022-06-16)
* (Apollon77) Prevent potential crash cases reported by Sentry

## 1.6.2 (2022-04-02)
* (Apollon77) Prevent potential crash cases reported by Sentry

## 1.6.1 (2022-02-24)
* (Pmant) fix subscriptions
* (Pmant) fix unsubscribing
* (Pmant) use prefix for LWT topic

## 1.6.0 (2022-02-19)
* (Pmant) add option to select protocol version
* (Pmant) add websocket support
* (Pmant) publish values once on enabling publishing
* (Pmant) Upgrade to MQTT version 4 (resolves many connection issues)
* (Pmant) fix LWT documentation
* (Pmant) optionally publish a message when disconnecting gracefully

## 1.5.0 (2022-01-26)
* IMPORTANT: This adapter now required at least js-controller 3.3.x
* (Apollon77) Fix crash cases

## 1.4.1 (2022-01-26)
* (bluefox) js-controller 3.3 optimizations

## 1.4.0 (2021-07-16)
* IMPORTANT: This adapter now required at least js-controller 2.0.0
* (Apollon77) js-controller 3.3 optimizations
* (AlCalzone) Unpublished expired states
* (AlCalzone) Only handle stat values if state exists

## 1.3.2 (2021-04-19)
* (bluefox) Added support of admin5

## 1.3.1 (2020-03-17)
* (bluefox) mqtt package moved back to 2.x

## 1.3.0 (2020-03-11)
* (bluefox) mqtt package was updated
* (bluefox) Fixed the error with "custom" view

## 1.2.1 (2019-10-17)
* (algar42) Fix adapter restarting
* (algar42) Fix mqtt issues

## 1.2.0 (2019-10-14)
* (bluefox) Support of js-controller 2.0 was added

## 1.1.1 (2018-01-30)
* (bluefox) small fixes

## 1.1.0 (2017-12-30)
* (bluefox) Translations
* (bluefox) Update of MQTT module

## 1.0.1 (2017-11-16)

## 1.0.0 (2017-11-16)
* (bluefox) Update io-package.json

## 0.3.2 (2016-11-18)
* (Pmant) fix initial object parsing
* (Pmant) fix objects view

## 0.3.1 (2016-11-16)
* (Pmant) fix crash

## 0.3.0 (2016-09-08)
* (Pmant) add optional publish and subscribe prefixes

## 0.2.5 (2016-09-08)
* (Pmant) reduce logging -> debug

## 0.2.0 (2016-09-08)
* (Pmant) use new custom settings

## 0.1.1 (2016-06-09)
* (Pmant) fix possible loop

## 0.1.0 (2016-06-08)
* (Pmant) initial commit
