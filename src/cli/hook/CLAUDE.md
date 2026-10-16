# Functional Block Agent Context

Keep this file focused on the local contract for this primary functional block.

## Local Context Contract

- `src/cli/hook/` owns host-event runtime authority: the typed route registry, the runtime and the handlers. Operator helpers run from the package through `repo-harness run <helper>`; no shell operator library exists.

<!-- BEGIN CAPABILITY CONTEXT -->
## Capability Context

- Capability ID: `runtime-harness-hook-adapters`
- Domain: `runtime-harness`
- Name: `hook-adapters`
- Primary prefix: `src/cli/hook`
- Architecture module: `docs/architecture/modules/runtime-harness/hook-adapters.md`
- Workstream: `tasks/workstreams/runtime-harness/hook-adapters`

## Positioning

Owns the runtime-harness-hook-adapters capability boundary declared in .archcontext/model/nodes.

## Source Map

- Primary prefix: `src/cli/hook` (entrypoint)
- Architecture module: `docs/architecture/modules/runtime-harness/hook-adapters.md` (design-source)
- Workstream: `tasks/workstreams/runtime-harness/hook-adapters` (durable-progress)

## Refresh Hints

- `bun test tests/hook-runtime.test.ts tests/hook-contracts.test.ts tests/workflow-contract.test.ts`
- `bash scripts/check-task-workflow.sh`
<!-- END CAPABILITY CONTEXT -->
