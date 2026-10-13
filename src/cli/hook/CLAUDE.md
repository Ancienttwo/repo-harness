# Functional Block Agent Context

Keep this file focused on the local contract for this primary functional block.

## Local Context Contract

- Describe only the ownership, boundaries, stable entrypoints, and local verification commands for this functional block.
- Keep sibling `CLAUDE.md` and `AGENTS.md` files aligned. Claude Code consumes `CLAUDE.md`; Codex consumes `AGENTS.md`.
- Record the local LSP/tooling profile here when it differs from the repo default.
- Route deep implementation detail into nearby docs instead of inflating root agent context files.
- Treat `.ai/context/context-map.json` as the index of discoverable context files.
- Do not keep pushing context files deeper by default; add lower-level files only for a separately owned functional block with its own commands and invariants.
- Prefer repo-local workflow artifacts over tool-specific chat memory.
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
