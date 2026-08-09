import type { NodeDef, NodeInitializer } from 'node-red'
import { bindEmpirbusClientStatus } from '../helpers/bindEmpirbusClientStatus'
import { parseChannelIds, resolveChannelIds } from '../helpers/channelHandling'
import { resolveDimPayload, resolvePower } from '../helpers/inputPayload'
import { getRepository } from '../helpers/getRepository'
import { EmpirbusConfigNode } from '../types/EmpirbusConfigNode'
import { EmpirbusToggleAndSwitchNode } from '../types/EmpirbusToggleAndSwitchNode'
import { getResultError } from '../helpers/resultHandling'

type Mode = 'raw' | 'percent' | 'normalized'
interface Def extends NodeDef { acknowledge: boolean; channelId?: string; channelIds?: string; channelName?: string; config: string; name: string; inputMode?: Mode; onLevel?: string }

const getMaximumValue = (mode: Mode) => {
    if (mode === 'raw')
        return 255

    if (mode === 'normalized')
        return 1

    return 100
}

const convert = (value: unknown, mode: Mode): { raw: number; brightness: number } => {
    const n = Number(value)
    if (!Number.isFinite(n))
        throw new Error(`Invalid dimmer payload: ${JSON.stringify(value)}`)

    if (mode === 'raw') {
        if (!Number.isInteger(n) || n < 0 || n > 255)
            throw new Error('Raw dimmer value must be an integer from 0 to 255.')

        return { raw: n, brightness: n / 255 * 100 }
    }

    if (mode === 'normalized') {
        if (n < 0 || n > 1)
            throw new Error('Normalized dimmer value must be between 0 and 1.')

        return { raw: Math.round(n * 255), brightness: n * 100 }
    }

    if (n < 0 || n > 100)
        throw new Error('Percent dimmer value must be between 0 and 100.')

    return { raw: Math.round(n / 100 * 255), brightness: n }
}

const resolveDimPower = (payload: unknown) => {
    if (typeof payload === 'boolean')
        return payload ? 'ON' : 'OFF'

    if (typeof payload === 'string') {
        const normalized = payload.trim().toLowerCase()
        if (['on', 'ein', 'true'].includes(normalized))
            return 'ON'

        if (['off', 'aus', 'false'].includes(normalized))
            return 'OFF'

        return undefined
    }

    if (!payload || typeof payload !== 'object')
        return undefined

    const value = payload as { power?: unknown; state?: { power?: unknown } }
    if (value.power === undefined && value.state?.power === undefined)
        return undefined

    return resolvePower(payload)
}

const resolveValue = (payload: unknown, mode: Mode, onLevel: number) => {
    const power = resolveDimPower(payload)
    if (power === 'ON')
        return convert(onLevel, mode)

    if (power === 'OFF')
        return convert(0, mode)

    return convert(resolveDimPayload(payload), mode)
}

const init: NodeInitializer = RED => {
    function Constructor(this: EmpirbusToggleAndSwitchNode, config: Def) {
        RED.nodes.createNode(this, config)
        this.acknowledge = !!config.acknowledge
        this.configNode = RED.nodes.getNode(config.config) as EmpirbusConfigNode | null
        this.channelId = config.channelId && Number.isFinite(Number(config.channelId)) ? Number(config.channelId) : undefined
        this.channelName = config.channelName || undefined
        this.channelIds = config.channelIds || ''
        this.selectedChannelIds = parseChannelIds(this.channelIds)

        const mode: Mode = ['raw', 'normalized'].includes(config.inputMode || '') ? config.inputMode as Mode : 'percent'
        const configuredOnLevel = config.onLevel === undefined || config.onLevel === '' ? getMaximumValue(mode) : Number(config.onLevel)
        const unsubscribe = bindEmpirbusClientStatus(this, this.configNode)

        this.on('close', () => unsubscribe?.())
        this.on('input', async (msg: any, send: any, done: any) => {
            try {
                const repo = await getRepository(this)
                if (!repo)
                    throw new Error('No EmpirBus config node configured.')

                const ids = await resolveChannelIds(this, msg, repo)
                if (!ids.length)
                    throw new Error('No matching channel found.')

                const value = resolveValue(msg.payload, mode, configuredOnLevel)
                const results = ids.map(id => repo.dim(id, value.raw))
                const error = results.map(getResultError).find(Boolean)
                if (error)
                    throw new Error(error)

                if (this.acknowledge) {
                    msg.acknowledge = true
                    msg.payload = { state: { brightness: value.brightness } }
                    send(msg)
                }

                done?.()
            }
            catch (error) {
                done ? done(error) : this.error(error, msg)
            }
        })
    }

    RED.nodes.registerType('empirbus-dim', Constructor)
}

export = init
