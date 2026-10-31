# Functional Block Agent Context

Keep this file focused on the local contract for this primary functional block.

<!-- BEGIN CAPABILITY CONTEXT -->
## Capability Context

- Capability ID: `workflow-engine-inspection-migration`
- Domain: `workflow-engine`
- Name: `inspection-migration`
- Primary prefix: `references/migration-guide.md`
- Architecture module: `docs/architecture/modules/workflow-engine/inspection-migration.md`

## Positioning

Inspects repository state and executes explicit initialization or migration plans.

## Source Map

- Primary prefix: `references/migration-guide.md` (entrypoint)
- Architecture module: `docs/architecture/modules/workflow-engine/inspection-migration.md` (design-source)

## Refresh Hints

- `bun run test:files tests/migration-script.test.ts tests/create-project-dirs.runtime.test.ts tests/workflow-contract.test.ts`
- `bun src/cli/index.ts init --repo . --dry-run`
<!-- END CAPABILITY CONTEXT -->
