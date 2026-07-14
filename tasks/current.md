# Current Status Snapshot

<!-- generated-by: repo-harness refresh-current-status v1 -->
<!-- updated_at: 2026-07-14T13:39:01+0800 -->
<!-- stale_after: 24h -->

> **Status**: ManualClearedWithActiveWork
> **Updated At**: 2026-07-14T13:39:01+0800
> **Source Branch**: codex/verification-evidence-decoupling
> **Source Commit**: da73a667
> **Target Branch**: main
> **Stale After**: 24h
> **Reason**: archive-workflow
> **Derived From**: active-plan, active-sprint, workstreams, handoff, checks, git status

This file is a tracked mainline snapshot derived from repo artifacts. It is not a live lock, not a kanban board, and not an implementation gate. If it is stale, read the source artifacts below.

## Current Focus

- Status: ManualClearedWithActiveWork
- Active Plan: (none)
- Plan Status: (none)
- Next Task: inspect active worktree marker(s)
- Clear Note: Manual clear requested, but active work markers still exist. Idle was not written.

## Mainline Snapshot Reading

- Current worktree: `tasks/current.md`
- Target branch snapshot: `git show main:tasks/current.md`
- Rule: non-target worktrees may read the target branch snapshot, but must verify against source artifacts before acting.

## Active Work

- /Users/kito/Projects/repo-harness-wt-verifier-evidence-lifecycle-cutover: plans/plan-20260714-0421-verifier-evidence-lifecycle-cutover.md
- /Users/kito/Projects/repo-harness-wt-verifier-evidence-lifecycle-cutover: active-worktree owner -> /Users/kito/Projects/repo-harness-wt-verifier-evidence-lifecycle-cutover
## Active Sprint

- Sprint: (none)
## Workstreams

- `tasks/workstreams/workflow-engine/contract-assets/20260712-contract-assets.md`: status=active, current_slice=todo-01, source_plan=(none)
- `tasks/workstreams/workflow-engine/contract-assets/agent-fleet-specialists.md`: status=completed, current_slice=completed-20260713-specialist-roles, source_plan=plans/plan-20260712-2215-agent-fleet-specialists.md
- `tasks/workstreams/workflow-engine/contract-assets/cleanup-script-policy.md`: status=completed, current_slice=todo-01, source_plan=(none)
- `tasks/workstreams/workflow-engine/inspection-migration/20260703-inspection-migration.md`: status=active, current_slice=completed-20260703-architecture-closeout, source_plan=(none)
- `tasks/workstreams/workflow-engine/inspection-migration/20260712-inspection-migration.md`: status=active, current_slice=todo-01, source_plan=(none)
- `tasks/workstreams/workflow-engine/inspection-migration/agent-fleet-specialists.md`: status=completed, current_slice=completed-20260713-policy-seed, source_plan=plans/plan-20260712-2215-agent-fleet-specialists.md
## Handoff

- Exact Next Step: Review/checks pass; finish and fast-forward merge this contract worktree. Command: repo-harness run contract-worktree finish

## Checks

- status=pass, source=verify-sprint, exit_code=0, file=.ai/harness/checks/latest.json

## Git Status

- Summary: 10 changed/untracked path(s)

```
 D plans/plan-20260714-0430-verification-evidence-decoupling.md
 D tasks/contracts/20260714-0430-verification-evidence-decoupling.contract.md
 D tasks/notes/20260714-0430-verification-evidence-decoupling.notes.md
 D tasks/reviews/20260714-0430-verification-evidence-decoupling.review.md
 M tasks/todos.md
?? plans/archive/plan-20260714-0430-verification-evidence-decoupling.md
?? tasks/archive/contract-20260714-1339-verification-evidence-decoupling.md
?? tasks/archive/notes-20260714-1339-verification-evidence-decoupling.md
?? tasks/archive/review-20260714-1339-verification-evidence-decoupling.md
?? tasks/archive/todo-20260714-1339-verification-evidence-decoupling.md
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
