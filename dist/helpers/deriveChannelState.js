"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.deriveChannelState = void 0;
const toNumber = (value) => {
    if (typeof value !== 'number' && typeof value !== 'string')
        return undefined;
    const n = typeof value === 'number' ? value : Number(value);
    return Number.isFinite(n) ? n : undefined;
};
const normalizeText = (value) => value.trim().toLowerCase();
const textIncludesAny = (text, needles) => needles.some(n => text.includes(n));
const getKey = (channel) => normalizeText(`${channel.name || ''} ${channel.description || ''}`);
const parsePercent = (value) => {
    if (typeof value === 'string') {
        const t = value.trim();
        if (t.endsWith('%')) {
            const n = Number(t.slice(0, -1));
            return Number.isFinite(n) ? n : undefined;
        }
    }
    const n = toNumber(value);
    if (n === undefined)
        return undefined;
    if (n >= 0 && n <= 100)
        return n;
    if (n >= 0 && n <= 1)
        return n * 100;
    return undefined;
};
const isBinary = (rawValue) => rawValue === 0 || rawValue === 1;
const toPower = (value) => value === true || value === 1 ? 'ON' : 'OFF';
const buildPower = (channel) => {
    const status = channel.onOffStatus;
    if (typeof status !== 'boolean')
        return null;
    const state = {
        power: toPower(status)
    };
    if (typeof channel.unavailable === 'boolean')
        state.unavailable = channel.unavailable;
    if (typeof channel.error1 === 'boolean')
        state.error1 = channel.error1;
    if (typeof channel.error2 === 'boolean')
        state.error2 = channel.error2;
    return state;
};
const buildTemperatureOrSetPoint = (channel) => {
    const value = toNumber(channel.decodedValue);
    if (value === undefined)
        return null;
    const key = getKey(channel);
    const isSetPoint = textIncludesAny(key, ['target', 'setpoint', 'soll']);
    if (isSetPoint)
        return { thermostatSetPoint: value };
    return { temperature: value };
};
const buildBrightness = (channel) => {
    const decodedPercent = parsePercent(channel.decodedValue);
    const rawPercent = channel.mfdType === 'dimmer' && typeof channel.rawValue === 'number'
        ? channel.rawValue / 10
        : undefined;
    const value = decodedPercent ?? rawPercent;
    if (value === undefined || value < 0 || value > 100)
        return null;
    return { brightness: Math.round(value), percentage: value };
};
const buildPercentage = (channel) => {
    const percent = parsePercent(channel.decodedValue);
    if (percent === undefined)
        return null;
    return { percentage: percent };
};
const buildRange = (channel) => {
    const decoded = toNumber(channel.decodedValue);
    if (decoded !== undefined)
        return { rangeValue: decoded };
    if (typeof channel.rawValue === 'number')
        return { rangeValue: channel.rawValue };
    return null;
};
const deriveChannelState = (channel) => {
    if (channel.rawValue === null)
        return null;
    if (channel.dataItemFormatType === 22)
        return buildTemperatureOrSetPoint(channel);
    const key = getKey(channel);
    if (channel.channelType === 3)
        return buildBrightness(channel);
    if (textIncludesAny(key, ['ambient light', 'awning light', 'slider:']))
        return buildBrightness(channel);
    if (channel.dataItemFormatType === 14)
        return buildPercentage(channel);
    if (textIncludesAny(key, ['value %', 'state of charge', '%']))
        return buildPercentage(channel);
    const power = buildPower(channel);
    if (power)
        return power;
    if (isBinary(channel.rawValue))
        return { power: toPower(channel.rawValue) };
    return buildRange(channel);
};
exports.deriveChannelState = deriveChannelState;
//# sourceMappingURL=deriveChannelState.js.map