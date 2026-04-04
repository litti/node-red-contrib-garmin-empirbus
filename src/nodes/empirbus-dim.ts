import { DimState } from 'garmin-empirbus-ts'
import type { NodeDef, NodeInitializer } from 'node-red'
import { parseChannelIds, resolveChannelIds } from '../helpers/channelHandling'
import { EmpirbusConfigNode } from '../types/EmpirbusConfigNode'
import { EmpirbusToggleAndSwitchNode } from '../types/EmpirbusToggleAndSwitchNode'
import { getRepository } from '../helpers/getRepository'
import { bindEmpirbusClientStatus } from '../helpers/bindEmpirbusClientStatus'

interface EmpirbusDimNodeDef extends NodeDef {
    acknowledge: boolean
    channelId?: string
    channelIds?: string
    channelName?: string
    onLevel?: string
    config: string
    name: string
}

const clampBrightness = (value: number): number =>
    Math.max(0, Math.min(100, Math.round(value)))

const toNumberOrUndefined = (value: unknown): number | undefined => {
    if (value === undefined || value === null)
        return undefined

    const parsed = Number(value)
    if (Number.isNaN(parsed))
        return undefined

    return parsed
}

const isOnPayload = (payload: unknown): boolean => {
    if (typeof payload === 'boolean')
        return payload

    if (typeof payload === 'number')
        return payload === 100

    if (typeof payload !== 'string')
        return false

    const normalized = payload.trim().toLowerCase()
    return normalized === 'on' || normalized === 'ein' || normalized === 'true' || normalized === '1'
}

const isOffPayload = (payload: unknown): boolean => {
    if (payload === false)
        return true

    if (typeof payload === 'number')
        return payload === 0

    if (typeof payload !== 'string')
        return false

    const normalized = payload.trim().toLowerCase()
    return normalized === 'off' || normalized === 'aus' || normalized === 'false' || normalized === '0'
}

const resolveBrightness = (payload: unknown, onLevel: number | undefined): number => {
    if (isOffPayload(payload))
        return 0

    if (isOnPayload(payload))
        return clampBrightness(onLevel ?? 100)

    const numeric = toNumberOrUndefined(payload)
    if (numeric === undefined)
        return clampBrightness(onLevel ?? 100)

    return clampBrightness(numeric)
}

const toDimState = (brightness: number): DimState => {
    if (brightness <= 0)
        return 0 as DimState

    let level = brightness * 10
    if (level < 120)
        level = 120

    return level as DimState
}

const nodeInit: NodeInitializer = RED => {
    function EmpirbusDimNodeConstructor(this: EmpirbusToggleAndSwitchNode, config: EmpirbusDimNodeDef) {
        RED.nodes.createNode(this, config)
        this.acknowledge = config.acknowledge || false
        this.configNode = RED.nodes.getNode(config.config) as EmpirbusConfigNode | null
        this.channelId = config.channelId ? Number(config.channelId) : undefined
        this.channelName = config.channelName || undefined
        this.channelIds = config.channelIds || ''
        this.selectedChannelIds = parseChannelIds(this.channelIds)

        const onLevel = (() => {
            const value = toNumberOrUndefined(config.onLevel)
            if (value === undefined)
                return undefined

            return clampBrightness(value)
        })()

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
                const brightness = resolveBrightness(msg.payload, onLevel)
                const promises = ids.map(id => repo.dim(id, toDimState(brightness)))
                const results = await Promise.all(promises)

                if (results.filter(result => result.hasFailed).length === 0) {
                    if (this.acknowledge) {
                        msg.acknowledge = true
                        msg.payload = {
                            state: {
                                brightness
                            }
                        }
                    }
                    this.log(`Dimmed channels ${ids.join(',')} ${brightness}, returning message ${JSON.stringify(msg)}`)
                }
                else {
                    results
                        .filter(result => result.hasFailed)
                        .forEach(result => this.error(result.errors.join(', '), msg))
                }

                this.send(msg)
            }
            catch (error) {
                this.error(error as Error, msg)
            }
        })
    }

    RED.nodes.registerType('empirbus-dim', EmpirbusDimNodeConstructor)
}

export = nodeInit
