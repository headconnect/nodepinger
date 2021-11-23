
import * as fs from 'fs'
import * as promclient from 'prom-client'
import * as async from 'async'

import * as http from 'http'


import *  as net from 'net'
const cron = require('node-cron')
const { Resolver } = require('dns').promises;
const resolver = new Resolver();
//resolver.setServers(["1.1.1.1"])



const sourceRegion = process.env.SOURCE_REGION || "local"
const pingFrequency = Number(process.env.PING_FREQUNCY_SECONDS) > 0 ? Number(process.env.PING_FREQUNCY_SECONDS) : 5;
const pingParallel = Number(process.env.PING_PARALLELISM) > 0 ? Number(process.env.PING_PARALLELISM) : 5;
const pingTimeout = Number(process.env.PING_TIMEOUT_MILLISECONDS) > 0 ? Number(process.env.PING_TIMEOUT_MILLISECONDS) : 2500;

const collectDefaultMetrics = promclient.collectDefaultMetrics;
collectDefaultMetrics({ labels: {
    source: sourceRegion,
    app: 'nodeping'
}})

const prom_rtt = new promclient.Gauge({
    name: 'nodepinger_rtt_milliseconds',
    help: 'RTT in milliseconds (tcp ping)',
    labelNames: ["customer", "deployment", "mode", "region", "source", "lookuptype"]    
})

interface Targets {
    Customer?: string;
    Deployment?: string;
    Mode?: string;
    Region?: string;
    URL?: string;
    hostname?: string;
    ip?: string;
    port?: number;
}

const hostMatcher = /(^http\w?):\/\/([0-9a-zA-Z\.\-]*)\/?/

let targets : Targets[] = JSON.parse(fs.readFileSync('./destination/targets.json').toString())
const loadTargets = async () => {
    console.info("Updating targets list:")
    let tempTargets = JSON.parse(fs.readFileSync('./destination/targets.json').toString())        
    let outputTargets = []
    for (let target of tempTargets) {
        let hostMatch = hostMatcher.exec(target.URL)
        target.port = hostMatch[1] === 'https' ? 443 : 80;
        target.hostname = hostMatch[2]
        if (/^(?:(?:25[0-5]|2[0-4][0-9]|[01]?[0-9][0-9]?)\.){3}(?:25[0-5]|2[0-4][0-9]|[01]?[0-9][0-9]?)$/.test(target.hostname)) {
            target.ip = hostMatch[2]
            outputTargets.push(target);
        } else {
            try {
                let ip = await resolver.resolve4(target.hostname);
                target.ip = ip[0]
                outputTargets.push(target);
            } catch (e) {
                console.log("Error looking up host: ")
                console.log(target);
                console.log(hostMatch);
                console.log(e)
                console.log("Above will be omitted from pinging")
            }
        }        
    }
    targets = outputTargets.slice();
    console.info(targets)
    console.info(":Target list updated")
}
loadTargets();

fs.watchFile('./destination/targets.json', loadTargets)



const performPing = (target, cb) => {
    let sock = new net.Socket();
    let start = process.hrtime();
    sock.connect(target.opts, () => {
        // on("connect") implicit
        let end = process.hrtime(start);
        let rtt = (end[0] * 1e9 + end[1]) / 1e6;
        console.log(`${rtt}    : ${target.customer} - ${target.deployment} - ${target.mode} - ${target.region} - ${target.source} - ${target.method}`)
        prom_rtt.labels(target.customer, target.deployment, target.mode, target.region, target.source, target.method).set(rtt)
        sock.destroy()
        cb()
    })
    sock.setTimeout(pingTimeout)

    sock.on('timeout', () => {
        prom_rtt.labels(target.customer, target.deployment, target.mode, target.region, target.source, target.method).set(-1)
        sock.destroy()
        cb()
    })

    sock.on("error", (err) => {
        prom_rtt.labels(target.customer, target.deployment, target.mode, target.region, target.source, target.method).set(-2)
        sock.destroy()
        cb()
    })
}

const pingTarget = (target, cb) => {
    /**
     * The purpose of this is to perform two operations after eachother. 
     * From async docs: https://caolan.github.io/async/v3/docs.html#parallel
     * 
     * Note: parallel is about kicking-off I/O tasks in parallel, not about parallel execution of code. 
     * If your tasks do not use any timers or perform any I/O, they will actually be executed in series. 
     * Any synchronous setup sections for each task will happen one after the other. 
     * JavaScript remains single-threaded.
     */

    async.parallel({
        ip: function(callback) {
            performPing({
                opts: {
                    host: target.ip,
                    port: target.port,
                    family: 4,
                    lookup: function (host, {}, cb) {
                        cb(null, host, 4)
                    }
                }, 
                customer: target.Customer,
                deployment: target.Deployment,
                mode: target.Mode, 
                region: target.Region,
                source: sourceRegion,
                method: "ip"
            }, callback)
        },
        dns: function(callback) {
            performPing({
                opts: {
                    host: target.hostname,
                    port: target.port,
                    family: 4
                }, 
                customer: target.Customer,
                deployment: target.Deployment,
                mode: target.Mode, 
                region: target.Region,
                source: sourceRegion,
                method: "dns"
            }, callback)
        }
    }, (results) => {
        cb()
    })
}

const pingTheTargets = () => {
    console.info("Initializing target ping")
    const q = async.queue(pingTarget, pingParallel)
    setInterval(() => {
        console.log("> Pushing targets")
        q.push(targets)
    }, pingFrequency*1000);
    q.drain(() => {
        console.log("< Targets completed")
    })
}

pingTheTargets();

const metricsListener = async (req, res) => {
    res.writeHead(200)
    res.end(await promclient.register.metrics())
}

const metricsServer = http.createServer(metricsListener);
metricsServer.listen(9090, () => {
    console.info('Nodeping Metrics Server up and running')
})