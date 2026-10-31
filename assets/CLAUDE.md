# Functional Block Agent Context

Keep this file focused on the local contract for this primary functional block.

<!-- BEGIN CAPABILITY CONTEXT -->
## Capability Context

- Capability ID: `workflow-engine-contract-assets`
- Domain: `workflow-engine`
- Name: `contract-assets`
- Primary prefix: `.ai/context`
- Architecture module: `docs/architecture/modules/workflow-engine/contract-assets.md`

## Positioning

Owns the package workflow contract, repo opt-in marker, templates, capability nodes, and the standalone resolver projection.

## Source Map

- Primary prefix: `.ai/context` (entrypoint)
- Architecture module: `docs/architecture/modules/workflow-engine/contract-assets.md` (design-source)

## Refresh Hints

- `bun test tests/workflow-contract.test.ts tests/scaffold-parity.test.ts`
- `bun scripts/capability-resolver.ts validate --format text`
- `bun run check:helpers`
<!-- END CAPABILITY CONTEXT -->
