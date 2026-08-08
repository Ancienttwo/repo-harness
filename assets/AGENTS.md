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

Owns the workflow-engine-contract-assets capability boundary declared in .archcontext/model/nodes.

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

- Functional block: `assets/templates`
- Capability ID: `workflow-engine-contract-assets`
- Matched prefix: `assets/templates`
- Architecture domain: `workflow-engine`
- Architecture capability: `contract-assets`
- Architecture module: `docs/architecture/modules/workflow-engine/contract-assets.md`
- Last architecture event: 2026-08-05T00:46:13+0800
- Last changed path: `tasks/workstreams/workflow-engine/contract-assets/github-issues-158-159.md`
- Severity: medium
- Change type: workstream-sync
- Module responsibility: Keep this block aligned with the local boundary described by surrounding human-owned context.
- Entrypoints: `assets/templates`
- Allowed dependencies: Follow root `AGENTS.md` / `CLAUDE.md` and this local contract.
- Forbidden dependencies: Do not cross sibling app/service/package boundaries without an architecture snapshot or explicit plan.
- Runtime path: `assets/templates`
- LSP/tooling profile: `typescript-lsp`
- Verification: Use root required checks plus local commands recorded in this capability contract.
- Latest snapshot: `(none yet)`
- Semantic diagram source: `docs/architecture/modules/workflow-engine/contract-assets.md`
- Latest human diagram: `(none yet)`
- Pending architecture request: `(none)`

## Active Workstreams

- `tasks/workstreams/workflow-engine/contract-assets/20260712-contract-assets.md`
  - status: completed
  - current_slice: completed-20260712-repo-owned-agent-fleet
  - source_plan: `plans/archive/plan-20260712-2053-repo-owned-agent-fleet.md`
- `tasks/workstreams/workflow-engine/contract-assets/20260714-merge-gate-enforcement.md`
  - status: completed
  - current_slice: completed-20260715-merge-gate-enforcement
  - source_plan: `plans/archive/plan-20260714-1713-merge-gate-enforcement.md`
- `tasks/workstreams/workflow-engine/contract-assets/agent-fleet-specialists.md`
  - status: completed
  - current_slice: completed-20260713-specialist-roles
  - source_plan: `plans/archive/plan-20260712-2215-agent-fleet-specialists.md`
- `tasks/workstreams/workflow-engine/contract-assets/cleanup-script-policy.md`
  - status: completed
  - current_slice: completed-20260529-cleanup-script-policy
  - source_plan: (none)
- `tasks/workstreams/workflow-engine/contract-assets/github-issues-158-159.md`
  - status: completed
  - current_slice: completed-20260805-packaged-helper-projection
  - source_plan: plans/plan-20260805-0001-github-issues-158-159.md

## Current Session Projection

- Durable progress lives under `tasks/workstreams/workflow-engine/contract-assets`.
- `tasks/current.md` is the tracked derived status snapshot; it is not a live lock or task source.
- `tasks/todos.md` is the deferred-goal ledger; current execution slices stay in the active plan's `## Task Breakdown`.
<!-- END ARCHITECTURE CONTRACT -->
