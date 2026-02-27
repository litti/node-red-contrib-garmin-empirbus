import { EmpirBusChannelRepository, EmpirBusClientState, Unsubscribe } from 'garmin-empirbus-ts'
import { Node as NodeRed } from 'node-red'

export interface EmpirbusConfigNode extends NodeRed {
    name: string
    url: string
    repository: EmpirBusChannelRepository | null
    getRepository: () => Promise<EmpirBusChannelRepository>
    onState: (fn: OnStateFn) => Unsubscribe
    onStateFns: Array<OnStateFn>
    timeout: NodeJS.Timeout | null
}

export type OnStateFn = (state: EmpirBusClientState) => void
