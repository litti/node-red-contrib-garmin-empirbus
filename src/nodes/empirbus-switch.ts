import { EmpirBusChannelRepository, PressForCallbacks, SwitchState } from 'garmin-empirbus-ts'
import { ResultType } from 'garmin-empirbus-ts/dist/application/result'
import type { NodeDef, NodeInitializer } from 'node-red'
import { bindEmpirbusClientStatus } from '../helpers/bindEmpirbusClientStatus'
import { parseChannelIds, resolveChannelIds } from '../helpers/channelHandling'
import { EmpirbusConfigNode } from '../types/EmpirbusConfigNode'
import { EmpirbusToggleAndSwitchNode } from '../types/EmpirbusToggleAndSwitchNode'

type PressMode = 'switch' | 'press'

interface EmpirbusSwitchNodeDef extends NodeDef {
    acknowledge: boolean
    channelId?: string
    channelIds?: string
    channelName?: string
    config: string
    holdDurationMs?: number | string
    name: string
    pressMode?: PressMode
}

interface PressCapableRepository extends EmpirBusChannelRepository {
    press(id: number): Promise<ResultType<string>>

    release(id: number): Promise<ResultType<string>>

    pressForMany(ids: number[], durationMs: number, callbacks?: PressForCallbacks): Promise<ResultType<string>>
}

interface RuntimeOptions {
    holdDurationMs: number
    pressMode: PressMode
}

interface MutableMessage {
    _msgid: string
    acknowledge?: boolean
    holdDurationMs?: unknown
    payload: unknown
    pressMode?: unknown

    [key: string]: unknown
}

const getRepository = async (node: EmpirbusToggleAndSwitchNode): Promise<EmpirBusChannelRepository | null> => {
    if (!node.configNode)
        return null

    return node.configNode.getRepository()
}

const normalizePressMode = (value: unknown): PressMode => {
    if (value === 'press')
        return 'press'

    return 'switch'
}

const normalizeHoldDurationMs = (value: unknown, fallback = 1000): number => {
    const parsed = Number(value)

    if (!Number.isFinite(parsed))
        return fallback

    return Math.max(0, Math.round(parsed))
}

const isPressCapableRepository = (repo: EmpirBusChannelRepository): repo is PressCapableRepository =>
    typeof (repo as PressCapableRepository).press === 'function'
    && typeof (repo as PressCapableRepository).release === 'function'
    && typeof (repo as PressCapableRepository).pressForMany === 'function'

const resolveRuntimeOptions = (
    msg: MutableMessage,
    config: EmpirbusSwitchNodeDef
): RuntimeOptions => {
    const configPressMode = normalizePressMode(config.pressMode)
    const configHoldDurationMs = normalizeHoldDurationMs(config.holdDurationMs, 1000)

    return {
        pressMode: msg.pressMode === undefined
            ? configPressMode
            : normalizePressMode(msg.pressMode),
        holdDurationMs: msg.holdDurationMs === undefined
            ? configHoldDurationMs
            : normalizeHoldDurationMs(msg.holdDurationMs, configHoldDurationMs)
    }
}

const cloneMessage = (RED: Parameters<NodeInitializer>[0], msg: MutableMessage): MutableMessage =>
    RED.util.cloneMessage(msg) as MutableMessage

const createActionMessage = (
    RED: Parameters<NodeInitializer>[0],
    sourceMsg: MutableMessage,
    action: 'press' | 'release',
    durationMs: number,
    acknowledge: boolean
): MutableMessage => {
    const nextMsg = cloneMessage(RED, sourceMsg)

    if (acknowledge)
        nextMsg.acknowledge = true

    nextMsg.payload = {
        action,
        durationMs
    }

    return nextMsg
}

const createSwitchMessage = (
    RED: Parameters<NodeInitializer>[0],
    sourceMsg: MutableMessage,
    acknowledge: boolean
): MutableMessage => {
    const nextMsg = cloneMessage(RED, sourceMsg)

    if (acknowledge)
        nextMsg.acknowledge = true

    nextMsg.payload = {
        state: {
            power: sourceMsg.payload
        }
    }

    return nextMsg
}

const handleDirectPress = async (
    RED: Parameters<NodeInitializer>[0],
    node: EmpirbusToggleAndSwitchNode,
    repo: PressCapableRepository,
    ids: number[],
    msg: MutableMessage,
    runtimeOptions: RuntimeOptions
) => {
    const results = await Promise.all(ids.map(id => repo.press(id)))
    const failedResults = results.filter(result => result.hasFailed)

    if (failedResults.length > 0) {
        failedResults.forEach(result => node.error((result.errors || []).join(', '), msg))
        return
    }

    node.send(createActionMessage(
        RED,
        msg,
        'press',
        runtimeOptions.holdDurationMs,
        node.acknowledge
    ))
}

