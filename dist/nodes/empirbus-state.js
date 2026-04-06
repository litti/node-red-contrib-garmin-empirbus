"use strict";
const deriveAlexaState_1 = require("../helpers/deriveAlexaState");
const bindEmpirbusClientStatus_1 = require("../helpers/bindEmpirbusClientStatus");
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
        let unsubscribeStatus;
        let isClosed = false;
        const setDisconnected = () => this.status({ fill: 'red', shape: 'ring', text: 'disconnected' });
        if (!configNode) {
            setDisconnected();
            this.error('No EmpirBus config node configured.');
            return;
        }
        unsubscribeStatus = (0, bindEmpirbusClientStatus_1.bindEmpirbusClientStatus)(this, configNode, { connectedText: 'listening' });
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
        }).catch(error => {
            this.error(error);
            setDisconnected();
        });
        this.on('close', () => {
            isClosed = true;
            unsubscribeUpdate?.();
            unsubscribeStatus?.();
            this.status({});
        });
    }
    RED.nodes.registerType('empirbus-state', EmpirbusStateNodeConstructor);
};
module.exports = nodeInit;
//# sourceMappingURL=empirbus-state.js.map