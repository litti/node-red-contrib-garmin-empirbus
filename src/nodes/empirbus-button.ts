import type { NodeDef, NodeInitializer } from 'node-red'
import { setTimeout as sleep } from 'node:timers/promises'
import { bindEmpirbusClientStatus } from '../helpers/bindEmpirbusClientStatus'
import { parseChannelIds, resolveChannelIds } from '../helpers/channelHandling'
import { getRepository } from '../helpers/getRepository'
import { EmpirbusConfigNode } from '../types/EmpirbusConfigNode'
import { EmpirbusToggleAndSwitchNode } from '../types/EmpirbusToggleAndSwitchNode'
import { getResultError } from '../helpers/resultHandling'

type Mode = 'short' | 'long' | 'direct'
type Execution = 'sequential' | 'parallel'
interface Def extends NodeDef { acknowledge: boolean; channelId?: string; channelIds?: string; channelName?: string; config: string; name: string; mode?: Mode; durationMs?: string|number; execution?: Execution; channelDelayMs?: string|number }
const direct = (payload: unknown): boolean | undefined => {
    const value = typeof payload === 'object' && payload !== null && 'action' in payload ? (payload as any).action : payload
    if (typeof value === 'boolean') return value
    if (typeof value === 'number') return value === 1 ? true : value === 0 ? false : undefined
    if (typeof value !== 'string') return undefined
    const v = value.trim().toLowerCase()
    if (['press','on','true','1'].includes(v)) return true
    if (['release','off','false','0'].includes(v)) return false
    return undefined
}
const bounded = (value: unknown, min: number, max: number, fallback: number) => {
    const n = Number(value)
    return Number.isFinite(n) && n >= min && n <= max ? Math.round(n) : fallback
}
const init: NodeInitializer = RED => {
    function Constructor(this: EmpirbusToggleAndSwitchNode & { busy?: boolean }, config: Def) {
        RED.nodes.createNode(this, config)
        this.acknowledge = !!config.acknowledge
        this.configNode = RED.nodes.getNode(config.config) as EmpirbusConfigNode | null
        this.channelId = config.channelId && Number.isFinite(Number(config.channelId)) ? Number(config.channelId) : undefined
        this.channelName = config.channelName || undefined
        this.channelIds = config.channelIds || ''
        this.selectedChannelIds = parseChannelIds(this.channelIds)
        const mode: Mode = ['long','direct'].includes(config.mode || '') ? config.mode as Mode : 'short'
        const duration = bounded(config.durationMs, 10, 60000, mode === 'short' ? 150 : 1000)
        const delay = bounded(config.channelDelayMs, 0, 1000, 5)
        const execution: Execution = config.execution === 'parallel' ? 'parallel' : 'sequential'
        const unsubscribe = bindEmpirbusClientStatus(this, this.configNode)
        this.on('close', () => unsubscribe?.())
        const run = async (repo: any, ids: number[], pressed: boolean) => {
            const results = await Promise.all(ids.map(id => pressed ? repo.press(id) : repo.release(id)))
            const error = results.map(getResultError).find(Boolean)
            if (error) throw new Error(error)
        }
        this.on('input', async (msg: any, send: any, done: any) => {
            try {
                const repo: any = await getRepository(this)
                if (!repo) throw new Error('No EmpirBus config node configured.')
                const ids = await resolveChannelIds(this, msg, repo)
                if (!ids.length) throw new Error('No matching channel found.')
                if (mode === 'direct') {
                    const pressed = direct(msg.payload)
                    if (pressed === undefined) throw new Error(`Invalid direct button payload: ${JSON.stringify(msg.payload)}`)
                    await run(repo, ids, pressed)
                } else {
                    if (this.busy) { this.warn('Button is busy; trigger ignored.'); done?.(); return }
                    this.busy = true
                    this.status({ fill: 'yellow', shape: 'dot', text: 'busy' })
                    try {
                        if (execution === 'parallel') {
                            await run(repo, ids, true); await sleep(duration); await run(repo, ids, false)
                        } else {
                            for (let i=0;i<ids.length;i++) {
                                await run(repo, [ids[i]], true); await sleep(duration); await run(repo, [ids[i]], false)
                                if (i < ids.length-1 && delay) await sleep(delay)
                            }
                        }
                    } finally { this.busy = false; this.status({ fill: 'green', shape: 'dot', text: 'connected' }) }
                }
                if (this.acknowledge) { msg.acknowledge = true; send(msg) }
                done?.()
            } catch (error) { this.busy = false; done ? done(error) : this.error(error, msg) }
        })
    }
    RED.nodes.registerType('empirbus-button', Constructor)
}
export = init
