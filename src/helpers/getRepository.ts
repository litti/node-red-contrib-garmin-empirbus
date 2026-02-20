import { EmpirBusChannelRepository } from 'garmin-empirbus-ts'
import { EmpirbusToggleAndSwitchNode } from '../types/EmpirbusToggleAndSwitchNode'

export const getRepository = async (node: EmpirbusToggleAndSwitchNode): Promise<EmpirBusChannelRepository | null> => {
    if (!node.configNode)
        return null
    return node.configNode.getRepository()
}
