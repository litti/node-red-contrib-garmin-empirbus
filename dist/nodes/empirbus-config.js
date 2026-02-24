"use strict";
var __createBinding = (this && this.__createBinding) || (Object.create ? (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    var desc = Object.getOwnPropertyDescriptor(m, k);
    if (!desc || ("get" in desc ? !m.__esModule : desc.writable || desc.configurable)) {
      desc = { enumerable: true, get: function() { return m[k]; } };
    }
    Object.defineProperty(o, k2, desc);
}) : (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    o[k2] = m[k];
}));
var __setModuleDefault = (this && this.__setModuleDefault) || (Object.create ? (function(o, v) {
    Object.defineProperty(o, "default", { enumerable: true, value: v });
}) : function(o, v) {
    o["default"] = v;
});
var __importStar = (this && this.__importStar) || (function () {
    var ownKeys = function(o) {
        ownKeys = Object.getOwnPropertyNames || function (o) {
            var ar = [];
            for (var k in o) if (Object.prototype.hasOwnProperty.call(o, k)) ar[ar.length] = k;
            return ar;
        };
        return ownKeys(o);
    };
    return function (mod) {
        if (mod && mod.__esModule) return mod;
        var result = {};
        if (mod != null) for (var k = ownKeys(mod), i = 0; i < k.length; i++) if (k[i] !== "default") __createBinding(result, mod, k[i]);
        __setModuleDefault(result, mod);
        return result;
    };
})();
const garmin_empirbus_ts_1 = require("garmin-empirbus-ts");
const node_timers_1 = require("node:timers");
const util = __importStar(require("node:util"));
const nodeInit = RED => {
    function scheduleReconnect(node) {
        if (node.timeout) {
            node.log(`node.timeout not null, return`);
            return;
        }
        node.timeout = setTimeout(() => {
            if (node.timeout)
                (0, node_timers_1.clearTimeout)(node.timeout);
            node.timeout = null;
            node.repository = connect(node);
        }, 1000);
    }
    function disconnect(node) {
        const repo = node.repository;
        if (!repo || typeof repo.disconnect !== 'function')
            return;
        repo.disconnect();
    }
    function connect(node) {
        disconnect(node);
        const repo = new garmin_empirbus_ts_1.EmpirBusChannelRepository(node.url);
        node.repository = repo;
        node.log(`Connecting to EmpirBus at ${node.url}`);
        repo.onLog(line => {
            if (node.repository !== repo)
                return;
            if (typeof line === 'string') {
                node.log(line);
                return;
            }
            const anyLine = line;
            if (typeof anyLine.toString === 'function') {
                node.log(anyLine.toString());
                return;
            }
            node.log(util.inspect(line, { depth: null, breakLength: 120 }));
        });
        repo.onState(state => {
            if (node.repository !== repo)
                return;
            node.onStateFns.forEach(fn => fn(state));
            if (state === garmin_empirbus_ts_1.EmpirBusClientState.Connected && node.timeout) {
                (0, node_timers_1.clearTimeout)(node.timeout);
                node.timeout = null;
            }
            if (state === garmin_empirbus_ts_1.EmpirBusClientState.Error) {
                node.error(`ERROR connecting to EmpirBus at ${node.url}`);
                scheduleReconnect(node);
                return;
            }
            if (state === garmin_empirbus_ts_1.EmpirBusClientState.Closed) {
                node.log(`Connection to EmpirBus at ${node.url} closed. Trying to reconnect in 1 second.`);
                scheduleReconnect(node);
            }
        });
        repo
            .connect()
            .then(() => node.log(`Connected to EmpirBus at ${node.url}`))
            .catch(error => {
            node.error(error);
            scheduleReconnect(node);
        });
        return repo;
    }
    function EmpirbusConfigNodeConstructor(config) {
        RED.nodes.createNode(this, config);
        this.name = config.name;
        this.url = config.url;
        this.repository = null;
        this.onStateFns = [];
        this.timeout = null;
        const context = this.context();
        context.set('isClosing', false);
        context.set('reconnectTimeout', null);
        this.repository = connect(this);
        this.getRepository = async () => {
            if (this.repository)
                return this.repository;
            this.repository = connect(this);
            return this.repository;
        };
        this.on('close', () => {
            const ctx = this.context();
            ctx.set('isClosing', true);
            const timeout = ctx.get('reconnectTimeout');
            if (timeout)
                (0, node_timers_1.clearTimeout)(timeout);
            ctx.set('reconnectTimeout', null);
            const repo = this.repository;
            if (repo && typeof repo.close === 'function')
                repo.close();
        });
        this.onState = (fn) => {
            this.onStateFns.push(fn);
        };
    }
    RED.nodes.registerType('empirbus-config', EmpirbusConfigNodeConstructor);
    RED.httpAdmin.get('/empirbus/:id/channels', async (req, res) => {
        const configNode = RED.nodes.getNode(req.params.id);
        if (!configNode) {
            res.status(404).json({ error: 'config not found' });
            return;
        }
        const repo = await configNode.getRepository();
        repo
            .getChannelList()
            .then((channels) => {
            res.json(channels);
        })
            .catch(error => {
            res.status(500).json({ error: String(error) });
        });
    });
};
module.exports = nodeInit;
//# sourceMappingURL=empirbus-config.js.map