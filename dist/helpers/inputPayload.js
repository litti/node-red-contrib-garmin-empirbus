"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.resolveDimPayload = exports.resolveHomeKitBrightness = exports.resolveAction = exports.resolvePower = void 0;
const isObject = (value) => value !== null && typeof value === 'object';
const getState = (payload) => {
    if (!isObject(payload) || !isObject(payload.state))
        return undefined;
    return payload.state;
};
const resolvePower = (payload) => {
    const state = getState(payload);
    const value = state?.power ?? (isObject(payload) ? payload.power ?? payload.On : payload);
    if (typeof value === 'boolean')
        return (value ? 'ON' : 'OFF');
    if (typeof value === 'number') {
        if (value === 1)
            return 'ON';
        if (value === 0)
            return 'OFF';
        return undefined;
    }
    if (typeof value !== 'string')
        return undefined;
    switch (value.trim().toLowerCase()) {
        case 'on':
        case 'ein':
        case 'true':
        case '1':
            return 'ON';
        case 'off':
        case 'aus':
        case 'false':
        case '0':
            return 'OFF';
        default:
            return undefined;
    }
};
exports.resolvePower = resolvePower;
const resolveAction = (payload) => {
    const state = getState(payload);
    const value = state?.action ?? (isObject(payload) ? payload.action : payload);
    if (typeof value !== 'string')
        return undefined;
    const normalized = value.trim().toLowerCase();
    if (normalized === 'press' || normalized === 'release')
        return normalized;
    return undefined;
};
exports.resolveAction = resolveAction;
const resolveHomeKitBrightness = (payload) => {
    if (!isObject(payload) || payload.Brightness === undefined)
        return undefined;
    const brightness = Number(payload.Brightness);
    if (!Number.isFinite(brightness) || brightness < 0 || brightness > 100)
        throw new Error('HomeKit Brightness must be between 0 and 100.');
    return brightness;
};
exports.resolveHomeKitBrightness = resolveHomeKitBrightness;
const resolveDimPayload = (payload) => {
    const state = getState(payload);
    if (state) {
        if (state.brightness !== undefined)
            return state.brightness;
        if (state.percentage !== undefined)
            return state.percentage;
        if (state.rangeValue !== undefined)
            return state.rangeValue;
        if (state.power !== undefined)
            return state.power;
    }
    if (isObject(payload)) {
        if (payload.Brightness !== undefined)
            return payload.Brightness;
        if (payload.brightness !== undefined)
            return payload.brightness;
        if (payload.percentage !== undefined)
            return payload.percentage;
        if (payload.rangeValue !== undefined)
            return payload.rangeValue;
        if (payload.power !== undefined)
            return payload.power;
        if (payload.On !== undefined)
            return payload.On;
    }
    return payload;
};
exports.resolveDimPayload = resolveDimPayload;
