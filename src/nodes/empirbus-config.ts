import { Channel, EmpirBusChannelRepository, EmpirBusClientState } from 'garmin-empirbus-ts'
import { NodeDef, NodeInitializer } from 'node-red'
import { clearTimeout } from 'node:timers'
import * as util from 'node:util'
import { EmpirbusConfigNode, OnStateFn } from '../types/EmpirbusConfigNode'

type Unsubscribe = () => void

interface EmpirbusConfigNodeDef extends NodeDef {
    name: string
    url: string
}

type NodeWithUnsubscribers = EmpirbusConfigNode & {
    repoUnsubscribers?: Unsubscribe[]
}

const nodeInit: NodeInitializer = RED => {
    function scheduleReconnect(node: EmpirbusConfigNode) {
        const context = node.context()
        if (context.get('isClosing'))
            return

        if (node.timeout)
            return

        node.timeout = setTimeout(() => {
            if (node.timeout)
                clearTimeout(node.timeout)
            node.timeout = null
            node.repository = connect(node)
        }, 1000)
    }

    function cleanupRepoSubscriptions(node: EmpirbusConfigNode) {
        const n = node as NodeWithUnsubscribers
        const unsubs = n.repoUnsubscribers || []
        unsubs.forEach(unsub => unsub())
        n.repoUnsubscribers = []
    }

    function disconnect(node: EmpirbusConfigNode) {
        cleanupRepoSubscriptions(node)

        const repo = node.repository as unknown as EmpirBusChannelRepository | null
        if (!repo || typeof repo.disconnect !== 'function')
            return

        repo.disconnect()
    }

    function connect(node: EmpirbusConfigNode) {
        disconnect(node)

        const repo = new EmpirBusChannelRepository(node.url)
        node.repository = repo

        const n = node as NodeWithUnsubscribers
        n.repoUnsubscribers = []

        node.log(`Connecting to EmpirBus at ${node.url}`)

        const unsubscribeLog = repo.onLog(line => {
            if (node.repository !== repo)
                return

            if (typeof line === 'string') {
                node.log(line)
                return
            }

            const anyLine = line as any
            if (typeof anyLine?.toString === 'function') {
                node.log(anyLine.toString())
                return
            }

            node.log(util.inspect(line, { depth: null, breakLength: 120 }))
        })

        const unsubscribeState = repo.onState(state => {
            if (node.repository !== repo)
                return

            node.onStateFns.forEach(fn => fn(state))

            if (state === EmpirBusClientState.Connected && node.timeout) {
                clearTimeout(node.timeout)
                node.timeout = null
            }

            if (state === EmpirBusClientState.Error) {
                node.error(`ERROR connecting to EmpirBus at ${node.url}`)
                scheduleReconnect(node)
                return
            }

            if (state === EmpirBusClientState.Closed) {
                node.log(`Connection to EmpirBus at ${node.url} closed. Trying to reconnect in 1 second.`)
                scheduleReconnect(node)
            }
        })

        n.repoUnsubscribers.push(unsubscribeLog, unsubscribeState)

        repo
            .connect()
            .then(() => node.log(`Connected to EmpirBus at ${node.url}`))
            .catch(error => {
                node.error(error)
                scheduleReconnect(node)
            })

        return repo
    }

    function addStateListener(node: EmpirbusConfigNode, fn: OnStateFn): Unsubscribe {
        node.onStateFns.push(fn)

        let isActive = true

        return () => {
            if (!isActive)
                return

            isActive = false
            node.onStateFns = node.onStateFns.filter(x => x !== fn)
        }
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

            if (this.timeout)
                clearTimeout(this.timeout)
            this.timeout = null

            disconnect(this)
        })

        this.onState = (fn: OnStateFn) => addStateListener(this, fn)
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
