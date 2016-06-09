![Logo](admin/mqtt-client.png)
# iobroker.mqtt-client

## Adapter Settings
![Adapter](settings.png)

### on connect topic and message
The ```on connect message``` is published to the ```on connect topic``` every time the client connects or reconnects to the server.

### last will topic and message
The ```last will message``` is published to the ```last will topic``` every time the client connects or reconnects to the server.
The Server will store this message and send it to its subscribers when the client disconnects.

### subscriptions 
Not implemented!

### prefix
When publishing this will be prepended to the topics and it also will be removed from subscribed topics if necessary.
Default is empty (no prefix).

## State Settings
![State](dialog.png)

### enabled
Enables or disables the mqtt-client functionality for this state. 
Disabling will delete any mqtt-client settings from this state.

### topic
The topic this state is published to and subscribed from.
default: state-ID converted to a mqtt topic.

### publish
* ```enable``` state will be published
* ```changes only``` state will only be published when its value changes
* ```as object``` whole state will be published as object
* ```qos``` see <http://www.hivemq.com/blog/mqtt-essentials-part-6-mqtt-quality-of-service-levels>
* ```retain``` see <http://www.hivemq.com/blog/mqtt-essentials-part-8-retained-messages>

### subscribe
* ```enable``` topic will be subscribed and state will be updated accordingly
* ```changes only``` state will only be written when the value changed
* ```as object``` messages will be interpreted as objects
* ```qos``` see <http://www.hivemq.com/blog/mqtt-essentials-part-6-mqtt-quality-of-service-levels>
* ```ack``` on state updates the ack flag will be set accordingly

#### Note
* when ack is set to true it will overwrite objects ack, see ```as object```
* to prevent message loops, if both publish and subscribe are enabled ```changes only``` is always on for subscribe

## Changelog

### 0.1.1 (2016-06-09)
* (Pmant) fix possible loop

### 0.1.0 (2016-06-08)
* (Pmant) initial commit
