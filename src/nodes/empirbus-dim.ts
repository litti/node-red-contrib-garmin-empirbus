import { DimState } from 'garmin-empirbus-ts'
import type { NodeDef, NodeInitializer } from 'node-red'
import { parseChannelIds, resolveChannelIds } from '../helpers/channelHandling'
import { EmpirbusConfigNode } from '../types/EmpirbusConfigNode'
import { EmpirbusToggleAndSwitchNode } from '../types/EmpirbusToggleAndSwitchNode'
import { getRepository } from '../helpers/getRepository'

interface EmpirbusDimNodeDef extends NodeDef {
    acknowledge: boolean
    channelId?: string
    channelIds?: string
    channelName?: string
    config: string
    name: string
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
                let level = (msg.payload as number) * 10
                if (level < 120 && (msg.payload as number) > 0)
                    level = 120
                const results = ids.map(id => repo.dim(id, level as DimState))
                if (results.filter(result => result.hasFailed).length === 0) {
                    if (this.acknowledge) {
                        msg.acknowledge = true
                        msg.payload = {
                            state: {
                                brightness: msg.payload
                            }
                        }
                    }
                    this.log(`Dimmed channels ${ids.join(',')} ${msg.payload}, returning message ${JSON.stringify(msg)}`)
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

    RED.nodes.registerType('empirbus-dim', EmpirbusDimNodeConstructor)
}

export = nodeInit
