# Functional Block Agent Context

Keep this file focused on the local contract for this primary functional block.

<!-- BEGIN CAPABILITY CONTEXT -->
## Capability Context

- Capability ID: `runtime-harness-agent-runtime-effects`
- Domain: `runtime-harness`
- Name: `agent-runtime-effects`
- Primary prefix: `src/core/engineers/agent-runtime-effect.ts`
- Architecture module: `docs/architecture/modules/runtime-harness/agent-runtime-effects.md`
- Workstream: `tasks/workstreams/runtime-harness/agent-runtime-effects`

## Positioning

Owns the runtime-harness-agent-runtime-effects capability boundary declared in .archcontext/model/nodes.

## Source Map

- Primary prefix: `src/core/engineers/agent-runtime-effect.ts` (entrypoint)
- Architecture module: `docs/architecture/modules/runtime-harness/agent-runtime-effects.md` (design-source)
- Workstream: `tasks/workstreams/runtime-harness/agent-runtime-effects` (durable-progress)

## Refresh Hints

- `bun test tests/unit/r1-provider-neutral-agent-runtime.test.ts tests/unit/r1-agent-runtime-adapters.test.ts tests/unit/issue-281-task-offer-wake.test.ts tests/cli/engineer.test.ts tests/cli/mcp-engineer-tools.test.ts --timeout 60000`
- `bun run check:type`
<!-- END CAPABILITY CONTEXT -->

<!-- BEGIN ARCHITECTURE CONTRACT -->
## Architecture Contract

- Functional block: `src/effects/engineers/agent-runtime-adapters`
- Capability ID: `runtime-harness-agent-runtime-effects`
- Matched prefix: `src/effects/engineers/agent-runtime-adapters`
- Architecture domain: `runtime-harness`
- Architecture capability: `agent-runtime-effects`
- Architecture module: `docs/architecture/modules/runtime-harness/agent-runtime-effects.md`
- Last architecture event: 2026-09-09T02:02:06+0800
- Last changed path: `src/effects/engineers/agent-runtime-adapters/herdr-cli-agent.ts`
- Severity: low
- Change type: source-change
- Module responsibility: Keep this block aligned with the local boundary described by surrounding human-owned context.
- Entrypoints: `src/effects/engineers/agent-runtime-adapters`
- Allowed dependencies: Follow root `AGENTS.md` / `CLAUDE.md` and this local contract.
- Forbidden dependencies: Do not cross sibling app/service/package boundaries without an architecture snapshot or explicit plan.
- Runtime path: `src/effects/engineers/agent-runtime-adapters`
- LSP/tooling profile: `typescript-lsp`
- Verification: Use root required checks plus local commands recorded in this capability contract.
- Latest snapshot: `(none yet)`
- Semantic diagram source: `docs/architecture/modules/runtime-harness/agent-runtime-effects.md`
- Pending architecture request: `(none)`

## Active Workstreams

- `tasks/workstreams/runtime-harness/agent-runtime-effects/me3a-provider-thread-effect.md`
  - status: completed
  - current_slice: completed-20260825-me3a-provider-thread-effect
  - source_plan: plans/plan-20260825-2120-me3a-provider-thread-effect.md
- `tasks/workstreams/runtime-harness/agent-runtime-effects/r1-provider-neutral-agent-runtime.md`
  - status: completed
  - current_slice: completed-20260831-r1 (PR #230, squash 4f7cb37e)
  - source_plan: plans/plan-20260830-1903-r1-provider-neutral-agent-runtime.md

## Current Session Projection

- Durable progress lives under `tasks/workstreams/runtime-harness/agent-runtime-effects`.
- `tasks/current.md` is the ignored local derived status read model; it is not a live lock or task source.
- `tasks/todos.md` is the deferred-goal ledger; current execution slices stay in the active plan's `## Task Breakdown`.
<!-- END ARCHITECTURE CONTRACT -->
