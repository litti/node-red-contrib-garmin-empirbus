import { Channel, EmpirBusChannelRepository } from 'garmin-empirbus-ts'
import type { NodeMessageInFlow } from 'node-red'
import { EmpirbusToggleAndSwitchNode } from '../types/EmpirbusToggleAndSwitchNode'

export const parseChannelIds = (value?: string): number[] => {
    if (!value)
        return []
    return value
        .split(',')
        .map(s => Number(s.trim()))
        .filter(n => Number.isFinite(n))
}

export const resolveChannelIds = async (node: EmpirbusToggleAndSwitchNode, msg: NodeMessageInFlow, repo: EmpirBusChannelRepository): Promise<number[]> => {
    const fromCheckbox = node.selectedChannelIds ?? []
    if (fromCheckbox.length > 0)
        return fromCheckbox

    const fromMsgIds = getChannelIdsFromMsg(msg)
    if (fromMsgIds != null)
        return fromMsgIds

    const fromMsgPayload = getChannelIdsFromTopicOfMsg(msg)
    if (fromMsgPayload != null)
        return fromMsgPayload

    const fromMsgId = getChannelIdFromMsg(msg)
    if (fromMsgId != null)
        return [fromMsgId]

    if (typeof node.channelId === 'number' && Number.isFinite(node.channelId))
        return [node.channelId]

    const fromMsgName = getChannelNameFromMsg(msg)
    const name = fromMsgName ?? node.channelName
    if (!name) return []

    const index = await ensureChannelIndex(node, repo)
    const mapped = index.get(name)
    if (typeof mapped === 'number' && Number.isFinite(mapped)) {
        return [mapped]
    }

    return []
}

const getChannelIdFromMsg = (msg: NodeMessageInFlow): number | null => {
    const raw = (msg as any).channelId
    if (typeof raw === 'number' && Number.isFinite(raw))
        return raw
    if (typeof raw === 'string' && raw.trim().length > 0) {
        const n = Number(raw)
        if (Number.isFinite(n))
            return n
    }
    return null
}

const getChannelIdsFromMsg = (msg: NodeMessageInFlow): number[] | null => {
    const raw = (msg as any).channelIds
    if (typeof raw === 'number' && Number.isFinite(raw))
        return [raw]
    if (typeof raw === 'string' && raw.trim().length > 0)
        return parseChannelIds(raw)
    return null
}

const getChannelIdsFromTopicOfMsg = (msg: NodeMessageInFlow): number[] | null => {
    const raw = (msg as any).topic
    if (typeof raw === 'number' && Number.isFinite(raw))
        return [raw]
    if (typeof raw === 'string' && raw.trim().length > 0)
        return parseChannelIds(raw)
    return null
}

const getChannelNameFromMsg = (msg: NodeMessageInFlow): string | null => {
    const raw = (msg as any).channelName
    if (typeof raw === 'string' && raw.trim().length > 0)
        return raw.trim()
    return null
}

const ensureChannelIndex = async (node: EmpirbusToggleAndSwitchNode, repo: EmpirBusChannelRepository): Promise<Map<string, number>> => {

    if (node.channelIndexByName)
        return node.channelIndexByName

    const list = await repo.getChannelList()
    const index = new Map<string, number>()
    list.forEach((ch: Channel) => {
        if (ch.name) {
            index.set(ch.name, ch.id)
        }
    })
    node.channelIndexByName = index
    return index
}
