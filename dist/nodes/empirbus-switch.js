"use strict";
const bindEmpirbusClientStatus_1 = require("../helpers/bindEmpirbusClientStatus");
const channelHandling_1 = require("../helpers/channelHandling");
const inputPayload_1 = require("../helpers/inputPayload");
const getRepository_1 = require("../helpers/getRepository");
const resultHandling_1 = require("../helpers/resultHandling");
const init = RED => {
    function Constructor(config) {
        RED.nodes.createNode(this, config);
        this.acknowledge = !!config.acknowledge;
        this.configNode = RED.nodes.getNode(config.config);
        this.channelId = config.channelId && Number.isFinite(Number(config.channelId)) ? Number(config.channelId) : undefined;
        this.channelName = config.channelName || undefined;
        this.channelIds = config.channelIds || '';
        this.selectedChannelIds = (0, channelHandling_1.parseChannelIds)(this.channelIds);
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
                const power = (0, inputPayload_1.resolvePower)(msg.payload);
                if (power === undefined)
                    throw new Error(`Invalid switch payload: ${JSON.stringify(msg.payload)}`);
                const results = await Promise.all(ids.map(id => repo.switch(id, power)));
                const error = results.map(resultHandling_1.getResultError).find(Boolean);
                if (error)
                    throw new Error(error);
                if (this.acknowledge) {
                    msg.acknowledge = true;
                    msg.payload = { state: { power } };
                    send(msg);
                }
                done?.();
            }
            catch (error) {
                done ? done(error) : this.error(error, msg);
            }
        });
    }
    RED.nodes.registerType('empirbus-switch', Constructor);
};
module.exports = init;
//# sourceMappingURL=empirbus-switch.js.map