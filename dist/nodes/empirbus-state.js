"use strict";
const garmin_empirbus_ts_1 = require("garmin-empirbus-ts");
const deriveAlexaState_1 = require("../helpers/deriveAlexaState");
const parseIds = (value) => {
    if (!value)
        return [];
    return Array.from(new Set(value
        .split(',')
        .map(v => Number(v.trim()))
        .filter(v => Number.isFinite(v))));
};
const isRelevantChannel = (wantedIds, fallbackId, wantedName, channel) => {
    if (wantedIds.length > 0)
        return wantedIds.includes(channel.id);
    if (fallbackId !== undefined)
        return channel.id === fallbackId;
    if (wantedName)
        return (channel.name || '').toLowerCase() === wantedName;
    return true;
};
const hasChanged = (lastValues, channel) => {
    const previous = lastValues[channel.id];
    if (previous === undefined) {
        lastValues[channel.id] = channel.rawValue;
        return false;
    }
    if (previous === channel.rawValue)
        return false;
    lastValues[channel.id] = channel.rawValue;
    return true;
};
const nodeInit = RED => {
    function EmpirbusStateNodeConstructor(config) {
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
                if (!isRelevantChannel(wantedIds, fallbackId, wantedName, channel))
                    return;
                if (!hasChanged(lastValues, channel))
                    return;
                context.set('lastValues', lastValues);
                const state = (0, deriveAlexaState_1.deriveAlexaState)(channel);
                if (!state)
                    return;
                const endpointId = String(channel.id);
                this.send({
                    acknowledge: true,
                    endpointId,
                    topic: `empirbus/${endpointId}`,
                    payload: { state }
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
    }
    RED.nodes.registerType('empirbus-state', EmpirbusStateNodeConstructor);
};
module.exports = nodeInit;
//# sourceMappingURL=empirbus-state.js.map