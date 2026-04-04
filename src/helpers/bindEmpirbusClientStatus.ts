import { EmpirBusClientState } from 'garmin-empirbus-ts'
import { EmpirbusConfigNode } from '../types/EmpirbusConfigNode'
import { EmpirbusToggleAndSwitchNode } from '../types/EmpirbusToggleAndSwitchNode'

type Unsubscribe = () => void

type Options = {
    connectedText?: string
}

const getConnectedText = (options?: Options) =>
    options?.connectedText ?? 'connected'

export const bindEmpirbusClientStatus = (node: EmpirbusToggleAndSwitchNode, configNode: EmpirbusConfigNode | null, options?: Options): Unsubscribe | undefined => {
    if (!configNode) {
        node.status({ fill: 'red', shape: 'ring', text: 'UNCONFIGURED' })
        return undefined
    }

    return configNode.onState(state => {
        switch (state) {
            case EmpirBusClientState.Connected:
                node.status({ fill: 'green', shape: 'dot', text: getConnectedText(options) })
                break
            case EmpirBusClientState.Error:
                node.status({ fill: 'red', shape: 'dot', text: 'ERROR' })
                break
            case EmpirBusClientState.Connecting:
                node.status({ fill: 'red', shape: 'ring', text: 'connecting' })
                break
            default:
            case EmpirBusClientState.Closed:
                node.status({ fill: 'red', shape: 'ring', text: 'disconnected' })
                break
        }
    })
}
