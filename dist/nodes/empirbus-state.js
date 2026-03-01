"use strict";
const garmin_empirbus_ts_1 = require("garmin-empirbus-ts");
function parseIds(value) {
    if (!value)
        return [];
    return Array.from(new Set(value
        .split(',')
        .map(v => Number(v.trim()))
        .filter(v => Number.isFinite(v))));
}
const nodeInit = RED => {
    function EmpirbusStatusNodeConstructor(config) {
        RED.nodes.createNode(this, config);
        const configNode = RED.nodes.getNode(config.config);
        const wantedIds = parseIds(config.channelIds);
        const fallbackId = config.channelId ? Number(config.channelId) : undefined;
        const wantedName = config.channelName?.toLowerCase();
        const context = this.context();
        const lastValues = context.get('lastValues') || {};
        context.set('lastValues', lastValues);
        let unsubscribeUpdate;
        let unsubscribeState;
        let isClosed = false;
        const setConnected = () => this.status({ fill: 'green', shape: 'dot', text: 'listening' });
        const setDisconnected = () => this.status({ fill: 'red', shape: 'ring', text: 'disconnected' });
        if (!configNode) {
            setDisconnected();
            this.error('No EmpirBus config node configured.');
            return;
        }
        configNode.getRepository().then((repo) => {
            if (isClosed)
                return;
            unsubscribeUpdate = repo.onUpdate((channel) => {
                if (isClosed)
                    return;
                if (!isRelevantChannel(channel))
                    return;
                const previous = lastValues[channel.id];
                if (previous === undefined) {
                    lastValues[channel.id] = channel.rawValue;
                    return;
                }
                if (previous === channel.rawValue)
                    return;
                lastValues[channel.id] = channel.rawValue;
                context.set('lastValues', lastValues);
                this.send({
                    topic: `empirbus/${channel.id}`,
                    payload: {
                        id: channel.id,
                        name: channel.name,
                        rawValue: channel.rawValue,
                        decodedValue: channel.decodedValue,
                        updatedAt: channel.updatedAt
                    }
                });
            });
            unsubscribeState = repo.onState((state) => {
                if (isClosed)
                    return;
                switch (state) {
                    case garmin_empirbus_ts_1.EmpirBusClientState.Connected:
                        setConnected();
                        break;
                    case garmin_empirbus_ts_1.EmpirBusClientState.Connecting:
                        this.status({ fill: 'yellow', shape: 'ring', text: 'connecting' });
                        break;
                    case garmin_empirbus_ts_1.EmpirBusClientState.Error:
                        this.status({ fill: 'red', shape: 'dot', text: 'error' });
                        break;
                    default:
                    case garmin_empirbus_ts_1.EmpirBusClientState.Closed:
                        setDisconnected();
                        break;
                }
            });
        }).catch(error => {
            this.error(error);
            setDisconnected();
        });
        this.on('close', () => {
            isClosed = true;
            if (unsubscribeUpdate)
                unsubscribeUpdate();
            if (unsubscribeState)
                unsubscribeState();
            this.status({});
        });
        const isRelevantChannel = (channel) => {
            if (wantedIds.length > 0)
                return wantedIds.includes(channel.id);
            if (fallbackId !== undefined)
                return channel.id === fallbackId;
            if (wantedName)
                return (channel.name || '').toLowerCase() === wantedName;
            return true;
        };
    }
    RED.nodes.registerType('empirbus-status', EmpirbusStatusNodeConstructor);
};
module.exports = nodeInit;
//# sourceMappingURL=empirbus-state.js.map