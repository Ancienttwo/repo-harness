# Current Status Snapshot

<!-- generated-by: repo-harness refresh-current-status v1 -->
<!-- updated_at: 2026-07-21T01:12:16+0800 -->
<!-- stale_after: 24h -->

> **Status**: Active
> **Updated At**: 2026-07-21T01:12:16+0800
> **Source Branch**: codex/hrd-06-stop-handler-slim
> **Source Commit**: e0e57acd
> **Target Branch**: main
> **Stale After**: 24h
> **Reason**: manual
> **Derived From**: active-plan, active-sprint, workstreams, handoff, checks, git status

This file is a tracked mainline snapshot derived from repo artifacts. It is not a live lock, not a kanban board, and not an implementation gate. If it is stale, read the source artifacts below.

## Current Focus

- Status: Active
- Active Plan: plans/plan-20260720-2256-hrd-06-stop-handler-slim.md
- Plan Status: Review
- Next Task: (none)
- Clear Note: (none)

## Mainline Snapshot Reading

- Current worktree: `tasks/current.md`
- Target branch snapshot: `git show main:tasks/current.md`
- Rule: non-target worktrees may read the target branch snapshot, but must verify against source artifacts before acting.

## Active Work

- .: plans/plan-20260720-2256-hrd-06-stop-handler-slim.md
- .: active-worktree owner -> /Users/kito/Projects/repo-harness-wt-hrd-06-stop-handler-slim
## Active Sprint

- Sprint: (none)
## Workstreams

- `tasks/workstreams/workflow-engine/contract-assets/20260712-contract-assets.md`: status=active, current_slice=todo-01, source_plan=(none)
- `tasks/workstreams/workflow-engine/contract-assets/20260714-merge-gate-enforcement.md`: status=active, current_slice=owner-directed-claude-skip-awaiting-github-ci-merge, source_plan=`plans/plan-20260714-1713-merge-gate-enforcement.md`
- `tasks/workstreams/workflow-engine/contract-assets/agent-fleet-specialists.md`: status=completed, current_slice=completed-20260713-specialist-roles, source_plan=plans/plan-20260712-2215-agent-fleet-specialists.md
- `tasks/workstreams/workflow-engine/contract-assets/cleanup-script-policy.md`: status=completed, current_slice=todo-01, source_plan=(none)
- `tasks/workstreams/workflow-engine/inspection-migration/20260703-inspection-migration.md`: status=active, current_slice=completed-20260703-architecture-closeout, source_plan=(none)
- `tasks/workstreams/workflow-engine/inspection-migration/20260712-inspection-migration.md`: status=active, current_slice=todo-01, source_plan=(none)
- `tasks/workstreams/workflow-engine/inspection-migration/agent-fleet-specialists.md`: status=completed, current_slice=completed-20260713-policy-seed, source_plan=plans/plan-20260712-2215-agent-fleet-specialists.md
## Handoff

- Exact Next Step: (none)

## Checks

- status=(none), source=(none), exit_code=(none), file=.ai/harness/checks/latest.json

## Git Status

- Summary: 36 changed/untracked path(s)

```
 M .ai/hooks/.projection.json
 D .ai/hooks/stop-orchestrator.sh
 M README.es.md
 M README.fr.md
 M README.ja.md
 M README.md
 M README.zh-CN.md
 D assets/hooks/stop-orchestrator.sh
 M assets/reference-configs/hook-operations.md
 M assets/reference-configs/minimal-change-hooks.md
 M docs/architecture/index.md
 M docs/architecture/modules/runtime-harness/hook-adapters.md
 M docs/reference-configs/hook-operations.md
 M docs/reference-configs/minimal-change-hooks.md
 M src/cli/hook/route-registry.ts
 M src/cli/hook/runtime.ts
 M src/core/workflow/operation-readiness.ts
 M src/effects/loop/state-input-collector.ts
 M tasks/current.md
 M tasks/todos.md
 M tests/cli/hook.test.ts
 M tests/cli/route-registry.test.ts
 M tests/fixtures/loop-runtime/characterization.json
 M tests/hook-contracts.test.ts
 M tests/hook-runtime.test.ts
 M tests/readme-dx.test.ts
 M tests/state-input-collector.test.ts
 M tests/state/adapter-parity.test.ts
 M tests/state/fixtures/loop-semantics/characterization.json
 M tests/state/loop-semantics-characterization.test.ts
?? plans/plan-20260720-2256-hrd-06-stop-handler-slim.md
?? src/cli/hook/stop-handler.ts
?? tasks/contracts/20260720-2256-hrd-06-stop-handler-slim.contract.md
?? tasks/notes/20260720-2256-hrd-06-stop-handler-slim.notes.md
?? tasks/reviews/20260720-2256-hrd-06-stop-handler-slim.review.md
?? tests/stop-handler.test.ts
```

## Source Artifacts

- Plans: `plans/plan-*.md`
- Active marker: `.ai/harness/active-plan`
- Active worktree marker: `.ai/harness/active-worktree`
- PRDs: `plans/prds/*.prd.md`
- Sprints: `plans/sprints/*.sprint.md`
- Active sprint marker: `.ai/harness/sprint/active-sprint`
- Workstreams: `tasks/workstreams/**/*.md`
- Handoff: `.ai/harness/handoff/current.md`
- Checks: `.ai/harness/checks/latest.json`
