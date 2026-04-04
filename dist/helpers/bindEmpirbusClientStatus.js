"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.bindEmpirbusClientStatus = void 0;
const garmin_empirbus_ts_1 = require("garmin-empirbus-ts");
const toNodeStatus = (state) => {
    if (state === garmin_empirbus_ts_1.EmpirBusClientState.Connected)
        return { fill: 'green', shape: 'dot', text: 'connected' };
    if (state === garmin_empirbus_ts_1.EmpirBusClientState.Error)
        return { fill: 'red', shape: 'dot', text: 'ERROR' };
    if (state === garmin_empirbus_ts_1.EmpirBusClientState.Connecting)
        return { fill: 'red', shape: 'ring', text: 'connecting' };
    return { fill: 'red', shape: 'ring', text: 'disconnected' };
};
const bindEmpirbusClientStatus = (node, configNode) => {
    if (!configNode) {
        node.status({ fill: 'red', shape: 'ring', text: 'unconfigured' });
        return undefined;
    }
    return configNode.onState(state => {
        node.status(toNodeStatus(state));
    });
};
exports.bindEmpirbusClientStatus = bindEmpirbusClientStatus;
//# sourceMappingURL=bindEmpirbusClientStatus.js.map