import type { NodeDef, NodeInitializer } from 'node-red'
import { bindEmpirbusClientStatus } from '../helpers/bindEmpirbusClientStatus'
import { parseChannelIds, resolveChannelIds } from '../helpers/channelHandling'
import { resolvePower } from '../helpers/inputPayload'
import { getRepository } from '../helpers/getRepository'
import { EmpirbusConfigNode } from '../types/EmpirbusConfigNode'
import { EmpirbusToggleAndSwitchNode } from '../types/EmpirbusToggleAndSwitchNode'
import { getResultError } from '../helpers/resultHandling'

interface Def extends NodeDef { acknowledge: boolean; channelId?: string; channelIds?: string; channelName?: string; config: string; name: string }
const init: NodeInitializer = RED => {
    function Constructor(this: EmpirbusToggleAndSwitchNode, config: Def) {
        RED.nodes.createNode(this, config)
        this.acknowledge = !!config.acknowledge
        this.configNode = RED.nodes.getNode(config.config) as EmpirbusConfigNode | null
        this.channelId = config.channelId && Number.isFinite(Number(config.channelId)) ? Number(config.channelId) : undefined
        this.channelName = config.channelName || undefined
        this.channelIds = config.channelIds || ''
        this.selectedChannelIds = parseChannelIds(this.channelIds)
        const unsubscribe = bindEmpirbusClientStatus(this, this.configNode)
        this.on('close', () => unsubscribe?.())
        this.on('input', async (msg: any, send: any, done: any) => {
            try {
                const repo = await getRepository(this)
                if (!repo) throw new Error('No EmpirBus config node configured.')
                const ids = await resolveChannelIds(this, msg, repo)
                if (!ids.length) throw new Error('No matching channel found.')
                const power = resolvePower(msg.payload)
                if (power === undefined) throw new Error(`Invalid switch payload: ${JSON.stringify(msg.payload)}`)
                const result = await repo.switchMany(ids, power)
                const error = getResultError(result)
                if (error)
                    throw new Error(error)
                if (this.acknowledge) {
                    msg.acknowledge = true
                    msg.payload = { state: { power } }
                    send(msg)
                }
                done?.()
            } catch (error) { done ? done(error) : this.error(error, msg) }
        })
    }
    RED.nodes.registerType('empirbus-switch', Constructor)
}
export = init
