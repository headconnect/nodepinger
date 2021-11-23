## Nodepinger

Nodepinger is a simple typescript nodejs application which performs "TCP Ping" - basically _establishing_ a TCP connection on a given port then dropping it. 

The intention is to measure the time it takes for this operation as precisely as possible.

To that end - it performs its task in two modes:

`ip`: the `targets.json` list of targets are pre-resolved with DNS so that this is not required to establish the connection.
`dns`: the `ip` of the `target` is resolved prior to each "ping".

Both metrics are recorded and available for scraping for each target (excepting ip-only targets)


## Configuration

The configuration of nodepinger is as a) a set of targets and b) a set of environment variables which governs its operation. 

> Note: For the kubernetes deployment, it is presumed that you manage a single "targets" configmap as this is usually run in conjunction with `readychecker`. If this is not the case, take the 



### Targets

Readychecker expects `targets.json` to exist in the `destination` subfolder relative to its execution. 

Its format is as an array of json objects, thus: 

```ts
[{
    "Customer": "Generic", // string, descriptive name. Typically used as top-level indicator for a group of targets
    "Deployment": "Google", // string, descriptive name. Typically used as a second-level indactor for a group of targets
    "Mode": "prod", // enum: "dev"|"stage"|"prod" - indicates the mode of the target. 
    "Region": "global", // string, descriptive name. Typically used to indicate multiple regional instances of a customer+deployment for the selected mode. 
    "URL": "https://google.com" // URL - the target to check.
}]

```

> NOTE: This has not been tested with spaces in the customer/deployment/mode/region fields, so it would be advisable to avoid that for the time being (or test yourself.).

### Operation

The operation is governed by the following environment variables:

| Variable | Default | Description |
|----------|---------|-------------|
| SOURCE_REGION | "local" | Indication of the region where the nodepinger is run from, follows the "Region" convention of `targets.json` |
| PING_FREQUENCY_SECONDS | 10 | How many seconds between each time a target is pinged |
| PING_PARALLELISM | 5 | How many connections are allowed to be in-flight at any given moment |
| PING_TIMEOUT_MILLISECONDS | 2500 | How many milliseconds should we wait for a connection to be established before it is timed out | 

### Dockerfile

The included dockerfile is extremely basic, but sufficient for the purpose.

### Kubernetes deployment

The nodepinger is intended to be run in a kubernetes cluster as a deployment. It is also sensible to run alongside the `readycheck` tool which performs end-to-end http requests - and would be reading the same target list. 

It is also designed to automatically reload targets if the configmap changes contents. 

As such, the included `deploy` folder contains the Deployment and Service - the configmap is in the `readycheck` deployment.yaml

The docker image is not publicly published, so you would need to build and push it to a registry of your choice, and modify the path & name of the image of the container in the deployment spec. 
