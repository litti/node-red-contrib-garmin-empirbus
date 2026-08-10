"use strict";
const deriveChannelState_1 = require("../helpers/deriveChannelState");
const bindEmpirbusClientStatus_1 = require("../helpers/bindEmpirbusClientStatus");
const toHomeKitState_1 = require("../helpers/toHomeKitState");
const toAlexaState_1 = require("../helpers/toAlexaState");
const parseIds = (value) => Array.from(new Set((value || '').split(',').map(v => Number(v.trim())).filter(Number.isFinite)));
const stable = (value) => JSON.stringify(value, Object.keys(value).sort());
const buildAlexaMessage = (endpointId, topic, state) => ({
    acknowledge: true,
    endpointId,
    topic,
    payload: { state }
});
const buildAlexaMessages = (state, previous, endpointId, topic) => {
    const messages = [];
    const powerChanged = state.power !== undefined && (!previous || previous.power !== state.power);
    const brightnessChanged = state.brightness !== undefined && (!previous || previous.brightness !== state.brightness);
    if (powerChanged) {
        messages.push(buildAlexaMessage(endpointId, topic, { power: state.power }));
        messages.push(buildAlexaMessage(endpointId, topic, { brightness: state.power === 'ON' ? 100 : 0 }));
        return messages;
    }
    if (brightnessChanged)
        messages.push(buildAlexaMessage(endpointId, topic, { brightness: state.brightness }));
    for (const [key, value] of Object.entries(state)) {
        if (key === 'power' || key === 'brightness')
            continue;
        if (!previous || previous[key] !== value)
            messages.push(buildAlexaMessage(endpointId, topic, { [key]: value }));
    }
    return messages;
};
const init = RED => {
    function Constructor(config) {
        RED.nodes.createNode(this, config);
        const configNode = RED.nodes.getNode(config.config);
        const wantedIds = parseIds(config.channelIds);
        const parsedFallback = config.channelId === undefined || config.channelId === '' ? undefined : Number(config.channelId);
        const fallbackId = Number.isFinite(parsedFallback) ? parsedFallback : undefined;
        const wantedName = config.channelName?.trim().toLowerCase();
        const lastStates = new Map();
        const lastAlexaStates = new Map();
        let unsubscribeUpdate;
        let closed = false;
        const unsubscribeStatus = (0, bindEmpirbusClientStatus_1.bindEmpirbusClientStatus)(this, configNode, { connectedText: 'listening' });
        if (!configNode) {
            this.error('No EmpirBus config node configured.');
            return;
        }
        const relevant = (channel) => {
            if (wantedIds.length)
                return wantedIds.includes(channel.id);
            if (fallbackId !== undefined)
                return channel.id === fallbackId;
            if (wantedName)
                return (channel.name || '').trim().toLowerCase() === wantedName;
            return true;
        };
        configNode.getRepository().then((repo) => {
            if (closed)
                return;
            unsubscribeUpdate = repo.onUpdate((channel) => {
                if (closed || !relevant(channel))
                    return;
                const state = (0, deriveChannelState_1.deriveChannelState)(channel);
                if (!state)
                    return;
                const serialized = stable(state);
                if (lastStates.get(channel.id) === serialized)
                    return;
                lastStates.set(channel.id, serialized);
                const endpointId = String(channel.id);
                const topic = `empirbus/${endpointId}`;
                const standardMessage = { acknowledge: true, endpointId, topic, payload: { state } };
                const alexaState = (0, toAlexaState_1.toAlexaState)(state);
                const previousAlexaState = lastAlexaStates.get(channel.id);
                const alexaMessages = alexaState ? buildAlexaMessages(alexaState, previousAlexaState, endpointId, topic) : [];
                if (alexaState)
                    lastAlexaStates.set(channel.id, alexaState);
                const homeKitState = (0, toHomeKitState_1.toHomeKitState)(state);
                const homeKitMessage = homeKitState ? { endpointId, topic, payload: homeKitState } : null;
                this.send([standardMessage, alexaMessages.length ? alexaMessages : null, homeKitMessage]);
            });
        }).catch(error => this.error(error));
        this.on('close', () => {
            closed = true;
            unsubscribeUpdate?.();
            unsubscribeStatus?.();
            this.status({});
        });
    }
    RED.nodes.registerType('empirbus-state', Constructor);
};
module.exports = init;
