"use strict";
const bindEmpirbusClientStatus_1 = require("../helpers/bindEmpirbusClientStatus");
const channelHandling_1 = require("../helpers/channelHandling");
const getRepository = async (node) => {
    if (!node.configNode)
        return null;
    return node.configNode.getRepository();
};
const normalizePressMode = (value) => {
    if (value === 'press')
        return 'press';
    return 'switch';
};
const normalizeHoldDurationMs = (value, fallback = 1000) => {
    const parsed = Number(value);
    if (!Number.isFinite(parsed))
        return fallback;
    return Math.max(0, Math.round(parsed));
};
const isPressCapableRepository = (repo) => typeof repo.press === 'function'
    && typeof repo.release === 'function'
    && typeof repo.pressFor === 'function';
const resolveRuntimeOptions = (msg, config) => {
    const configPressMode = normalizePressMode(config.pressMode);
    const configHoldDurationMs = normalizeHoldDurationMs(config.holdDurationMs, 1000);
    const msgPressMode = normalizePressMode(msg.pressMode);
    const pressMode = msg.pressMode === undefined ? configPressMode : msgPressMode;
    const holdDurationMs = msg.holdDurationMs === undefined
        ? configHoldDurationMs
        : normalizeHoldDurationMs(msg.holdDurationMs, configHoldDurationMs);
    return {
        pressMode,
        holdDurationMs
    };
};
const nodeInit = RED => {
    function EmpirbusSwitchNodeConstructor(config) {
        RED.nodes.createNode(this, config);
        this.acknowledge = config.acknowledge || false;
        this.configNode = RED.nodes.getNode(config.config);
        this.channelId = config.channelId ? Number(config.channelId) : undefined;
        this.channelName = config.channelName || undefined;
        this.channelIds = config.channelIds || '';
        this.selectedChannelIds = (0, channelHandling_1.parseChannelIds)(this.channelIds);
        const unsubscribeState = (0, bindEmpirbusClientStatus_1.bindEmpirbusClientStatus)(this, this.configNode);
        this.on('close', () => {
            unsubscribeState?.();
        });
        this.on('input', async (msg) => {
            const repo = await getRepository(this);
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
                const runtimeOptions = resolveRuntimeOptions(msg, config);
                const payload = msg.payload;
                const useDirectPress = payload === 'press';
                const useDirectRelease = payload === 'release';
                const results = await Promise.all(ids.map(id => {
                    if (useDirectPress) {
                        if (!isPressCapableRepository(repo))
                            throw new Error('EmpirBus repository does not support press commands. Update garmin-empirbus-ts first.');
                        return repo.press(id);
                    }
                    if (useDirectRelease) {
                        if (!isPressCapableRepository(repo))
                            throw new Error('EmpirBus repository does not support release commands. Update garmin-empirbus-ts first.');
                        return repo.release(id);
                    }
                    if (runtimeOptions.pressMode === 'press') {
                        if (!isPressCapableRepository(repo))
                            throw new Error('EmpirBus repository does not support long press. Update garmin-empirbus-ts first.');
                        return repo.pressFor(id, runtimeOptions.holdDurationMs);
                    }
                    return repo.switch(id, payload);
                }));
                const failedResults = results.filter(result => result.hasFailed);
                if (failedResults.length === 0) {
                    if (this.acknowledge)
                        msg.acknowledge = true;
                    if (useDirectPress || useDirectRelease) {
                        msg.payload = {
                            action: payload,
                            durationMs: useDirectPress ? runtimeOptions.holdDurationMs : undefined
                        };
                    }
                    else if (runtimeOptions.pressMode === 'press') {
                        msg.payload = {
                            action: 'press',
                            durationMs: runtimeOptions.holdDurationMs
                        };
                    }
                    else {
                        msg.payload = {
                            state: {
                                power: payload
                            }
                        };
                    }
                    this.log(`Handled channels ${ids.join(',')} using mode ${runtimeOptions.pressMode}, returning message ${JSON.stringify(msg)}`);
                }
                else {
                    failedResults.forEach(result => this.error((result.hasFailed ? result.errors || [] : []).join(', '), msg));
                }
                this.send(msg);
            }
            catch (error) {
                this.error(error, msg);
            }
        });
    }
    RED.nodes.registerType('empirbus-switch', EmpirbusSwitchNodeConstructor);
};
module.exports = nodeInit;
//# sourceMappingURL=empirbus-switch.js.map