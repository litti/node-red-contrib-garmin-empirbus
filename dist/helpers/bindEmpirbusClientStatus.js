"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.bindEmpirbusClientStatus = void 0;
const garmin_empirbus_ts_1 = require("garmin-empirbus-ts");
const getConnectedText = (options) => options?.connectedText ?? 'connected';
const bindEmpirbusClientStatus = (node, configNode, options) => {
    if (!configNode) {
        node.status({ fill: 'red', shape: 'ring', text: 'UNCONFIGURED' });
        return undefined;
    }
    return configNode.onState(state => {
        switch (state) {
            case garmin_empirbus_ts_1.EmpirBusClientState.Connected:
                node.status({ fill: 'green', shape: 'dot', text: getConnectedText(options) });
                break;
            case garmin_empirbus_ts_1.EmpirBusClientState.Error:
                node.status({ fill: 'red', shape: 'dot', text: 'ERROR' });
                break;
            case garmin_empirbus_ts_1.EmpirBusClientState.Connecting:
                node.status({ fill: 'red', shape: 'ring', text: 'connecting' });
                break;
            default:
            case garmin_empirbus_ts_1.EmpirBusClientState.Closed:
                node.status({ fill: 'red', shape: 'ring', text: 'disconnected' });
                break;
        }
    });
};
exports.bindEmpirbusClientStatus = bindEmpirbusClientStatus;
//# sourceMappingURL=bindEmpirbusClientStatus.js.map