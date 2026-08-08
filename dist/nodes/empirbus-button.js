"use strict";
const promises_1 = require("node:timers/promises");
const bindEmpirbusClientStatus_1 = require("../helpers/bindEmpirbusClientStatus");
const channelHandling_1 = require("../helpers/channelHandling");
const getRepository_1 = require("../helpers/getRepository");
const resultHandling_1 = require("../helpers/resultHandling");
const direct = (payload) => {
    const value = typeof payload === 'object' && payload !== null && 'action' in payload ? payload.action : payload;
    if (typeof value === 'boolean')
        return value;
    if (typeof value === 'number')
        return value === 1 ? true : value === 0 ? false : undefined;
    if (typeof value !== 'string')
        return undefined;
    const v = value.trim().toLowerCase();
    if (['press', 'on', 'true', '1'].includes(v))
        return true;
    if (['release', 'off', 'false', '0'].includes(v))
        return false;
    return undefined;
};
const bounded = (value, min, max, fallback) => {
    const n = Number(value);
    return Number.isFinite(n) && n >= min && n <= max ? Math.round(n) : fallback;
};
const init = RED => {
    function Constructor(config) {
        RED.nodes.createNode(this, config);
        this.acknowledge = !!config.acknowledge;
        this.configNode = RED.nodes.getNode(config.config);
        this.channelId = config.channelId && Number.isFinite(Number(config.channelId)) ? Number(config.channelId) : undefined;
        this.channelName = config.channelName || undefined;
        this.channelIds = config.channelIds || '';
        this.selectedChannelIds = (0, channelHandling_1.parseChannelIds)(this.channelIds);
        const mode = ['long', 'direct'].includes(config.mode || '') ? config.mode : 'short';
        const duration = bounded(config.durationMs, 10, 60000, mode === 'short' ? 150 : 1000);
        const delay = bounded(config.channelDelayMs, 0, 1000, 5);
        const execution = config.execution === 'parallel' ? 'parallel' : 'sequential';
        const unsubscribe = (0, bindEmpirbusClientStatus_1.bindEmpirbusClientStatus)(this, this.configNode);
        this.on('close', () => unsubscribe?.());
        const run = async (repo, ids, pressed) => {
            const results = await Promise.all(ids.map(id => pressed ? repo.press(id) : repo.release(id)));
            const error = results.map(resultHandling_1.getResultError).find(Boolean);
            if (error)
                throw new Error(error);
        };
        this.on('input', async (msg, send, done) => {
            try {
                const repo = await (0, getRepository_1.getRepository)(this);
                if (!repo)
                    throw new Error('No EmpirBus config node configured.');
                const ids = await (0, channelHandling_1.resolveChannelIds)(this, msg, repo);
                if (!ids.length)
                    throw new Error('No matching channel found.');
                if (mode === 'direct') {
                    const pressed = direct(msg.payload);
                    if (pressed === undefined)
                        throw new Error(`Invalid direct button payload: ${JSON.stringify(msg.payload)}`);
                    await run(repo, ids, pressed);
                }
                else {
                    if (this.busy) {
                        this.warn('Button is busy; trigger ignored.');
                        done?.();
                        return;
                    }
                    this.busy = true;
                    this.status({ fill: 'yellow', shape: 'dot', text: 'busy' });
                    try {
                        if (execution === 'parallel') {
                            await run(repo, ids, true);
                            await (0, promises_1.setTimeout)(duration);
                            await run(repo, ids, false);
                        }
                        else {
                            for (let i = 0; i < ids.length; i++) {
                                await run(repo, [ids[i]], true);
                                await (0, promises_1.setTimeout)(duration);
                                await run(repo, [ids[i]], false);
                                if (i < ids.length - 1 && delay)
                                    await (0, promises_1.setTimeout)(delay);
                            }
                        }
                    }
                    finally {
                        this.busy = false;
                        this.status({ fill: 'green', shape: 'dot', text: 'connected' });
                    }
                }
                if (this.acknowledge) {
                    msg.acknowledge = true;
                    send(msg);
                }
                done?.();
            }
            catch (error) {
                this.busy = false;
                done ? done(error) : this.error(error, msg);
            }
        });
    }
    RED.nodes.registerType('empirbus-button', Constructor);
};
module.exports = init;
//# sourceMappingURL=empirbus-button.js.map