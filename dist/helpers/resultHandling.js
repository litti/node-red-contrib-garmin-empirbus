"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.getResultError = void 0;
const getResultError = (result) => result?.hasFailed ? (result.errors || []).join(', ') || 'EmpirBus command failed.' : null;
exports.getResultError = getResultError;
//# sourceMappingURL=resultHandling.js.map