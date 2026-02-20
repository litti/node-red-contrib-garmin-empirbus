import { EmpirBusChannelRepository } from 'garmin-empirbus-ts'
import { SwitchState } from 'garmin-empirbus-ts/dist/infrastructure/repositories/EmpirBus/EmpirBusChannelRepository'
import type { Node as NodeRedNode, NodeDef, NodeInitializer } from 'node-red'
import { parseChannelIds, resolveChannelIds } from '../helpers/channelHandling'
import { EmpirbusConfigNode } from '../types/EmpirbusConfigNode'
import { EmpirbusToggleAndSwitchNode } from '../types/EmpirbusToggleAndSwitchNode'

interface EmpirbusToggleNodeDef extends NodeDef {
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
    function EmpirbusToggleNodeConstructor(this: EmpirbusToggleAndSwitchNode, config: EmpirbusToggleNodeDef) {
        RED.nodes.createNode(this, config)
        this.acknowledge = config.acknowledge || false
        this.configNode = RED.nodes.getNode(config.config) as EmpirbusConfigNode | null
        this.channelId = config.channelId ? Number(config.channelId) : undefined
        this.channelName = config.channelName || undefined
        this.channelIds = config.channelIds || ''
        this.channelIds = config.channelIds || ''
        this.selectedChannelIds = parseChannelIds(this.channelIds)

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
                const promises = ids.map(id => repo.toggle(id))
                await Promise.all(promises)
                if (this.acknowledge)
                    msg.acknowledge = true
                this.log(`Toggled channels ${ids.join(',')}, returning message ${JSON.stringify(msg)}`)
                this.send(msg)
            }
            catch (error) {
                this.error(error as Error, msg)
            }
        })
    }

    RED.nodes.registerType('empirbus-toggle', EmpirbusToggleNodeConstructor)
}

export = nodeInit
