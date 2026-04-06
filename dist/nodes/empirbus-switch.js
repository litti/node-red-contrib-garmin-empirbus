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
    && typeof repo.pressForMany === 'function';
const resolveRuntimeOptions = (msg, config) => {
    const configPressMode = normalizePressMode(config.pressMode);
    const configHoldDurationMs = normalizeHoldDurationMs(config.holdDurationMs, 1000);
    return {
        pressMode: msg.pressMode === undefined
            ? configPressMode
            : normalizePressMode(msg.pressMode),
        holdDurationMs: msg.holdDurationMs === undefined
            ? configHoldDurationMs
            : normalizeHoldDurationMs(msg.holdDurationMs, configHoldDurationMs)
    };
};
const cloneMessage = (RED, msg) => RED.util.cloneMessage(msg);
const createActionMessage = (RED, sourceMsg, action, durationMs, acknowledge) => {
    const nextMsg = cloneMessage(RED, sourceMsg);
    if (acknowledge)
        nextMsg.acknowledge = true;
    nextMsg.payload = {
        action,
        durationMs
    };
    return nextMsg;
};
const createSwitchMessage = (RED, sourceMsg, acknowledge) => {
    const nextMsg = cloneMessage(RED, sourceMsg);
    if (acknowledge)
        nextMsg.acknowledge = true;
    nextMsg.payload = {
        state: {
            power: sourceMsg.payload
        }
    };
    return nextMsg;
};
const handleDirectPress = async (RED, node, repo, ids, msg, runtimeOptions) => {
    const results = await Promise.all(ids.map(id => repo.press(id)));
    const failedResults = results.filter(result => result.hasFailed);
    if (failedResults.length > 0) {
        failedResults.forEach(result => node.error((result.errors || []).join(', '), msg));
        return;
    }
    node.send(createActionMessage(RED, msg, 'press', runtimeOptions.holdDurationMs, node.acknowledge));
};
const handleDirectRelease = async (RED, node, repo, ids, msg, runtimeOptions) => {
    const results = await Promise.all(ids.map(id => repo.release(id)));
    const failedResults = results.filter(result => result.hasFailed);
    if (failedResults.length > 0) {
        failedResults.forEach(result => node.error((result.errors || []).join(', '), msg));
        return;
    }
    node.send(createActionMessage(RED, msg, 'release', runtimeOptions.holdDurationMs, node.acknowledge));
};
const handleLongPress = async (RED, node, repo, ids, msg, runtimeOptions) => {
    const callbacks = {
        onPress: async () => {
            node.send(createActionMessage(RED, msg, 'press', runtimeOptions.holdDurationMs, node.acknowledge));
        },
        onRelease: async () => {
            node.send(createActionMessage(RED, msg, 'release', runtimeOptions.holdDurationMs, node.acknowledge));
        }
    };
    const result = await repo.pressForMany(ids, runtimeOptions.holdDurationMs, callbacks);
    if (result.hasFailed)
        node.error((result.errors || []).join(', '), msg);
};
const handleSwitch = async (RED, node, repo, ids, msg) => {
    const results = await Promise.all(ids.map(id => repo.switch(id, msg.payload)));
    const failedResults = results.filter(result => result.hasFailed);
    if (failedResults.length > 0) {
        failedResults.forEach(result => node.error((result.errors || []).join(', '), msg));
        return;
    }
    node.send(createSwitchMessage(RED, msg, node.acknowledge));
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
        this.on('input', async (rawMsg) => {
            const msg = rawMsg;
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
                const useDirectPress = msg.payload === 'press';
                const useDirectRelease = msg.payload === 'release';
                if (useDirectPress) {
                    if (!isPressCapableRepository(repo))
                        throw new Error('EmpirBus repository does not support press commands. Update garmin-empirbus-ts first.');
                    await handleDirectPress(RED, this, repo, ids, msg, runtimeOptions);
                    return;
                }
                if (useDirectRelease) {
                    if (!isPressCapableRepository(repo))
                        throw new Error('EmpirBus repository does not support release commands. Update garmin-empirbus-ts first.');
                    await handleDirectRelease(RED, this, repo, ids, msg, runtimeOptions);
                    return;
                }
                if (runtimeOptions.pressMode === 'press') {
                    if (!isPressCapableRepository(repo))
                        throw new Error('EmpirBus repository does not support long press. Update garmin-empirbus-ts first.');
                    await handleLongPress(RED, this, repo, ids, msg, runtimeOptions);
                    return;
                }
                await handleSwitch(RED, this, repo, ids, msg);
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