import type { NodeDef, NodeInitializer } from 'node-red'
import { EmpirBusClientState } from 'garmin-empirbus-ts'
import type { Channel, EmpirBusChannelRepository } from 'garmin-empirbus-ts'
import type { EmpirbusConfigNode } from '../types/EmpirbusConfigNode'
import { deriveAlexaState } from '../helpers/deriveAlexaState'

type Unsubscribe = () => void

interface EmpirbusStateNodeDef extends NodeDef {
    name: string
    config: string
    channelIds?: string
    channelId?: string
    channelName?: string
}

type LastValues = Record<number, number | null>

const parseIds = (value?: string) => {
    if (!value)
        return []

    return Array.from(
        new Set(
            value
                .split(',')
                .map(v => Number(v.trim()))
                .filter(v => Number.isFinite(v))
        )
    )
}

const isRelevantChannel = (wantedIds: number[], fallbackId: number | undefined, wantedName: string | undefined, channel: Channel) => {
    if (wantedIds.length > 0)
        return wantedIds.includes(channel.id)

    if (fallbackId !== undefined)
        return channel.id === fallbackId

    if (wantedName)
        return (channel.name || '').toLowerCase() === wantedName

    return true
}

const hasChanged = (lastValues: LastValues, channel: Channel) => {
    const previous = lastValues[channel.id]

    if (previous === undefined) {
        lastValues[channel.id] = channel.rawValue
        return false
    }

    if (previous === channel.rawValue)
        return false

    lastValues[channel.id] = channel.rawValue
    return true
}

const nodeInit: NodeInitializer = RED => {

    function EmpirbusStateNodeConstructor(this: any, config: EmpirbusStateNodeDef) {
        RED.nodes.createNode(this, config)

        const configNode = RED.nodes.getNode(config.config) as EmpirbusConfigNode | null

        const wantedIds = parseIds(config.channelIds)
        const fallbackId = config.channelId ? Number(config.channelId) : undefined
        const wantedName = config.channelName?.toLowerCase()

        const context = this.context()
        const lastValues: LastValues = context.get('lastValues') || {}
        context.set('lastValues', lastValues)

        let unsubscribeUpdate: Unsubscribe | undefined
        let unsubscribeState: Unsubscribe | undefined
        let isClosed = false

        const setConnected = () =>
            this.status({ fill: 'green', shape: 'dot', text: 'listening' })

        const setDisconnected = () =>
            this.status({ fill: 'red', shape: 'ring', text: 'disconnected' })

        if (!configNode) {
            setDisconnected()
            this.error('No EmpirBus config node configured.')
            return
        }

        configNode.getRepository().then((repo: EmpirBusChannelRepository) => {
            if (isClosed)
                return

            unsubscribeUpdate = repo.onUpdate((channel: Channel) => {
                if (isClosed)
                    return

                if (!isRelevantChannel(wantedIds, fallbackId, wantedName, channel))
                    return

                if (!hasChanged(lastValues, channel))
                    return

                context.set('lastValues', lastValues)

                const state = deriveAlexaState(channel)
                if (!state)
                    return

                const endpointId = String(channel.id)

                this.send({
                    acknowledge: true,
                    endpointId,
                    topic: `empirbus/${endpointId}`,
                    payload: { state }
                })
            })

            unsubscribeState = repo.onState((state: EmpirBusClientState) => {
                if (isClosed)
                    return

                switch (state) {
                    case EmpirBusClientState.Connected:
                        setConnected()
                        break
                    case EmpirBusClientState.Connecting:
                        this.status({ fill: 'yellow', shape: 'ring', text: 'connecting' })
                        break
                    case EmpirBusClientState.Error:
                        this.status({ fill: 'red', shape: 'dot', text: 'error' })
                        break
                    default:
                    case EmpirBusClientState.Closed:
                        setDisconnected()
                        break
                }
            })
        }).catch(error => {
            this.error(error)
            setDisconnected()
        })

        this.on('close', () => {
            isClosed = true

            if (unsubscribeUpdate)
                unsubscribeUpdate()

            if (unsubscribeState)
                unsubscribeState()

            this.status({})
        })
    }

    RED.nodes.registerType('empirbus-state', EmpirbusStateNodeConstructor)
}

export = nodeInit
