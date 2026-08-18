# Current Status Snapshot

<!-- generated-by: repo-harness refresh-current-status v1 -->
<!-- updated_at: 2026-08-19T00:56:04+0800 -->
<!-- stale_after: 24h -->

> **Status**: Active
> **Updated At**: 2026-08-19T00:56:04+0800
> **Source Branch**: main
> **Source Commit**: 1dbe446c
> **Target Branch**: main
> **Stale After**: 24h
> **Reason**: ledger closeout: archive superseded and completed delegation-layer plans
> **Derived From**: active-plan, active-sprint, workstreams, handoff, checks, git status

This file is a tracked mainline snapshot derived from repo artifacts. It is not a live lock, not a kanban board, and not an implementation gate. If it is stale, read the source artifacts below.

## Current Focus

- Status: Active
- Active Plan: (none)
- Plan Status: (none)
- Next Task: inspect active worktree marker(s)
- Clear Note: (none)

## Mainline Snapshot Reading

- Current worktree: `tasks/current.md`
- Target branch snapshot: `git show main:tasks/current.md`
- Rule: non-target worktrees may read the target branch snapshot, but must verify against source artifacts before acting.

## Active Work

- /Users/ancienttwo/Projects/repo-harness-wt-codegraph-mandatory-runtime: plans/plan-20260816-2010-codegraph-mandatory-runtime.md
- /Users/ancienttwo/Projects/repo-harness-wt-codegraph-mandatory-runtime: active-worktree owner -> /Users/ancienttwo/Projects/repo-harness-wt-codegraph-mandatory-runtime
- /Users/ancienttwo/Projects/repo-harness-wt-shared-lease-protocol: plans/plan-20260818-1156-shared-lease-protocol.md
- /Users/ancienttwo/Projects/repo-harness-wt-shared-lease-protocol: active-worktree owner -> /Users/ancienttwo/Projects/repo-harness-wt-shared-lease-protocol
- /Users/ancienttwo/Projects/repo-harness-wt-subagent-long-command-guardrail: plans/plan-20260819-0049-subagent-long-command-guardrail.md
- /Users/ancienttwo/Projects/repo-harness-wt-subagent-long-command-guardrail: active-worktree owner -> /Users/ancienttwo/Projects/repo-harness-wt-subagent-long-command-guardrail
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

- Summary: 23 changed/untracked path(s)

```
RM plans/plan-20260616-HE-06-handoff-current-ux.md -> plans/archive/plan-20260616-HE-06-handoff-current-ux.md
RM plans/plan-20260616-HE-07-delegation-kappa-v2.md -> plans/archive/plan-20260616-HE-07-delegation-kappa-v2.md
RM plans/plan-20260705-0426-file-coupled-delegation-phase2.md -> plans/archive/plan-20260705-0426-file-coupled-delegation-phase2.md
 D plans/plan-20260711-0219-codex-native-role-model-override.md
 D plans/plan-20260802-0309-codex-app-thread-dispatch.md
 D tasks/contracts/20260711-0219-codex-native-role-model-override.contract.md
 D tasks/contracts/20260802-0309-codex-app-thread-dispatch.contract.md
 M tasks/current.md
 D tasks/notes/20260711-0219-codex-native-role-model-override.notes.md
 D tasks/notes/20260802-0309-codex-app-thread-dispatch.notes.md
 D tasks/reviews/20260711-0219-codex-native-role-model-override.review.md
 D tasks/reviews/20260802-0309-codex-app-thread-dispatch.review.md
 M tasks/todos.md
?? plans/archive/plan-20260711-0219-codex-native-role-model-override.md
?? plans/archive/plan-20260802-0309-codex-app-thread-dispatch.md
?? tasks/archive/contract-20260819-0054-codex-app-thread-dispatch.md
?? tasks/archive/contract-20260819-0054-codex-native-role-model-override.md
?? tasks/archive/notes-20260819-0054-codex-app-thread-dispatch.md
?? tasks/archive/notes-20260819-0054-codex-native-role-model-override.md
?? tasks/archive/review-20260819-0054-codex-app-thread-dispatch.md
?? tasks/archive/review-20260819-0054-codex-native-role-model-override.md
?? tasks/archive/todo-20260819-0054-codex-app-thread-dispatch.md
?? tasks/archive/todo-20260819-0054-codex-native-role-model-override.md
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
