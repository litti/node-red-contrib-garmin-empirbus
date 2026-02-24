"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.resolveChannelIds = exports.parseChannelIds = void 0;
const parseChannelIds = (value) => {
    if (!value)
        return [];
    return value
        .split(',')
        .map(s => Number(s.trim()))
        .filter(n => Number.isFinite(n));
};
exports.parseChannelIds = parseChannelIds;
const resolveChannelIds = async (node, msg, repo) => {
    const fromCheckbox = node.selectedChannelIds ?? [];
    if (fromCheckbox.length > 0)
        return fromCheckbox;
    const fromMsgIds = getChannelIdsFromMsg(msg);
    if (fromMsgIds != null)
        return fromMsgIds;
    const fromMsgPayload = getChannelIdsFromPayloadOfMsg(msg);
    if (fromMsgPayload != null)
        return fromMsgPayload;
    const fromMsgId = getChannelIdFromMsg(msg);
    if (fromMsgId != null)
        return [fromMsgId];
    if (typeof node.channelId === 'number' && Number.isFinite(node.channelId))
        return [node.channelId];
    const fromMsgName = getChannelNameFromMsg(msg);
    const name = fromMsgName ?? node.channelName;
    if (!name)
        return [];
    const index = await ensureChannelIndex(node, repo);
    const mapped = index.get(name);
    if (typeof mapped === 'number' && Number.isFinite(mapped)) {
        return [mapped];
    }
    return [];
};
exports.resolveChannelIds = resolveChannelIds;
const getChannelIdFromMsg = (msg) => {
    const raw = msg.channelId;
    if (typeof raw === 'number' && Number.isFinite(raw))
        return raw;
    if (typeof raw === 'string' && raw.trim().length > 0) {
        const n = Number(raw);
        if (Number.isFinite(n))
            return n;
    }
    return null;
};
const getChannelIdsFromMsg = (msg) => {
    const raw = msg.channelIds;
    if (typeof raw === 'number' && Number.isFinite(raw))
        return [raw];
    if (typeof raw === 'string' && raw.trim().length > 0)
        return (0, exports.parseChannelIds)(raw);
    return null;
};
const getChannelIdsFromPayloadOfMsg = (msg) => {
    const raw = msg.payload;
    if (typeof raw === 'number' && Number.isFinite(raw))
        return [raw];
    if (typeof raw === 'string' && raw.trim().length > 0)
        return (0, exports.parseChannelIds)(raw);
    return null;
};
const getChannelNameFromMsg = (msg) => {
    const raw = msg.channelName;
    if (typeof raw === 'string' && raw.trim().length > 0)
        return raw.trim();
    return null;
};
const ensureChannelIndex = async (node, repo) => {
    if (node.channelIndexByName)
        return node.channelIndexByName;
    const list = await repo.getChannelList();
    const index = new Map();
    list.forEach((ch) => {
        if (ch.name) {
            index.set(ch.name, ch.id);
        }
    });
    node.channelIndexByName = index;
    return index;
};
//# sourceMappingURL=channelHandling.js.map