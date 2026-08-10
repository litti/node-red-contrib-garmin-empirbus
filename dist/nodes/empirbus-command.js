"use strict";
const bindEmpirbusClientStatus_1 = require("../helpers/bindEmpirbusClientStatus");
const acknowledge_1 = require("../helpers/acknowledge");
const byte = (v) => Number.isInteger(v) && Number(v) >= 0 && Number(v) <= 255;
const validate = (payload) => {
    if (!payload || typeof payload !== 'object' || Array.isArray(payload))
        throw new Error('msg.payload must be an object.');
    const p = payload;
    if (!byte(p.messagetype))
        throw new Error('messagetype must be an integer from 0 to 255.');
    if (!byte(p.messagecmd))
        throw new Error('messagecmd must be an integer from 0 to 255.');
    if (!Array.isArray(p.data))
        throw new Error('data must be an array.');
    if (p.data.length > 255 || !p.data.every(byte))
        throw new Error('data must contain at most 255 integer bytes from 0 to 255.');
    const size = p.size === undefined ? p.data.length : p.size;
    if (!byte(size))
        throw new Error('size must be an integer from 0 to 255.');
    if (size !== p.data.length)
        throw new Error('size must equal data.length.');
    return { messagetype: p.messagetype, messagecmd: p.messagecmd, size, data: [...p.data] };
};
const init = RED => {
    function Constructor(config) {
        RED.nodes.createNode(this, config);
        const acknowledgeMode = (0, acknowledge_1.resolveAcknowledgeMode)(config.acknowledgeMode, config.acknowledge);
        const configNode = RED.nodes.getNode(config.config);
        const unsubscribe = (0, bindEmpirbusClientStatus_1.bindEmpirbusClientStatus)(this, configNode);
        this.on('close', () => unsubscribe?.());
        this.on('input', async (msg, send, done) => {
            try {
                if (!configNode)
                    throw new Error('No EmpirBus config node configured.');
                const telegram = validate(msg.payload);
                const repo = await configNode.getRepository();
                if (typeof repo.sendRawCommand !== 'function')
                    throw new Error('Installed garmin-empirbus-ts does not support raw commands.');
                (0, acknowledge_1.sendAcknowledge)(acknowledgeMode, 'immediate', msg, send);
                repo.sendRawCommand(telegram);
                (0, acknowledge_1.sendAcknowledge)(acknowledgeMode, 'completed', msg, send);
                done?.();
            }
            catch (error) {
                this.status({ fill: 'red', shape: 'dot', text: 'invalid command' });
                this.warn(error.message || String(error));
                done ? done(error) : this.error(error, msg);
            }
        });
    }
    RED.nodes.registerType('empirbus-command', Constructor);
};
module.exports = init;
//# sourceMappingURL=empirbus-command.js.map