"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.sendAcknowledge = exports.resolveAcknowledgeMode = void 0;
const resolveAcknowledgeMode = (mode, legacyAcknowledge) => {
    if (mode === 'immediate' || mode === 'completed' || mode === 'none')
        return mode;
    return legacyAcknowledge === true ? 'completed' : 'none';
};
exports.resolveAcknowledgeMode = resolveAcknowledgeMode;
const sendAcknowledge = (mode, expectedMode, msg, send, payload) => {
    if (mode !== expectedMode)
        return;
    msg.acknowledge = true;
    if (payload !== undefined)
        msg.payload = payload;
    send(msg);
};
exports.sendAcknowledge = sendAcknowledge;
//# sourceMappingURL=acknowledge.js.map