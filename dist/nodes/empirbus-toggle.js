"use strict";
const bindEmpirbusClientStatus_1 = require("../helpers/bindEmpirbusClientStatus");
const channelHandling_1 = require("../helpers/channelHandling");
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
                const result = typeof repo.toggleMany === 'function'
                    ? await repo.toggleMany(ids)
                    : await Promise.all(ids.map((id) => repo.toggle(id))).then((r) => r.find(x => x.hasFailed) || r[0]);
                const error = (0, resultHandling_1.getResultError)(result);
                if (error) {
                    this.warn(error);
                    throw new Error(error);
                }
                if (this.acknowledge) {
                    msg.acknowledge = true;
                    send(msg);
                }
                done?.();
            }
            catch (error) {
                done ? done(error) : this.error(error, msg);
            }
        });
    }
    RED.nodes.registerType('empirbus-toggle', Constructor);
};
module.exports = init;
//# sourceMappingURL=empirbus-toggle.js.map