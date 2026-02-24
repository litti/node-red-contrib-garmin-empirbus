"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.getRepository = void 0;
const getRepository = async (node) => {
    if (!node.configNode)
        return null;
    return node.configNode.getRepository();
};
exports.getRepository = getRepository;
//# sourceMappingURL=getRepository.js.map