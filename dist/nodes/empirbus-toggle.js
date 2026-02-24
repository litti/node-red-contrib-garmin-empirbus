"use strict";
const channelHandling_1 = require("../helpers/channelHandling");
const getRepository = async (node) => {
    if (!node.configNode)
        return null;
    return node.configNode.getRepository();
};
const nodeInit = RED => {
    function EmpirbusToggleNodeConstructor(config) {
        RED.nodes.createNode(this, config);
        this.acknowledge = config.acknowledge || false;
        this.configNode = RED.nodes.getNode(config.config);
        this.channelId = config.channelId ? Number(config.channelId) : undefined;
        this.channelName = config.channelName || undefined;
        this.channelIds = config.channelIds || '';
        this.channelIds = config.channelIds || '';
        this.selectedChannelIds = (0, channelHandling_1.parseChannelIds)(this.channelIds);
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
                const promises = ids.map(id => repo.toggle(id));
                await Promise.all(promises);
                if (this.acknowledge)
                    msg.acknowledge = true;
                this.log(`Toggled channels ${ids.join(',')}, returning message ${JSON.stringify(msg)}`);
                this.send(msg);
            }
            catch (error) {
                this.error(error, msg);
            }
        });
    }
    RED.nodes.registerType('empirbus-toggle', EmpirbusToggleNodeConstructor);
};
module.exports = nodeInit;
//# sourceMappingURL=empirbus-toggle.js.map