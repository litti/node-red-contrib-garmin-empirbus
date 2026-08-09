import type { NodeDef, NodeInitializer } from 'node-red'
import type { EmpirbusConfigNode } from '../types/EmpirbusConfigNode'
import { bindEmpirbusClientStatus } from '../helpers/bindEmpirbusClientStatus'
import { resolveAcknowledgeMode, sendAcknowledge } from '../helpers/acknowledge'

interface Def extends NodeDef { name: string; config: string; acknowledge?: boolean; acknowledgeMode?: string }
type Telegram = { messagetype: number; messagecmd: number; size: number; data: number[] }
const byte = (v: unknown) => Number.isInteger(v) && Number(v) >= 0 && Number(v) <= 255
const validate = (payload: unknown): Telegram => {
    if (!payload || typeof payload !== 'object' || Array.isArray(payload)) throw new Error('msg.payload must be an object.')
    const p = payload as any
    if (!byte(p.messagetype)) throw new Error('messagetype must be an integer from 0 to 255.')
    if (!byte(p.messagecmd)) throw new Error('messagecmd must be an integer from 0 to 255.')
    if (!Array.isArray(p.data)) throw new Error('data must be an array.')
    if (p.data.length > 255 || !p.data.every(byte)) throw new Error('data must contain at most 255 integer bytes from 0 to 255.')
    const size = p.size === undefined ? p.data.length : p.size
    if (!byte(size)) throw new Error('size must be an integer from 0 to 255.')
    if (size !== p.data.length) throw new Error('size must equal data.length.')
    return { messagetype: p.messagetype, messagecmd: p.messagecmd, size, data: [...p.data] }
}
const init: NodeInitializer = RED => {
    function Constructor(this: any, config: Def) {
        RED.nodes.createNode(this, config)
        const acknowledgeMode = resolveAcknowledgeMode(config.acknowledgeMode, config.acknowledge)
        const configNode = RED.nodes.getNode(config.config) as EmpirbusConfigNode | null
        const unsubscribe = bindEmpirbusClientStatus(this, configNode)
        this.on('close', () => unsubscribe?.())
        this.on('input', async (msg: any, send: any, done: any) => {
            try {
                if (!configNode) throw new Error('No EmpirBus config node configured.')
                const telegram = validate(msg.payload)
                const repo: any = await configNode.getRepository()
                if (typeof repo.sendRawCommand !== 'function') throw new Error('Installed garmin-empirbus-ts does not support raw commands.')
                sendAcknowledge(acknowledgeMode, 'immediate', msg, send)
                repo.sendRawCommand(telegram)
                sendAcknowledge(acknowledgeMode, 'completed', msg, send)
                done?.()
            } catch (error: any) {
                this.status({ fill: 'red', shape: 'dot', text: 'invalid command' })
                this.warn(error.message || String(error))
                done ? done(error) : this.error(error, msg)
            }
        })
    }
    RED.nodes.registerType('empirbus-command', Constructor)
}
export = init
