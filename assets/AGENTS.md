# Functional Block Agent Context

Keep this file focused on the local contract for this primary functional block.

<!-- BEGIN CAPABILITY CONTEXT -->
## Capability Context

- Capability ID: `workflow-engine-contract-assets`
- Domain: `workflow-engine`
- Name: `contract-assets`
- Primary prefix: `assets/workflow-contract.v1.json`
- Architecture module: `docs/architecture/modules/workflow-engine/contract-assets.md`
- Workstream: `tasks/workstreams/workflow-engine/contract-assets`

## Positioning

Owns the workflow-engine-contract-assets capability boundary declared in .archcontext/model/nodes.

## Source Map

- Primary prefix: `assets/workflow-contract.v1.json` (entrypoint)
- Architecture module: `docs/architecture/modules/workflow-engine/contract-assets.md` (design-source)
- Workstream: `tasks/workstreams/workflow-engine/contract-assets` (durable-progress)

## Refresh Hints

- `bun test tests/workflow-contract.test.ts tests/scaffold-parity.test.ts`
- `bun scripts/capability-resolver.ts validate --format text`
<!-- END CAPABILITY CONTEXT -->
