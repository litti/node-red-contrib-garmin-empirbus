import type { NodeDef, NodeInitializer } from 'node-red'
import { bindEmpirbusClientStatus } from '../helpers/bindEmpirbusClientStatus'
import { parseChannelIds, resolveChannelIds } from '../helpers/channelHandling'
import { getRepository } from '../helpers/getRepository'
import { EmpirbusConfigNode } from '../types/EmpirbusConfigNode'
import { EmpirbusToggleAndSwitchNode } from '../types/EmpirbusToggleAndSwitchNode'
import { getResultError } from '../helpers/resultHandling'
import { resolveAcknowledgeMode, sendAcknowledge } from '../helpers/acknowledge'

interface Def extends NodeDef { acknowledge?: boolean; acknowledgeMode?: string; channelId?: string; channelIds?: string; channelName?: string; config: string; name: string }
const init: NodeInitializer = RED => {
    function Constructor(this: EmpirbusToggleAndSwitchNode, config: Def) {
        RED.nodes.createNode(this, config)
        this.configNode = RED.nodes.getNode(config.config) as EmpirbusConfigNode | null
        this.channelId = config.channelId && Number.isFinite(Number(config.channelId)) ? Number(config.channelId) : undefined
        this.channelName = config.channelName || undefined
        this.channelIds = config.channelIds || ''
        this.selectedChannelIds = parseChannelIds(this.channelIds)
        const acknowledgeMode = resolveAcknowledgeMode(config.acknowledgeMode, config.acknowledge)
        const unsubscribe = bindEmpirbusClientStatus(this, this.configNode)
        this.on('close', () => unsubscribe?.())
        this.on('input', async (msg: any, send: any, done: any) => {
            try {
                const repo: any = await getRepository(this)
                if (!repo)
                    throw new Error('No EmpirBus config node configured.')
                const ids = await resolveChannelIds(this, msg, repo)
                if (!ids.length)
                    throw new Error('No matching channel found.')
                const result = typeof repo.toggleMany === 'function'
                    ? await repo.toggleMany(ids, { onStart: () => sendAcknowledge(acknowledgeMode, 'immediate', msg, send) })
                    : await Promise.all(ids.map((id: number) => repo.toggle(id))).then((results: any[]) => results.find(result => result.hasFailed) || results[0])
                const error = getResultError(result)
                if (error)
                    throw new Error(error)
                sendAcknowledge(acknowledgeMode, 'completed', msg, send)
                done?.()
            } catch (error) { done ? done(error) : this.error(error, msg) }
        })
    }
    RED.nodes.registerType('empirbus-toggle', Constructor)
}
export = init
