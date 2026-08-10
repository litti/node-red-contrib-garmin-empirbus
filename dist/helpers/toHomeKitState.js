"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.toHomeKitState = void 0;
const toNumber = (value) => {
    if (typeof value !== 'number')
        return undefined;
    return Number.isFinite(value) ? value : undefined;
};
const toOn = (state) => {
    if (state.power === 'ON')
        return true;
    if (state.power === 'OFF')
        return false;
    const brightness = toNumber(state.brightness);
    if (brightness !== undefined)
        return brightness > 0;
    return undefined;
};
const toHomeKitState = (state) => {
    const on = toOn(state);
    const brightness = toNumber(state.brightness);
    if (brightness !== undefined) {
        if (on === undefined)
            return null;
        return {
            On: on,
            Brightness: Math.round(brightness)
        };
    }
    if (on !== undefined)
        return { On: on };
    return null;
};
exports.toHomeKitState = toHomeKitState;
