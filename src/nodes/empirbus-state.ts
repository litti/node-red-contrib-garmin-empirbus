import type { NodeDef, NodeInitializer } from 'node-red'
import type { Channel, EmpirBusChannelRepository } from 'garmin-empirbus-ts'
import type { EmpirbusConfigNode } from '../types/EmpirbusConfigNode'
import { deriveChannelState } from '../helpers/deriveChannelState'
import { bindEmpirbusClientStatus } from '../helpers/bindEmpirbusClientStatus'
import { toHomeKitState } from '../helpers/toHomeKitState'
import { toAlexaState } from '../helpers/toAlexaState'

type Unsubscribe = () => void
interface Def extends NodeDef { name: string; config: string; channelIds?: string; channelId?: string; channelName?: string }
type State = Record<string, unknown>

const parseIds = (value?: string) => Array.from(new Set((value || '').split(',').map(v => Number(v.trim())).filter(Number.isFinite)))
const stable = (value: State) => JSON.stringify(value, Object.keys(value).sort())

const buildAlexaMessage = (endpointId: string, topic: string, state: State) => ({
    acknowledge: true,
    endpointId,
    topic,
    payload: { state }
})

const buildAlexaMessages = (state: State, previous: State | undefined, endpointId: string, topic: string) => {
    const messages: ReturnType<typeof buildAlexaMessage>[] = []
    const powerChanged = state.power !== undefined && (!previous || previous.power !== state.power)
    const brightnessChanged = state.brightness !== undefined && (!previous || previous.brightness !== state.brightness)

    if (powerChanged && brightnessChanged)
        messages.push(buildAlexaMessage(endpointId, topic, { power: state.power, brightness: state.brightness }))
    else if (powerChanged)
        messages.push(buildAlexaMessage(endpointId, topic, { power: state.power }))
    else if (brightnessChanged)
        messages.push(buildAlexaMessage(endpointId, topic, { brightness: state.brightness }))

    for (const [key, value] of Object.entries(state)) {
        if (key === 'power' || key === 'brightness')
            continue

        if (!previous || previous[key] !== value)
            messages.push(buildAlexaMessage(endpointId, topic, { [key]: value }))
    }

    return messages
}

const init: NodeInitializer = RED => {
    function Constructor(this: any, config: Def) {
        RED.nodes.createNode(this, config)
        const configNode = RED.nodes.getNode(config.config) as EmpirbusConfigNode | null
        const wantedIds = parseIds(config.channelIds)
        const parsedFallback = config.channelId === undefined || config.channelId === '' ? undefined : Number(config.channelId)
        const fallbackId = Number.isFinite(parsedFallback) ? parsedFallback : undefined
        const wantedName = config.channelName?.trim().toLowerCase()
        const lastStates = new Map<number, string>()
        const lastAlexaStates = new Map<number, State>()
        let unsubscribeUpdate: Unsubscribe | undefined
        let closed = false

        const unsubscribeStatus = bindEmpirbusClientStatus(this, configNode, { connectedText: 'listening' })
        if (!configNode) {
            this.error('No EmpirBus config node configured.')
            return
        }

        const relevant = (channel: Channel) => {
            if (wantedIds.length)
                return wantedIds.includes(channel.id)

            if (fallbackId !== undefined)
                return channel.id === fallbackId

            if (wantedName)
                return (channel.name || '').trim().toLowerCase() === wantedName

            return true
        }

        configNode.getRepository().then((repo: EmpirBusChannelRepository) => {
            if (closed)
                return

            unsubscribeUpdate = repo.onUpdate((channel: Channel) => {
                if (closed || !relevant(channel))
                    return

                const state = deriveChannelState(channel)
                if (!state)
                    return

                const serialized = stable(state)
                if (lastStates.get(channel.id) === serialized)
                    return

                lastStates.set(channel.id, serialized)
                const endpointId = String(channel.id)
                const topic = `empirbus/${endpointId}`
                const standardMessage = { acknowledge: true, endpointId, topic, payload: { state } }
                const alexaState = toAlexaState(state)
                const previousAlexaState = lastAlexaStates.get(channel.id)
                const alexaMessages = alexaState ? buildAlexaMessages(alexaState, previousAlexaState, endpointId, topic) : []
                if (alexaState)
                    lastAlexaStates.set(channel.id, alexaState)
                const homeKitState = toHomeKitState(state)
                const homeKitMessage = homeKitState ? { endpointId, topic, payload: homeKitState } : null

                this.send([standardMessage, alexaMessages.length ? alexaMessages : null, homeKitMessage])
            })
        }).catch(error => this.error(error))

        this.on('close', () => {
            closed = true
            unsubscribeUpdate?.()
            unsubscribeStatus?.()
            this.status({})
        })
    }

    RED.nodes.registerType('empirbus-state', Constructor)
}

export = init
