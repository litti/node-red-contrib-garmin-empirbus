"use strict";
const channelHandling_1 = require("../helpers/channelHandling");
const getRepository_1 = require("../helpers/getRepository");
const nodeInit = RED => {
    function EmpirbusDimNodeConstructor(config) {
        RED.nodes.createNode(this, config);
        this.acknowledge = config.acknowledge || false;
        this.configNode = RED.nodes.getNode(config.config);
        this.channelId = config.channelId ? Number(config.channelId) : undefined;
        this.channelName = config.channelName || undefined;
        this.channelIds = config.channelIds || '';
        this.channelIds = config.channelIds || '';
        this.selectedChannelIds = (0, channelHandling_1.parseChannelIds)(this.channelIds);
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
                let level = msg.payload * 10;
                if (level < 120 && msg.payload > 0)
                    level = 120;
                const results = ids.map(id => repo.dim(id, level));
                if (results.filter(result => result.hasFailed).length === 0) {
                    if (this.acknowledge) {
                        msg.acknowledge = true;
                        msg.payload = {
                            state: {
                                brightness: msg.payload
                            }
                        };
                    }
                    this.log(`Dimmed channels ${ids.join(',')} ${msg.payload}, returning message ${JSON.stringify(msg)}`);
                }
                else {
                    results.filter(result => result.hasFailed).forEach(result => {
                        this.error(result.errors.join(', '), msg);
                    });
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