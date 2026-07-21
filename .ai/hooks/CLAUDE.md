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
- `assets/hooks/` owns only operator helper assets and their local context. Host-event runtime authority lives in `src/cli/hook/`; treat `.ai/hooks/` as the generated operator-helper projection, then run `bun run sync:hooks` and `bun run check:hooks` after edits.
- Do not hand-edit generated `.ai/hooks/` drift. Classify package-only or repo-only exceptions in `assets/hooks/projection.json`.

<!-- BEGIN CAPABILITY CONTEXT -->
## Capability Context

- Capability ID: `runtime-harness-hook-adapters`
- Domain: `runtime-harness`
- Name: `hook-adapters`
- Primary prefix: `assets/hooks`
- Architecture module: `docs/architecture/modules/runtime-harness/hook-adapters.md`
- Workstream: `tasks/workstreams/runtime-harness/hook-adapters`

## Positioning

Owns the runtime-harness-hook-adapters capability boundary declared in .ai/context/capabilities.json.

## Source Map

- Primary prefix: `assets/hooks` (entrypoint)
- Architecture module: `docs/architecture/modules/runtime-harness/hook-adapters.md` (design-source)
- Workstream: `tasks/workstreams/runtime-harness/hook-adapters` (durable-progress)

## Refresh Hints

- `bun test tests/hook-runtime.test.ts tests/hook-contracts.test.ts tests/workflow-contract.test.ts`
- `bash scripts/check-task-workflow.sh --strict`
<!-- END CAPABILITY CONTEXT -->

<!-- BEGIN ARCHITECTURE CONTRACT -->
## Architecture Contract

- Functional block: `src/cli/hook`
- Capability ID: `runtime-harness-hook-adapters`
- Matched prefix: `src/cli/hook`
- Architecture domain: `runtime-harness`
- Architecture capability: `hook-adapters`
- Architecture module: `docs/architecture/modules/runtime-harness/hook-adapters.md`
- Last architecture event: 2026-07-21T21:39:22+0800
- Last changed path: `src/cli/hook/prompt-intents.ts`
- Severity: high
- Change type: workflow-surface
- Module responsibility: Keep this block aligned with the local boundary described by surrounding human-owned context.
- Entrypoints: `src/cli/hook`
- Allowed dependencies: Follow root `AGENTS.md` / `CLAUDE.md` and this local contract.
- Forbidden dependencies: Do not cross sibling app/service/package boundaries without an architecture snapshot or explicit plan.
- Runtime path: `src/cli/hook`
- LSP/tooling profile: `typescript-lsp`
- Verification: Use root required checks plus local commands recorded in this capability contract.
- Latest snapshot: `(none yet)`
- Semantic diagram source: `docs/architecture/modules/runtime-harness/hook-adapters.md`
- Latest human diagram: `(none yet)`
- Pending architecture request: `docs/architecture/requests/runtime-harness-hook-adapters.md`

## Active Workstreams

- (none yet)

## Current Session Projection

- Durable progress lives under `tasks/workstreams/runtime-harness/hook-adapters`.
- `tasks/current.md` is the tracked derived status snapshot; it is not a live lock or task source.
- `tasks/todos.md` is the deferred-goal ledger; current execution slices stay in the active plan's `## Task Breakdown`.
<!-- END ARCHITECTURE CONTRACT -->
