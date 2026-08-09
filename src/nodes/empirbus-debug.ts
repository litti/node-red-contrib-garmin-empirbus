import type { NodeDef, NodeInitializer } from 'node-red'
import type { EmpirBusCommunicationEvent, EmpirBusMessage } from 'garmin-empirbus-ts'
import { MessageType } from 'garmin-empirbus-ts'
import type { EmpirbusConfigNode } from '../types/EmpirbusConfigNode'
import { bindEmpirbusClientStatus } from '../helpers/bindEmpirbusClientStatus'

type Direction = 'both' | 'rx' | 'tx'
type Scope = 'all' | 'selected'
type Category = 'control' | 'status' | 'heartbeat' | 'system'

interface Def extends NodeDef {
    name: string
    config: string
    direction: Direction
    scope: Scope
    channelIds?: string
    controlCommands: boolean
    statusMessages: boolean
    systemTraffic: boolean
    heartbeat: boolean
}

const parseIds = (value?: string) => new Set((value || '').split(',').map(value => Number(value.trim())).filter(Number.isFinite))

const getCategory = (message: EmpirBusMessage): Category => {
    if (message.messagetype === MessageType.acknowledgement && message.messagecmd === 0 && message.size === 1 && message.data[0] === 0)
        return 'heartbeat'
    if (message.messagetype === MessageType.mfdControl)
        return 'control'
    if (message.messagetype === MessageType.mfdStatus)
        return 'status'
    return 'system'
}

const getChannelId = (message: EmpirBusMessage, category: Category): number | undefined => {
    if (category !== 'control' && category !== 'status')
        return undefined
    if (message.data.length < 2)
        return undefined
    return message.data[0] | (message.data[1] << 8)
}

const getCommand = (message: EmpirBusMessage, category: Category): string => {
    if (category === 'heartbeat')
        return 'heartbeat'
    if (category === 'status')
        return 'status'
    if (category !== 'control')
        return 'system'

    switch (message.messagecmd) {
        case 0: return 'switch'
        case 1: return 'button'
        case 3: return 'dimmer'
        default: return 'unknown'
    }
}

const init: NodeInitializer = RED => {
    function Constructor(this: any, config: Def) {
        RED.nodes.createNode(this, config)
        const configNode = RED.nodes.getNode(config.config) as EmpirbusConfigNode | null
        const selectedIds = parseIds(config.channelIds)
        let unsubscribeCommunication: (() => void) | undefined
        let closed = false

        const unsubscribeStatus = bindEmpirbusClientStatus(this, configNode, { connectedText: 'listening' })
        if (!configNode) {
            this.error('No EmpirBus config node configured.')
            return
        }

        const categoryEnabled = (category: Category) => {
            if (category === 'control') return config.controlCommands
            if (category === 'status') return config.statusMessages
            if (category === 'heartbeat') return config.heartbeat
            return config.systemTraffic
        }

        const matches = (event: EmpirBusCommunicationEvent, category: Category, channelId?: number) => {
            if (config.direction !== 'both' && config.direction !== event.direction)
                return false
            if (!categoryEnabled(category))
                return false
            if (config.scope === 'selected' && channelId !== undefined && !selectedIds.has(channelId))
                return false
            if (config.scope === 'selected' && channelId === undefined)
                return category === 'heartbeat' ? config.heartbeat : config.systemTraffic
            return true
        }

        configNode.getRepository().then(repo => {
            if (closed)
                return

            unsubscribeCommunication = repo.onCommunication(event => {
                if (closed)
                    return

                const category = getCategory(event.message)
                const channelId = getChannelId(event.message, category)
                if (!matches(event, category, channelId))
                    return

                const target = channelId === undefined ? 'system' : String(channelId)
                this.send({
                    topic: `empirbus/debug/${event.direction}/${target}`,
                    payload: {
                        direction: event.direction,
                        channelId,
                        category,
                        command: getCommand(event.message, category),
                        timestamp: event.timestamp,
                        message: event.message
                    }
                })
            })
        }).catch(error => this.error(error))

        this.on('close', () => {
            closed = true
            unsubscribeCommunication?.()
            unsubscribeStatus?.()
            this.status({})
        })
    }

    RED.nodes.registerType('empirbus-debug', Constructor)
}

export = init
