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

Owns the workflow-engine-contract-assets capability boundary declared in .ai/context/capabilities.json.

## Source Map

- Primary prefix: `assets/workflow-contract.v1.json` (entrypoint)
- Architecture module: `docs/architecture/modules/workflow-engine/contract-assets.md` (design-source)
- Workstream: `tasks/workstreams/workflow-engine/contract-assets` (durable-progress)

## Refresh Hints

- `bun test tests/workflow-contract.test.ts tests/scaffold-parity.test.ts`
- `bun scripts/capability-resolver.ts validate --format text`
<!-- END CAPABILITY CONTEXT -->

<!-- BEGIN ARCHITECTURE CONTRACT -->
## Architecture Contract

- Functional block: `.ai/harness/policy.json`
- Capability ID: `workflow-engine-contract-assets`
- Matched prefix: `.ai/harness/policy.json`
- Architecture domain: `workflow-engine`
- Architecture capability: `contract-assets`
- Architecture module: `docs/architecture/modules/workflow-engine/contract-assets.md`
- Last architecture event: 2026-07-06T13:54:27+0800
- Last changed path: `.ai/harness/policy.json`
- Severity: high
- Change type: workflow-surface
- Module responsibility: Keep this block aligned with the local boundary described by surrounding human-owned context.
- Entrypoints: `.ai/harness/policy.json`
- Allowed dependencies: Follow root `AGENTS.md` / `CLAUDE.md` and this local contract.
- Forbidden dependencies: Do not cross sibling app/service/package boundaries without an architecture snapshot or explicit plan.
- Runtime path: `.ai/harness/policy.json`
- LSP/tooling profile: `typescript-lsp`
- Verification: Use root required checks plus local commands recorded in this capability contract.
- Latest snapshot: `(none yet)`
- Semantic diagram source: `docs/architecture/modules/workflow-engine/contract-assets.md`
- Latest human diagram: `(none yet)`
- Pending architecture request: `(none)`

## Active Workstreams

- `tasks/workstreams/workflow-engine/contract-assets/cleanup-script-policy.md`
  - status: completed
  - current_slice: todo-01
  - source_plan: (none)

## Current Session Projection

- Durable progress lives under `tasks/workstreams/workflow-engine/contract-assets`.
- `tasks/current.md` is the tracked derived status snapshot; it is not a live lock or task source.
- `tasks/todos.md` is the deferred-goal ledger; current execution slices stay in the active plan's `## Task Breakdown`.
<!-- END ARCHITECTURE CONTRACT -->
