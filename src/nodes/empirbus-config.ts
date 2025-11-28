import { Channel, EmpirBusChannelRepository } from 'garmin-empirbus-ts'
import { NodeDef, NodeInitializer } from 'node-red'
import { EmpirbusConfigNode } from '../types/EmpirbusConfigNode'

interface EmpirbusConfigNodeDef extends NodeDef {
    name: string
    url: string
}

const nodeInit: NodeInitializer = RED => {
    function EmpirbusConfigNodeConstructor(this: EmpirbusConfigNode, config: EmpirbusConfigNodeDef) {
        RED.nodes.createNode(this, config)
        this.name = config.name
        this.url = config.url
        this.repository = null

        this.getRepository = async () => {
            if (this.repository)
                return this.repository
            const repo = new EmpirBusChannelRepository(this.url)
            this.log(`Connecting to EmpirBus at ${this.url}`)
            repo.connect()
                .then(() => this.log(`Connected to EmpirBus at ${this.url}`))
                .catch(error => this.error(error))
            this.repository = repo
            return this.repository
        }
    }

    RED.nodes.registerType('empirbus-config', EmpirbusConfigNodeConstructor as any)

    RED.httpAdmin.get('/empirbus/:id/channels', async (req, res) => {
        const configNode = RED.nodes.getNode(req.params.id) as EmpirbusConfigNode | null
        if (!configNode) {
            res.status(404).json({ error: 'config not found' })
            return
        }

        const repo = await configNode.getRepository()
        repo
            .getChannelList()
            .then((channels: Channel[]) => {
                res.json(channels)
            })
            .catch(error => {
                res.status(500).json({ error: String(error) })
            })
    })
}

export = nodeInit
