import type { NodeDef, NodeInitializer } from 'node-red'
import type { EmpirbusConfigNode } from '../types/EmpirbusConfigNode'
import { bindEmpirbusClientStatus } from '../helpers/bindEmpirbusClientStatus'

interface Def extends NodeDef { name: string; config: string; acknowledge: boolean }
type Operation = 'switch' | 'press' | 'release' | 'pulse' | 'dim' | 'toggle'

const init: NodeInitializer = RED => {
    function Constructor(this: any, config: Def) {
        RED.nodes.createNode(this, config)
        const configNode = RED.nodes.getNode(config.config) as EmpirbusConfigNode | null
        const unsubscribe = bindEmpirbusClientStatus(this, configNode)
        this.on('close', () => unsubscribe?.())
        this.on('input', async (msg: any, _send: any, done: any) => {
            try {
                if (!configNode) throw new Error('No EmpirBus config node configured.')
                const repo: any = await configNode.getRepository()
                const input = msg.payload?.operation ? msg.payload : msg
                const operation = input.operation as Operation
                const endpointId = Number(input.endpointId)
                if (!Number.isFinite(endpointId)) throw new Error('endpointId is required.')
                let result: any
                switch (operation) {
                    case 'switch': result = await repo.switch(endpointId, input.value); break
                    case 'press': result = await repo.press(endpointId); break
                    case 'release': result = await repo.release(endpointId); break
                    case 'pulse': result = await repo.pressFor(endpointId, Number(input.durationMs ?? 150)); break
                    case 'dim': result = repo.dim(endpointId, Math.max(0, Math.min(1000, Math.round(Number(input.value) * 10)))); break
                    case 'toggle': result = await repo.toggle(endpointId); break
                    default: throw new Error(`Unsupported operation: ${operation}`)
                }
                if (result?.hasFailed) throw new Error((result.errors || []).join(', '))
                if (config.acknowledge) msg.acknowledge = true
                msg.payload = { ...input, success: true }
                this.send(msg)
                done?.()
            } catch (error) { done ? done(error) : this.error(error, msg) }
        })
    }
    RED.nodes.registerType('empirbus-command', Constructor)
}
export = init
