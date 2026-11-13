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

<!-- BEGIN ARCHCONTEXT AGENT CONTEXT id="capability.workflow-engine.inspection-migration" rendererVersion="archcontext.agent-context-renderer/v2" outputDigest="sha256:95b04dad6fbd53ec488e56d39defcbfff0203183f82f4d467d874023a666ec14" -->
# Agent Context: Inspection And Migration

- id: `capability.workflow-engine.inspection-migration`
- kind: `capability`
- summary: Inspects repository state and executes explicit initialization or migration plans.
- source.include: `references/migration-guide.md`, `references/tech-stacks.md`, `scripts/inspect-project-state.ts`, `scripts/create-project-dirs.sh`, `scripts/init-project.sh`, `scripts/lib/**`, `scripts/AGENTS.md`, `scripts/CLAUDE.md`
- extensions.lspProfile: `typescript-lsp`
- extensions.verification: `bun run test:files tests/migration-script.test.ts tests/create-project-dirs.runtime.test.ts tests/workflow-contract.test.ts`, `bun src/cli/index.ts init --repo . --dry-run`
- extensions digest: sha256:5b3499ee9b33396aa12187e0e6a95a95aeffe1f33c8280636f7fda032215c315
<!-- END ARCHCONTEXT AGENT CONTEXT id="capability.workflow-engine.inspection-migration" -->
