# Current Status Snapshot

<!-- generated-by: repo-harness refresh-current-status v1 -->
<!-- updated_at: 2026-08-24T18:25:51+0800 -->
<!-- stale_after: 24h -->

> **Status**: Active
> **Updated At**: 2026-08-24T18:25:51+0800
> **Source Branch**: codex/local-human-control-board-v1
> **Source Commit**: 9eda600b
> **Target Branch**: main
> **Stale After**: 24h
> **Reason**: connector-acceptance-repair
> **Derived From**: active-plan, active-sprint, workstreams, handoff, checks, git status

This file is a tracked mainline snapshot derived from repo artifacts. It is not a live lock, not a kanban board, and not an implementation gate. If it is stale, read the source artifacts below.

## Current Focus

- Status: Active
- Active Plan: plans/plan-20260824-1757-operator-connector-acceptance-repair.md
- Plan Status: Executing
- Next Task: Full verification, acceptance receipt, merge seal, remote CI and Connector re-review pass.
- Clear Note: (none)

## Mainline Snapshot Reading

- Current worktree: `tasks/current.md`
- Target branch snapshot: `git show main:tasks/current.md`
- Rule: non-target worktrees may read the target branch snapshot, but must verify against source artifacts before acting.

## Active Work

- .: plans/plan-20260824-1757-operator-connector-acceptance-repair.md
- .: active-worktree owner -> self
- linked-worktree-4b80f284a890: plans/plan-20260823-2134-release-0-17-0.md
- linked-worktree-4b80f284a890: active-worktree owner -> self
## Active Sprint

- Sprint: (none)
## Workstreams

- `tasks/workstreams/runtime-harness/hook-adapters/github-issues-158-159.md`: status=completed, current_slice=completed-20260805-contract-scoped-check-repair, source_plan=plans/plan-20260805-0001-github-issues-158-159.md
- `tasks/workstreams/verification/evals-checks/github-issues-158-159.md`: status=completed, current_slice=completed-20260805-deployed-emitter-binding, source_plan=plans/plan-20260805-0001-github-issues-158-159.md
- `tasks/workstreams/workflow-engine/contract-assets/20260712-contract-assets.md`: status=completed, current_slice=completed-20260712-repo-owned-agent-fleet, source_plan=`plans/archive/plan-20260712-2053-repo-owned-agent-fleet.md`
- `tasks/workstreams/workflow-engine/contract-assets/20260714-merge-gate-enforcement.md`: status=completed, current_slice=completed-20260715-merge-gate-enforcement, source_plan=`plans/archive/plan-20260714-1713-merge-gate-enforcement.md`
- `tasks/workstreams/workflow-engine/contract-assets/agent-fleet-specialists.md`: status=completed, current_slice=completed-20260713-specialist-roles, source_plan=`plans/archive/plan-20260712-2215-agent-fleet-specialists.md`
- `tasks/workstreams/workflow-engine/contract-assets/cleanup-script-policy.md`: status=completed, current_slice=completed-20260529-cleanup-script-policy, source_plan=(none)
- `tasks/workstreams/workflow-engine/contract-assets/github-issues-158-159.md`: status=completed, current_slice=completed-20260805-packaged-helper-projection, source_plan=plans/plan-20260805-0001-github-issues-158-159.md
- `tasks/workstreams/workflow-engine/inspection-migration/20260703-inspection-migration.md`: status=completed, current_slice=completed-20260703-architecture-closeout, source_plan=(none)
## Handoff

- Exact Next Step: (none)

## Checks

- status=pass, source=verify-sprint, exit_code=0, file=.ai/harness/checks/latest.json

## Git Status

- Summary: 21 changed/untracked path(s)

```
 M assets/templates/helpers/refresh-current-status.sh
 M scripts/check-tarball-install-smoke.sh
 M scripts/refresh-current-status.sh
 M src/core/operator/fleet-snapshot.ts
 M src/effects/operator/server.ts
 M src/effects/repo-registry.ts
 M src/operator-web/App.tsx
 M src/operator-web/styles.css
 M src/operator-web/types.ts
 M tasks/current.md
 M tasks/todos.md
 M tests/cli/operator-serve.test.ts
 M tests/cli/registry.test.ts
 M tests/helper-scripts.test.ts
 M tests/operator-web/operator-interactions.test.tsx
 M tests/unit/operator-fleet-snapshot.test.ts
?? .ai/harness/failures/operator-connector-acceptance-repair-pre-fix.log
?? plans/plan-20260824-1757-operator-connector-acceptance-repair.md
?? tasks/contracts/20260824-1757-operator-connector-acceptance-repair.contract.md
?? tasks/notes/20260824-1757-operator-connector-acceptance-repair.notes.md
?? tasks/reviews/20260824-1757-operator-connector-acceptance-repair.review.md
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
