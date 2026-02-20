import { EmpirBusChannelRepository, EmpirBusClientState } from 'garmin-empirbus-ts'
import { SwitchState } from 'garmin-empirbus-ts/dist/infrastructure/repositories/EmpirBus/EmpirBusChannelRepository'
import type { NodeDef, NodeInitializer } from 'node-red'
import { parseChannelIds, resolveChannelIds } from '../helpers/channelHandling'
import { EmpirbusConfigNode } from '../types/EmpirbusConfigNode'
import { EmpirbusToggleAndSwitchNode } from '../types/EmpirbusToggleAndSwitchNode'

interface EmpirbusSwitchNodeDef extends NodeDef {
    acknowledge: boolean
    channelId?: string
    channelIds?: string
    channelName?: string
    config: string
    name: string
}

const getRepository = async (node: EmpirbusToggleAndSwitchNode): Promise<EmpirBusChannelRepository | null> => {
    if (!node.configNode)
        return null
    return node.configNode.getRepository()
}

const nodeInit: NodeInitializer = RED => {
    function EmpirbusSwitchNodeConstructor(this: EmpirbusToggleAndSwitchNode, config: EmpirbusSwitchNodeDef) {
        RED.nodes.createNode(this, config)
        this.acknowledge = config.acknowledge || false
        this.configNode = RED.nodes.getNode(config.config) as EmpirbusConfigNode | null
        this.channelId = config.channelId ? Number(config.channelId) : undefined
        this.channelName = config.channelName || undefined
        this.channelIds = config.channelIds || ''
        this.channelIds = config.channelIds || ''
        this.selectedChannelIds = parseChannelIds(this.channelIds)

        if (this.configNode) {
            this.configNode.onState((state: EmpirBusClientState) => {
                switch (state) {
                    case EmpirBusClientState.Connected:
                        this.status({ fill: 'green', shape: 'dot', text: `connected` })
                        break
                    case EmpirBusClientState.Error:
                        this.status({ fill: 'red', shape: 'dot', text: `ERROR` })
                        break
                    case EmpirBusClientState.Connecting:
                        this.status({ fill: 'red', shape: 'ring', text: `connecting` })
                        break
                    default:
                    case EmpirBusClientState.Closed:
                        this.status({ fill: 'red', shape: 'ring', text: `disconnected` })
                        break
                }
            })
        }

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
                const promises = ids.map(id => repo.switch(id, msg.payload as SwitchState))
                const results = await Promise.all(promises)
                if (results.filter(result => result.hasFailed).length === 0) {
                    if (this.acknowledge) {
                        msg.acknowledge = true
                        msg.payload = {
                            state: {
                                power: msg.payload
                            }
                        }
                    }
                    this.log(`Switched channels ${ids.join(',')} ${msg.payload}, returning message ${JSON.stringify(msg)}`)
                }
                else {
                    results.filter(result => result.hasFailed).forEach(result => {
                        this.error(result.errors.join(', '), msg)
                    })
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
