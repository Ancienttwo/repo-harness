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

Owns the workflow-engine-inspection-migration capability boundary declared in .archcontext/model/nodes.

## Source Map

- Primary prefix: `scripts/inspect-project-state.ts` (entrypoint)
- Architecture module: `docs/architecture/modules/workflow-engine/inspection-migration.md` (design-source)
- Workstream: `tasks/workstreams/workflow-engine/inspection-migration` (durable-progress)

## Refresh Hints

- `bun test tests/migration-script.test.ts tests/create-project-dirs.runtime.test.ts tests/workflow-contract.test.ts`
- `bun src/cli/index.ts init --repo . --dry-run`
<!-- END CAPABILITY CONTEXT -->
