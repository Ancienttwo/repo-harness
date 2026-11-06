# Runtime Topology

The architecture model declares this topology. No code facts verify it: archctx never reads the configuration it describes. A change to a file a node lists in `source.include` marks this page and its diagram stale.

- Diagram: [Mermaid](diagrams/runtime-topology.mmd)

## Namespaces

| Namespace | Type | Parent | Namespaces | Processes |
| --- | --- | --- | --- | --- |
| `namespace.host.developer` Developer host | host | none | none | `process.agent-host`, `process.cli`, `process.herdr-app`, `process.herdr-core-server`, `process.hook`, `process.mcp-server`, `process.notify-relay`, `process.oar-review-host`, `process.operator-collector`, `process.operator-server`, `process.process-group-launcher`, `process.process-supervisor`, `process.vendor-cli` |

## Processes

| Process | Namespace | Spawns | Deployed here |
| --- | --- | --- | --- |
| `process.agent-host` Agent host | `namespace.host.developer` | `process.hook`, `process.mcp-server` | none |
| `process.cli` CLI process | `namespace.host.developer` | `process.process-supervisor` | `component.global-runtime-reconciliation.cli-root` |
| `process.herdr-app` Herdr.app | `namespace.host.developer` | none | none |
| `process.herdr-core-server` herdr-core server | `namespace.host.developer` | `process.agent-host`, `process.notify-relay`, `process.oar-review-host` | none |
| `process.hook` Hook process | `namespace.host.developer` | `process.process-supervisor` | `capability.runtime-harness.hook-adapters` |
| `process.mcp-server` MCP server | `namespace.host.developer` | `process.process-supervisor` | `capability.runtime-harness.mcp-sidecar` |
| `process.notify-relay` Notify relay | `namespace.host.developer` | none | `capability.runtime-harness.task-agent-host` |
| `process.oar-review-host` OAR review host | `namespace.host.developer` | `process.vendor-cli` | `capability.runtime-harness.task-agent-host`, `capability.verification.acceptance-review` |
| `process.operator-collector` Operator collector | `namespace.host.developer` | none | none |
| `process.operator-server` Operator server | `namespace.host.developer` | `process.operator-collector` | `capability.runtime-harness.operator` |
| `process.process-group-launcher` Process group launcher | `namespace.host.developer` | none | none |
| `process.process-supervisor` Process supervisor | `namespace.host.developer` | `process.process-group-launcher` | `capability.workflow-engine.execution-primitives` |
| `process.vendor-cli` Vendor reviewer CLI | `namespace.host.developer` | none | none |

## Mount Stacks

- No mounts recorded.

## Source Anchors

| Node | Source |
| --- | --- |
| `namespace.host.developer` Developer host | model-authored, no source anchor |
| `process.agent-host` Agent host | model-authored, no source anchor |
| `process.cli` CLI process | model-authored, no source anchor |
| `process.herdr-app` Herdr.app | model-authored, no source anchor |
| `process.herdr-core-server` herdr-core server | model-authored, no source anchor |
| `process.hook` Hook process | model-authored, no source anchor |
| `process.mcp-server` MCP server | model-authored, no source anchor |
| `process.notify-relay` Notify relay | model-authored, no source anchor |
| `process.oar-review-host` OAR review host | model-authored, no source anchor |
| `process.operator-collector` Operator collector | model-authored, no source anchor |
| `process.operator-server` Operator server | model-authored, no source anchor |
| `process.process-group-launcher` Process group launcher | model-authored, no source anchor |
| `process.process-supervisor` Process supervisor | model-authored, no source anchor |
| `process.vendor-cli` Vendor reviewer CLI | model-authored, no source anchor |
