import { EmpirBusChannelRepository } from 'garmin-empirbus-ts'
import { Node as NodeRed } from 'node-red'

export interface EmpirbusConfigNode extends NodeRed {
    name: string
    url: string
    repository: EmpirBusChannelRepository | null
    getRepository: () => Promise<EmpirBusChannelRepository>
}
