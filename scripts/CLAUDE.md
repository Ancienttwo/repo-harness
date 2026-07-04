# Functional Block Agent Context

Keep this file focused on the local contract for this primary functional block.

<!-- BEGIN CAPABILITY CONTEXT -->
## Capability Context

- Capability ID: `workflow-engine-inspection-migration`
- Domain: `workflow-engine`
- Name: `inspection-migration`
- Primary prefix: `scripts/inspect-project-state.ts`
- Architecture module: `docs/architecture/modules/workflow-engine/inspection-migration.md`
- Workstream: `tasks/workstreams/workflow-engine/inspection-migration`

## Positioning

Owns the workflow-engine-inspection-migration capability boundary declared in .ai/context/capabilities.json.

## Source Map

- Primary prefix: `scripts/inspect-project-state.ts` (entrypoint)
- Architecture module: `docs/architecture/modules/workflow-engine/inspection-migration.md` (design-source)
- Workstream: `tasks/workstreams/workflow-engine/inspection-migration` (durable-progress)

## Refresh Hints

- `bun test tests/migration-script.test.ts tests/create-project-dirs.runtime.test.ts tests/workflow-contract.test.ts`
- `bash scripts/migrate-project-template.sh --repo . --dry-run`
<!-- END CAPABILITY CONTEXT -->

<!-- BEGIN ARCHITECTURE CONTRACT -->
## Architecture Contract

- Functional block: `scripts/lib`
- Capability ID: `workflow-engine-inspection-migration`
- Matched prefix: `scripts/lib`
- Architecture domain: `workflow-engine`
- Architecture capability: `inspection-migration`
- Architecture module: `docs/architecture/modules/workflow-engine/inspection-migration.md`
- Last architecture event: 2026-07-05T04:35:41+0800
- Last changed path: `scripts/lib/project-init-lib.sh`
- Severity: high
- Change type: workflow-surface
- Module responsibility: Keep this block aligned with the local boundary described by surrounding human-owned context.
- Entrypoints: `scripts/lib`
- Allowed dependencies: Follow root `AGENTS.md` / `CLAUDE.md` and this local contract.
- Forbidden dependencies: Do not cross sibling app/service/package boundaries without an architecture snapshot or explicit plan.
- Runtime path: `scripts/lib`
- LSP/tooling profile: `typescript-lsp`
- Verification: Use root required checks plus local commands recorded in this capability contract.
- Latest snapshot: `(none yet)`
- Semantic diagram source: `docs/architecture/modules/workflow-engine/inspection-migration.md`
- Latest human diagram: `(none yet)`
- Pending architecture request: `(none)`

## Active Workstreams

- `tasks/workstreams/workflow-engine/inspection-migration/20260703-inspection-migration.md`
  - status: active
  - current_slice: completed-20260703-architecture-closeout
  - source_plan: (none)

## Current Session Projection

- Durable progress lives under `tasks/workstreams/workflow-engine/inspection-migration`.
- `tasks/current.md` is the tracked derived status snapshot; it is not a live lock or task source.
- `tasks/todos.md` is the deferred-goal ledger; current execution slices stay in the active plan's `## Task Breakdown`.
<!-- END ARCHITECTURE CONTRACT -->
