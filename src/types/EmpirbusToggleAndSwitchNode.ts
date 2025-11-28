import type { Node as NodeRedNode } from 'node-red'
import { EmpirbusConfigNode } from './EmpirbusConfigNode'

export interface EmpirbusToggleAndSwitchNode extends NodeRedNode {
    acknowledge: boolean
    channelId?: number
    channelIds?: string
    channelIndexByName?: Map<string, number>
    channelName?: string
    configNode: EmpirbusConfigNode | null
    selectedChannelIds?: number[]
}
