import type { NodeDef, NodeInitializer } from 'node-red'
import { bindEmpirbusClientStatus } from '../helpers/bindEmpirbusClientStatus'
import { parseChannelIds, resolveChannelIds } from '../helpers/channelHandling'
import { resolveDimPayload, resolveHomeKitBrightness, resolvePower } from '../helpers/inputPayload'
import { getRepository } from '../helpers/getRepository'
import { EmpirbusConfigNode } from '../types/EmpirbusConfigNode'
import { EmpirbusToggleAndSwitchNode } from '../types/EmpirbusToggleAndSwitchNode'
import { getResultError } from '../helpers/resultHandling'
import { resolveAcknowledgeMode, sendAcknowledge } from '../helpers/acknowledge'

type ValueMode = 'raw' | 'percent' | 'normalized'
type InputMode = ValueMode | 'auto'
interface Def extends NodeDef { acknowledge?: boolean; acknowledgeMode?: string; channelId?: string; channelIds?: string; channelName?: string; config: string; name: string; inputMode?: InputMode; onLevel?: string; onLevelMode?: ValueMode }

type ExplicitDimValue = {
    unit?: unknown
    value?: unknown
}

const getMaximumValue = (mode: ValueMode) => {
    if (mode === 'raw')
        return 255

    if (mode === 'normalized')
        return 1

    return 100
}

const convert = (value: unknown, mode: ValueMode): { raw: number; brightness: number } => {
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

const convertAuto = (value: unknown) => {
    const n = Number(value)
    if (!Number.isFinite(n))
        throw new Error(`Invalid dimmer payload: ${JSON.stringify(value)}`)

    if (n >= 0 && n <= 100)
        return convert(n, 'percent')

    if (Number.isInteger(n) && n >= 101 && n <= 255)
        return convert(n, 'raw')

    throw new Error('Auto dimmer value must be between 0 and 100 percent or an integer raw value from 101 to 255.')
}

const resolveExplicitDimValue = (payload: unknown): { value: unknown; mode: ValueMode } | undefined => {
    if (!payload || typeof payload !== 'object')
        return undefined

    const explicit = payload as ExplicitDimValue
    if (explicit.value === undefined || typeof explicit.unit !== 'string')
        return undefined

    const unit = explicit.unit.trim().toLowerCase()
    if (unit === 'raw')
        return { value: explicit.value, mode: 'raw' }

    if (unit === 'percent' || unit === '%')
        return { value: explicit.value, mode: 'percent' }

    if (unit === 'normalized' || unit === 'normalised')
        return { value: explicit.value, mode: 'normalized' }

    throw new Error(`Unsupported dimmer unit: ${explicit.unit}`)
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

    const value = payload as { On?: unknown; power?: unknown; state?: { power?: unknown } }
    if (value.On === undefined && value.power === undefined && value.state?.power === undefined)
        return undefined

    return resolvePower(payload)
}

const resolveInputValue = (payload: unknown, mode: InputMode) => {
    const explicit = resolveExplicitDimValue(payload)
    if (explicit)
        return convert(explicit.value, explicit.mode)

    const homeKitBrightness = resolveHomeKitBrightness(payload)
    if (homeKitBrightness !== undefined)
        return convert(homeKitBrightness, 'percent')

    const dimValue = resolveDimPayload(payload)
    if (mode === 'auto')
        return convertAuto(dimValue)

    return convert(dimValue, mode)
}

const resolveValue = (payload: unknown, mode: InputMode, onLevel: number, onLevelMode: ValueMode) => {
    const explicit = resolveExplicitDimValue(payload)
    if (explicit)
        return convert(explicit.value, explicit.mode)

    const homeKitBrightness = resolveHomeKitBrightness(payload)
    if (homeKitBrightness !== undefined)
        return convert(homeKitBrightness, 'percent')

    const power = resolveDimPower(payload)
    if (power === 'ON')
        return convert(onLevel, onLevelMode)

    if (power === 'OFF')
        return convert(0, 'raw')

    return resolveInputValue(payload, mode)
}

const resolveInputMode = (value: unknown): InputMode => {
    if (value === 'auto' || value === 'raw' || value === 'normalized')
        return value

    return 'percent'
}

const resolveOnLevelMode = (value: unknown, inputMode: InputMode): ValueMode => {
    if (value === 'raw' || value === 'percent' || value === 'normalized')
        return value

    if (inputMode !== 'auto')
        return inputMode

    return 'percent'
}

const init: NodeInitializer = RED => {
    function Constructor(this: EmpirbusToggleAndSwitchNode, config: Def) {
        RED.nodes.createNode(this, config)
        const acknowledgeMode = resolveAcknowledgeMode(config.acknowledgeMode, config.acknowledge)
        this.configNode = RED.nodes.getNode(config.config) as EmpirbusConfigNode | null
        this.channelId = config.channelId && Number.isFinite(Number(config.channelId)) ? Number(config.channelId) : undefined
        this.channelName = config.channelName || undefined
        this.channelIds = config.channelIds || ''
        this.selectedChannelIds = parseChannelIds(this.channelIds)

        const mode = resolveInputMode(config.inputMode)
        const onLevelMode = resolveOnLevelMode(config.onLevelMode, mode)
        const configuredOnLevel = config.onLevel === undefined || config.onLevel === '' ? getMaximumValue(onLevelMode) : Number(config.onLevel)
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

                const value = resolveValue(msg.payload, mode, configuredOnLevel, onLevelMode)
                const acknowledgementPayload = { state: { brightness: value.brightness } }
                sendAcknowledge(acknowledgeMode, 'immediate', msg, send, acknowledgementPayload)
                const results = ids.map(id => repo.dim(id, value.raw))
                const error = results.map(getResultError).find(Boolean)
                if (error)
                    throw new Error(error)

                sendAcknowledge(acknowledgeMode, 'completed', msg, send, acknowledgementPayload)

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
