"use strict";
const channelHandling_1 = require("../helpers/channelHandling");
const getRepository_1 = require("../helpers/getRepository");
const bindEmpirbusClientStatus_1 = require("../helpers/bindEmpirbusClientStatus");
const clampBrightness = (value) => Math.max(0, Math.min(100, Math.round(value)));
const toNumberOrUndefined = (value) => {
    if (value === undefined || value === null)
        return undefined;
    const parsed = Number(value);
    if (Number.isNaN(parsed))
        return undefined;
    return parsed;
};
const isOnPayload = (payload) => {
    if (typeof payload === 'boolean')
        return payload;
    if (typeof payload === 'number')
        return payload === 100;
    if (typeof payload !== 'string')
        return false;
    const normalized = payload.trim().toLowerCase();
    return normalized === 'on' || normalized === 'ein' || normalized === 'true' || normalized === '1';
};
const isOffPayload = (payload) => {
    if (payload === false)
        return true;
    if (typeof payload === 'number')
        return payload === 0;
    if (typeof payload !== 'string')
        return false;
    const normalized = payload.trim().toLowerCase();
    return normalized === 'off' || normalized === 'aus' || normalized === 'false' || normalized === '0';
};
const resolveBrightness = (payload, onLevel) => {
    if (isOffPayload(payload))
        return 0;
    if (isOnPayload(payload))
        return clampBrightness(onLevel ?? 100);
    const numeric = toNumberOrUndefined(payload);
    if (numeric === undefined)
        return clampBrightness(onLevel ?? 100);
    return clampBrightness(numeric);
};
const toDimState = (brightness) => {
    if (brightness <= 0)
        return 0;
    let level = brightness * 10;
    if (level < 120)
        level = 120;
    return level;
};
const nodeInit = RED => {
    function EmpirbusDimNodeConstructor(config) {
        RED.nodes.createNode(this, config);
        this.acknowledge = config.acknowledge || false;
        this.configNode = RED.nodes.getNode(config.config);
        this.channelId = config.channelId ? Number(config.channelId) : undefined;
        this.channelName = config.channelName || undefined;
        this.channelIds = config.channelIds || '';
        this.selectedChannelIds = (0, channelHandling_1.parseChannelIds)(this.channelIds);
        const onLevel = (() => {
            const value = toNumberOrUndefined(config.onLevel);
            if (value === undefined)
                return undefined;
            return clampBrightness(value);
        })();
        const unsubscribeState = (0, bindEmpirbusClientStatus_1.bindEmpirbusClientStatus)(this, this.configNode);
        this.on('close', () => {
            unsubscribeState?.();
        });
        this.on('input', async (msg) => {
            const repo = await (0, getRepository_1.getRepository)(this);
            if (!repo) {
                this.error('No EmpirBus config node configured. Configure and select an EmpirBus config node first!', msg);
                return;
            }
            const ids = await (0, channelHandling_1.resolveChannelIds)(this, msg, repo);
            if (ids.length === 0) {
                this.error('No matching channel found', msg);
                this.send(msg);
                return;
            }
            try {
                const brightness = resolveBrightness(msg.payload, onLevel);
                const promises = ids.map(id => repo.dim(id, toDimState(brightness)));
                const results = await Promise.all(promises);
                if (results.filter(result => result.hasFailed).length === 0) {
                    if (this.acknowledge) {
                        msg.acknowledge = true;
                        msg.payload = {
                            state: {
                                brightness
                            }
                        };
                    }
                    this.log(`Dimmed channels ${ids.join(',')} ${brightness}, returning message ${JSON.stringify(msg)}`);
                }
                else {
                    results
                        .filter(result => result.hasFailed)
                        .forEach(result => this.error(result.errors.join(', '), msg));
                }
                this.send(msg);
            }
            catch (error) {
                this.error(error, msg);
            }
        });
    }
    RED.nodes.registerType('empirbus-dim', EmpirbusDimNodeConstructor);
};
module.exports = nodeInit;
//# sourceMappingURL=empirbus-dim.js.map