"use strict";
const garmin_empirbus_ts_1 = require("garmin-empirbus-ts");
const channelHandling_1 = require("../helpers/channelHandling");
const getRepository = async (node) => {
    if (!node.configNode)
        return null;
    return node.configNode.getRepository();
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
        if (this.configNode) {
            this.configNode.onState((state) => {
                switch (state) {
                    case garmin_empirbus_ts_1.EmpirBusClientState.Connected:
                        this.status({ fill: 'green', shape: 'dot', text: `connected` });
                        break;
                    case garmin_empirbus_ts_1.EmpirBusClientState.Error:
                        this.status({ fill: 'red', shape: 'dot', text: `ERROR` });
                        break;
                    case garmin_empirbus_ts_1.EmpirBusClientState.Connecting:
                        this.status({ fill: 'red', shape: 'ring', text: `connecting` });
                        break;
                    default:
                    case garmin_empirbus_ts_1.EmpirBusClientState.Closed:
                        this.status({ fill: 'red', shape: 'ring', text: `disconnected` });
                        break;
                }
            });
        }
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
                const promises = ids.map(id => repo.switch(id, msg.payload));
                const results = await Promise.all(promises);
                if (results.filter(result => result.hasFailed).length === 0) {
                    if (this.acknowledge) {
                        msg.acknowledge = true;
                        msg.payload = {
                            state: {
                                power: msg.payload
                            }
                        };
                    }
                    this.log(`Switched channels ${ids.join(',')} ${msg.payload}, returning message ${JSON.stringify(msg)}`);
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
    RED.nodes.registerType('empirbus-switch', EmpirbusSwitchNodeConstructor);
};
module.exports = nodeInit;
//# sourceMappingURL=empirbus-switch.js.map