"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.deriveAlexaState = void 0;
const toNumber = (value) => {
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
const toPower = (rawValue) => rawValue === 1 ? 'ON' : 'OFF';
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
    const percent = parsePercent(channel.decodedValue);
    const raw = channel.rawValue ?? undefined;
    const value = percent ?? (typeof raw === 'number' ? raw : undefined);
    if (value === undefined)
        return null;
    if (value < 0 || value > 100)
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
const deriveAlexaState = (channel) => {
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
    if (isBinary(channel.rawValue))
        return { power: toPower(channel.rawValue) };
    return buildRange(channel);
};
exports.deriveAlexaState = deriveAlexaState;
//# sourceMappingURL=deriveAlexaState.js.map