import type { NodeDef, NodeInitializer } from 'node-red'
import { Channel, EmpirBusChannelRepository, EmpirBusClientState } from 'garmin-empirbus-ts'
import type { EmpirbusConfigNode } from '../types/EmpirbusConfigNode'

type Unsubscribe = () => void

interface EmpirbusStatusNodeDef extends NodeDef {
    name: string
    config: string
    channelIds?: string
    channelId?: string
    channelName?: string
}

type LastValues = Record<number, number | null>

function parseIds(value?: string) {
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

const nodeInit: NodeInitializer = RED => {

    function EmpirbusStatusNodeConstructor(this: any, config: EmpirbusStatusNodeDef) {
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

                if (!isRelevantChannel(channel))
                    return

                const previous = lastValues[channel.id]

                if (previous === undefined) {
                    lastValues[channel.id] = channel.rawValue
                    return
                }

                if (previous === channel.rawValue)
                    return

                lastValues[channel.id] = channel.rawValue
                context.set('lastValues', lastValues)

                this.send({
                    topic: `empirbus/${channel.id}`,
                    payload: {
                        id: channel.id,
                        name: channel.name,
                        rawValue: channel.rawValue,
                        decodedValue: channel.decodedValue,
                        updatedAt: channel.updatedAt
                    }
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

        const isRelevantChannel = (channel: Channel) => {
            if (wantedIds.length > 0)
                return wantedIds.includes(channel.id)

            if (fallbackId !== undefined)
                return channel.id === fallbackId

            if (wantedName)
                return (channel.name || '').toLowerCase() === wantedName

            return true
        }
    }

    RED.nodes.registerType('empirbus-status', EmpirbusStatusNodeConstructor)
}

export = nodeInit
