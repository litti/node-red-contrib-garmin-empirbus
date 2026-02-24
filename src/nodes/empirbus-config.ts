import { Channel, EmpirBusChannelRepository, EmpirBusClientState } from 'garmin-empirbus-ts'
import { NodeDef, NodeInitializer } from 'node-red'
import { EmpirbusConfigNode, OnStateFn } from '../types/EmpirbusConfigNode'

interface EmpirbusConfigNodeDef extends NodeDef {
    name: string
    url: string
}

const nodeInit: NodeInitializer = RED => {
    function scheduleReconnect(node: EmpirbusConfigNode) {
        if (node.timeout) {
            node.log(`node.timeout not null, return`)
            return
        }
        node.timeout = setTimeout(() => {
            if (node.timeout)
                clearTimeout(node.timeout)
            node.timeout = null
            node.repository = connect(node)
        }, 1000)
    }

    function disconnect(node: EmpirbusConfigNode) {
        const repo = node.repository as unknown as EmpirBusChannelRepository | null
        if (!repo || typeof repo.disconnect !== 'function')
            return
        repo.disconnect()
    }

    function connect(node: EmpirbusConfigNode) {

        disconnect(node)

        const repo = new EmpirBusChannelRepository(node.url)
        node.repository = repo

        node.log(`Connecting to EmpirBus at ${node.url}`)

        repo.onLog(line => {
            const text = typeof line === 'string' ? line : JSON.stringify(line)
            node.log(text)
        })

        repo.onState(state => {
            if (node.timeout) {
                clearTimeout(node.timeout)
                node.timeout = null
            }
            node.onStateFns.forEach(fn => fn(state))
            switch (state) {
                case EmpirBusClientState.Error:
                    node.error(`ERROR connecting to EmpirBus at ${node.url}`)
                    scheduleReconnect(node)
                    break
                case EmpirBusClientState.Closed:
                    node.log(`Connection to EmpirBus at ${node.url} closed. Trying to reconnect in 1 second.`)
                    scheduleReconnect(node)
                    break
                default:
                    node.log(`EmpirBus client at ${node.url} gave us the message ${state}, but no handler for this message is defined in the config node.`)
                    break
            }
        })

        repo
            .connect()
            .then(() => node.log(`Connected to EmpirBus at ${node.url}`))
            .catch(error => {
                node.error(error)
                scheduleReconnect(node)
            })

        return repo
    }

    function EmpirbusConfigNodeConstructor(this: EmpirbusConfigNode, config: EmpirbusConfigNodeDef) {
        RED.nodes.createNode(this, config)
        this.name = config.name
        this.url = config.url
        this.repository = null
        this.onStateFns = []
        this.timeout = null

        const context = this.context()
        context.set('isClosing', false)
        context.set('reconnectTimeout', null)

        this.repository = connect(this)

        this.getRepository = async () => {
            if (this.repository)
                return this.repository

            this.repository = connect(this)
            return this.repository
        }

        this.on('close', () => {
            const ctx = this.context()
            ctx.set('isClosing', true)

            const timeout = ctx.get('reconnectTimeout') as NodeJS.Timeout | null
            if (timeout)
                clearTimeout(timeout)

            ctx.set('reconnectTimeout', null)

            const repo = this.repository as unknown as { close?: () => void } | null
            if (repo && typeof repo.close === 'function')
                repo.close()
        })

        this.onState = (fn: OnStateFn) => {
            this.onStateFns.push(fn)
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
