import { EmpirBusChannelRepository } from 'garmin-empirbus-ts'
import { SwitchState } from 'garmin-empirbus-ts/dist/infrastructure/repositories/EmpirBus/EmpirBusChannelRepository'
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
    press(id: number): Promise<{ hasFailed?: boolean; errors?: string[] }>

    release(id: number): Promise<{ hasFailed?: boolean; errors?: string[] }>

    pressFor(id: number, durationMs: number): Promise<{ hasFailed?: boolean; errors?: string[] }>
}

interface RuntimeOptions {
    holdDurationMs: number
    pressMode: PressMode
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
    && typeof (repo as PressCapableRepository).pressFor === 'function'

const resolveRuntimeOptions = (
    msg: Record<string, unknown>,
    config: EmpirbusSwitchNodeDef
): RuntimeOptions => {
    const configPressMode = normalizePressMode(config.pressMode)
    const configHoldDurationMs = normalizeHoldDurationMs(config.holdDurationMs, 1000)

    const msgPressMode = normalizePressMode(msg.pressMode)
    const pressMode = msg.pressMode === undefined ? configPressMode : msgPressMode

    const holdDurationMs = msg.holdDurationMs === undefined
        ? configHoldDurationMs
        : normalizeHoldDurationMs(msg.holdDurationMs, configHoldDurationMs)

    return {
        pressMode,
        holdDurationMs
    }
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

        this.on('input', async msg => {
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
                const runtimeOptions = resolveRuntimeOptions(msg as Record<string, unknown>, config)
                const payload = msg.payload
                const useDirectPress = payload === 'press'
                const useDirectRelease = payload === 'release'

                const results = await Promise.all(ids.map(id => {
                    if (useDirectPress) {
                        if (!isPressCapableRepository(repo))
                            throw new Error('EmpirBus repository does not support press commands. Update garmin-empirbus-ts first.')

                        return repo.press(id)
                    }

                    if (useDirectRelease) {
                        if (!isPressCapableRepository(repo))
                            throw new Error('EmpirBus repository does not support release commands. Update garmin-empirbus-ts first.')

                        return repo.release(id)
                    }

                    if (runtimeOptions.pressMode === 'press') {
                        if (!isPressCapableRepository(repo))
                            throw new Error('EmpirBus repository does not support long press. Update garmin-empirbus-ts first.')

                        return repo.pressFor(id, runtimeOptions.holdDurationMs)
                    }

                    return repo.switch(id, payload as SwitchState)
                }))

                const failedResults = results.filter(result => result.hasFailed)

                if (failedResults.length === 0) {
                    if (this.acknowledge)
                        msg.acknowledge = true

                    if (useDirectPress || useDirectRelease) {
                        msg.payload = {
                            action: payload,
                            durationMs: useDirectPress ? runtimeOptions.holdDurationMs : undefined
                        }
                    }
                    else if (runtimeOptions.pressMode === 'press') {
                        msg.payload = {
                            action: 'press',
                            durationMs: runtimeOptions.holdDurationMs
                        }
                    }
                    else {
                        msg.payload = {
                            state: {
                                power: payload
                            }
                        }
                    }

                    this.log(
                        `Handled channels ${ids.join(',')} using mode ${runtimeOptions.pressMode}, returning message ${JSON.stringify(msg)}`
                    )
                }
                else {
                    failedResults.forEach(result => this.error((result.hasFailed ? result.errors || [] : []).join(', '), msg))
                }

                this.send(msg)
            }
            catch (error) {
                this.error(error as Error, msg)
            }
        })
    }

    RED.nodes.registerType('empirbus-switch', EmpirbusSwitchNodeConstructor)
}

export = nodeInit
