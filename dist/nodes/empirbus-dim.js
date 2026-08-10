"use strict";
const bindEmpirbusClientStatus_1 = require("../helpers/bindEmpirbusClientStatus");
const channelHandling_1 = require("../helpers/channelHandling");
const inputPayload_1 = require("../helpers/inputPayload");
const getRepository_1 = require("../helpers/getRepository");
const resultHandling_1 = require("../helpers/resultHandling");
const acknowledge_1 = require("../helpers/acknowledge");
const getMaximumValue = (mode) => {
    if (mode === 'raw')
        return 255;
    if (mode === 'normalized')
        return 1;
    return 100;
};
const convert = (value, mode) => {
    const n = Number(value);
    if (!Number.isFinite(n))
        throw new Error(`Invalid dimmer payload: ${JSON.stringify(value)}`);
    if (mode === 'raw') {
        if (!Number.isInteger(n) || n < 0 || n > 255)
            throw new Error('Raw dimmer value must be an integer from 0 to 255.');
        return { raw: n, brightness: n / 255 * 100 };
    }
    if (mode === 'normalized') {
        if (n < 0 || n > 1)
            throw new Error('Normalized dimmer value must be between 0 and 1.');
        return { raw: Math.round(n * 255), brightness: n * 100 };
    }
    if (n < 0 || n > 100)
        throw new Error('Percent dimmer value must be between 0 and 100.');
    return { raw: Math.round(n / 100 * 255), brightness: n };
};
const convertAuto = (value) => {
    const n = Number(value);
    if (!Number.isFinite(n))
        throw new Error(`Invalid dimmer payload: ${JSON.stringify(value)}`);
    if (n >= 0 && n <= 100)
        return convert(n, 'percent');
    if (Number.isInteger(n) && n >= 101 && n <= 255)
        return convert(n, 'raw');
    throw new Error('Auto dimmer value must be between 0 and 100 percent or an integer raw value from 101 to 255.');
};
const resolveExplicitDimValue = (payload) => {
    if (!payload || typeof payload !== 'object')
        return undefined;
    const explicit = payload;
    if (explicit.value === undefined || typeof explicit.unit !== 'string')
        return undefined;
    const unit = explicit.unit.trim().toLowerCase();
    if (unit === 'raw')
        return { value: explicit.value, mode: 'raw' };
    if (unit === 'percent' || unit === '%')
        return { value: explicit.value, mode: 'percent' };
    if (unit === 'normalized' || unit === 'normalised')
        return { value: explicit.value, mode: 'normalized' };
    throw new Error(`Unsupported dimmer unit: ${explicit.unit}`);
};
const resolveDimPower = (payload) => {
    if (typeof payload === 'boolean')
        return payload ? 'ON' : 'OFF';
    if (typeof payload === 'string') {
        const normalized = payload.trim().toLowerCase();
        if (['on', 'ein', 'true'].includes(normalized))
            return 'ON';
        if (['off', 'aus', 'false'].includes(normalized))
            return 'OFF';
        return undefined;
    }
    if (!payload || typeof payload !== 'object')
        return undefined;
    const value = payload;
    if (value.On === undefined && value.power === undefined && value.state?.power === undefined)
        return undefined;
    return (0, inputPayload_1.resolvePower)(payload);
};
const resolveInputValue = (payload, mode) => {
    const explicit = resolveExplicitDimValue(payload);
    if (explicit)
        return convert(explicit.value, explicit.mode);
    const homeKitBrightness = (0, inputPayload_1.resolveHomeKitBrightness)(payload);
    if (homeKitBrightness !== undefined)
        return convert(homeKitBrightness, 'percent');
    const dimValue = (0, inputPayload_1.resolveDimPayload)(payload);
    if (mode === 'auto')
        return convertAuto(dimValue);
    return convert(dimValue, mode);
};
const resolveValue = (payload, mode, onLevel, onLevelMode) => {
    const explicit = resolveExplicitDimValue(payload);
    if (explicit)
        return convert(explicit.value, explicit.mode);
    const homeKitBrightness = (0, inputPayload_1.resolveHomeKitBrightness)(payload);
    if (homeKitBrightness !== undefined)
        return convert(homeKitBrightness, 'percent');
    const power = resolveDimPower(payload);
    if (power === 'ON')
        return convert(onLevel, onLevelMode);
    if (power === 'OFF')
        return convert(0, 'raw');
    return resolveInputValue(payload, mode);
};
const resolveInputMode = (value) => {
    if (value === 'auto' || value === 'raw' || value === 'normalized')
        return value;
    return 'percent';
};
const resolveOnLevelMode = (value) => {
    if (value === 'raw' || value === 'percent' || value === 'normalized')
        return value;
    return 'percent';
};
const init = RED => {
    function Constructor(config) {
        RED.nodes.createNode(this, config);
        const acknowledgeMode = (0, acknowledge_1.resolveAcknowledgeMode)(config.acknowledgeMode, config.acknowledge);
        this.configNode = RED.nodes.getNode(config.config);
        this.channelId = config.channelId && Number.isFinite(Number(config.channelId)) ? Number(config.channelId) : undefined;
        this.channelName = config.channelName || undefined;
        this.channelIds = config.channelIds || '';
        this.selectedChannelIds = (0, channelHandling_1.parseChannelIds)(this.channelIds);
        const mode = resolveInputMode(config.inputMode);
        const onLevelMode = resolveOnLevelMode(config.onLevelMode);
        const configuredOnLevel = config.onLevel === undefined || config.onLevel === '' ? getMaximumValue(onLevelMode) : Number(config.onLevel);
        const unsubscribe = (0, bindEmpirbusClientStatus_1.bindEmpirbusClientStatus)(this, this.configNode);
        this.on('close', () => unsubscribe?.());
        this.on('input', async (msg, send, done) => {
            try {
                const repo = await (0, getRepository_1.getRepository)(this);
                if (!repo)
                    throw new Error('No EmpirBus config node configured.');
                const ids = await (0, channelHandling_1.resolveChannelIds)(this, msg, repo);
                if (!ids.length)
                    throw new Error('No matching channel found.');
                const value = resolveValue(msg.payload, mode, configuredOnLevel, onLevelMode);
                const acknowledgementPayload = { state: { brightness: value.brightness } };
                (0, acknowledge_1.sendAcknowledge)(acknowledgeMode, 'immediate', msg, send, acknowledgementPayload);
                const results = ids.map(id => repo.dim(id, value.raw));
                const error = results.map(resultHandling_1.getResultError).find(Boolean);
                if (error)
                    throw new Error(error);
                (0, acknowledge_1.sendAcknowledge)(acknowledgeMode, 'completed', msg, send, acknowledgementPayload);
                done?.();
            }
            catch (error) {
                done ? done(error) : this.error(error, msg);
            }
        });
    }
    RED.nodes.registerType('empirbus-dim', Constructor);
};
module.exports = init;
//# sourceMappingURL=empirbus-dim.js.map