const handleDirectRelease = async (
    RED: Parameters<NodeInitializer>[0],
    node: EmpirbusToggleAndSwitchNode,
    repo: PressCapableRepository,
    ids: number[],
    msg: MutableMessage,
    runtimeOptions: RuntimeOptions
) => {
    const results = await Promise.all(ids.map(id => repo.release(id)))
    const failedResults = results.filter(result => result.hasFailed)

    if (failedResults.length > 0) {
        failedResults.forEach(result => node.error((result.errors || []).join(', '), msg))
        return
    }

    node.send(createActionMessage(
        RED,
        msg,
        'release',
        runtimeOptions.holdDurationMs,
        node.acknowledge
    ))
}

const handleLongPress = async (
    RED: Parameters<NodeInitializer>[0],
    node: EmpirbusToggleAndSwitchNode,
    repo: PressCapableRepository,
    ids: number[],
    msg: MutableMessage,
    runtimeOptions: RuntimeOptions
) => {
    const callbacks: PressForCallbacks = {
        onPress: async () => {
            node.send(createActionMessage(
                RED,
                msg,
                'press',
                runtimeOptions.holdDurationMs,
                node.acknowledge
            ))
        },
        onRelease: async () => {
            node.send(createActionMessage(
                RED,
                msg,
                'release',
                runtimeOptions.holdDurationMs,
                node.acknowledge
            ))
        }
    }

    const result = await repo.pressForMany(ids, runtimeOptions.holdDurationMs, callbacks)

    if (result.hasFailed)
        node.error((result.errors || []).join(', '), msg)
}

const handleSwitch = async (
    RED: Parameters<NodeInitializer>[0],
    node: EmpirbusToggleAndSwitchNode,
    repo: EmpirBusChannelRepository,
    ids: number[],
    msg: MutableMessage
) => {
    const results = await Promise.all(ids.map(id => repo.switch(id, msg.payload as SwitchState)))
    const failedResults = results.filter(result => result.hasFailed)

    if (failedResults.length > 0) {
        failedResults.forEach(result => node.error((result.errors || []).join(', '), msg))
        return
    }

    node.send(createSwitchMessage(RED, msg, node.acknowledge))
}

const nodeInit: NodeInitializer = RED => {
    function EmpirbusSwitchNodeConstructor(this: EmpirbusToggleAndSwitchNode, config: EmpirbusSwitchNodeDef) {
        RED.nodes.createNode(this, config)

        this.acknowledge = config.acknowledge || false
        this.configNode = RED.nodes.getNode(config.config) as EmpirbusConfigNode | null
        this.channelId = config.channelId ? Number(config.channelId) : undefined
        this.channelName = config.channelName || undefined
        this.channelIds = config.channelIds || ''
        this.selectedChannelIds = parseChannelIds(this.channelIds)

        const unsubscribeState = bindEmpirbusClientStatus(this, this.configNode)

        this.on('close', () => {
            unsubscribeState?.()
        })

        this.on('input', async rawMsg => {
            const msg = rawMsg as MutableMessage

            const repo = await getRepository(this)
            if (!repo) {
                this.error('No EmpirBus config node configured. Configure and select an EmpirBus config node first!', msg)
                return
            }

            const ids = await resolveChannelIds(this, msg, repo)
            if (ids.length === 0) {
                this.error('No matching channel found', msg)
                this.send(msg)
                return
            }

            try {
                const runtimeOptions = resolveRuntimeOptions(msg, config)
                const useDirectPress = msg.payload === 'press'
                const useDirectRelease = msg.payload === 'release'

                if (useDirectPress) {
                    if (!isPressCapableRepository(repo))
                        throw new Error('EmpirBus repository does not support press commands. Update garmin-empirbus-ts first.')

                    await handleDirectPress(RED, this, repo, ids, msg, runtimeOptions)
                    return
                }

                if (useDirectRelease) {
                    if (!isPressCapableRepository(repo))
                        throw new Error('EmpirBus repository does not support release commands. Update garmin-empirbus-ts first.')

                    await handleDirectRelease(RED, this, repo, ids, msg, runtimeOptions)
                    return
                }

                if (runtimeOptions.pressMode === 'press') {
                    if (!isPressCapableRepository(repo))
                        throw new Error('EmpirBus repository does not support long press. Update garmin-empirbus-ts first.')

                    await handleLongPress(RED, this, repo, ids, msg, runtimeOptions)
                    return
                }

                await handleSwitch(RED, this, repo, ids, msg)
            }
            catch (error) {
                this.error(error as Error, msg)
            }
        })
    }

    RED.nodes.registerType('empirbus-switch', EmpirbusSwitchNodeConstructor)
}

export = nodeInit
