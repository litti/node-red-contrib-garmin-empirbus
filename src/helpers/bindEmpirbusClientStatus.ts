import { EmpirBusClientState } from 'garmin-empirbus-ts'
import { EmpirbusConfigNode } from '../types/EmpirbusConfigNode'
import { EmpirbusToggleAndSwitchNode } from '../types/EmpirbusToggleAndSwitchNode'

type Unsubscribe = () => void

type NodeStatus = {
    fill: 'green' | 'red'
    shape: 'dot' | 'ring'
    text: string
}

const toNodeStatus = (state: EmpirBusClientState): NodeStatus => {
    if (state === EmpirBusClientState.Connected)
        return { fill: 'green', shape: 'dot', text: 'connected' }

    if (state === EmpirBusClientState.Error)
        return { fill: 'red', shape: 'dot', text: 'ERROR' }

    if (state === EmpirBusClientState.Connecting)
        return { fill: 'red', shape: 'ring', text: 'connecting' }

    return { fill: 'red', shape: 'ring', text: 'disconnected' }
}

export const bindEmpirbusClientStatus = (node: EmpirbusToggleAndSwitchNode,  configNode: EmpirbusConfigNode | null): Unsubscribe | undefined => {
    if (!configNode) {
        node.status({ fill: 'red', shape: 'ring', text: 'unconfigured' })
        return undefined
    }

    return configNode.onState(state => {
        node.status(toNodeStatus(state))
    })
}
