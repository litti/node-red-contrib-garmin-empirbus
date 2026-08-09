"use strict";
const garmin_empirbus_ts_1 = require("garmin-empirbus-ts");
const bindEmpirbusClientStatus_1 = require("../helpers/bindEmpirbusClientStatus");
const parseIds = (value) => new Set((value || '').split(',').map(value => Number(value.trim())).filter(Number.isFinite));
const getCategory = (message) => {
    if (message.messagetype === garmin_empirbus_ts_1.MessageType.acknowledgement && message.messagecmd === 0 && message.size === 1 && message.data[0] === 0)
        return 'heartbeat';
    if (message.messagetype === garmin_empirbus_ts_1.MessageType.mfdControl)
        return 'control';
    if (message.messagetype === garmin_empirbus_ts_1.MessageType.mfdStatus)
        return 'status';
    return 'system';
};
const getChannelId = (message, category) => {
    if (category !== 'control' && category !== 'status')
        return undefined;
    if (message.data.length < 2)
        return undefined;
    return message.data[0] | (message.data[1] << 8);
};
const getCommand = (message, category) => {
    if (category === 'heartbeat')
        return 'heartbeat';
    if (category === 'status')
        return 'status';
    if (category !== 'control')
        return 'system';
    switch (message.messagecmd) {
        case 0: return 'switch';
        case 1: return 'button';
        case 3: return 'dimmer';
        default: return 'unknown';
    }
};
const init = RED => {
    function Constructor(config) {
        RED.nodes.createNode(this, config);
        const configNode = RED.nodes.getNode(config.config);
        const selectedIds = parseIds(config.channelIds);
        let unsubscribeCommunication;
        let closed = false;
        const unsubscribeStatus = (0, bindEmpirbusClientStatus_1.bindEmpirbusClientStatus)(this, configNode, { connectedText: 'listening' });
        if (!configNode) {
            this.error('No EmpirBus config node configured.');
            return;
        }
        const categoryEnabled = (category) => {
            if (category === 'control')
                return config.controlCommands;
            if (category === 'status')
                return config.statusMessages;
            if (category === 'heartbeat')
                return config.heartbeat;
            return config.systemTraffic;
        };
        const matches = (event, category, channelId) => {
            if (config.direction !== 'both' && config.direction !== event.direction)
                return false;
            if (!categoryEnabled(category))
                return false;
            if (config.scope === 'selected' && channelId !== undefined && !selectedIds.has(channelId))
                return false;
            if (config.scope === 'selected' && channelId === undefined)
                return category === 'heartbeat' ? config.heartbeat : config.systemTraffic;
            return true;
        };
        configNode.getRepository().then(repo => {
            if (closed)
                return;
            unsubscribeCommunication = repo.onCommunication(event => {
                if (closed)
                    return;
                const category = getCategory(event.message);
                const channelId = getChannelId(event.message, category);
                if (!matches(event, category, channelId))
                    return;
                const target = channelId === undefined ? 'system' : String(channelId);
                this.send({
                    topic: `empirbus/debug/${event.direction}/${target}`,
                    payload: {
                        direction: event.direction,
                        channelId,
                        category,
                        command: getCommand(event.message, category),
                        timestamp: event.timestamp,
                        message: event.message
                    }
                });
            });
        }).catch(error => this.error(error));
        this.on('close', () => {
            closed = true;
            unsubscribeCommunication?.();
            unsubscribeStatus?.();
            this.status({});
        });
    }
    RED.nodes.registerType('empirbus-debug', Constructor);
};
module.exports = init;
//# sourceMappingURL=empirbus-debug.js.map