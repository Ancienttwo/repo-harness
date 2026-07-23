# Current Status Snapshot

<!-- generated-by: repo-harness refresh-current-status v1 -->
<!-- updated_at: 2026-07-24T06:20:56+0800 -->
<!-- stale_after: 24h -->

> **Status**: Active
> **Updated At**: 2026-07-24T06:20:56+0800
> **Source Branch**: codex/codex-native-profile-aware-status
> **Source Commit**: ebdc94a0
> **Target Branch**: main
> **Stale After**: 24h
> **Reason**: merge-main
> **Derived From**: active-plan, active-sprint, workstreams, handoff, checks, git status

This file is a tracked mainline snapshot derived from repo artifacts. It is not a live lock, not a kanban board, and not an implementation gate. If it is stale, read the source artifacts below.

## Current Focus

- Status: Active
- Active Plan: plans/plan-20260724-0427-codex-native-profile-aware-status.md
- Plan Status: Review
- Next Task: (none)
- Clear Note: (none)

## Mainline Snapshot Reading

- Current worktree: `tasks/current.md`
- Target branch snapshot: `git show main:tasks/current.md`
- Rule: non-target worktrees may read the target branch snapshot, but must verify against source artifacts before acting.

## Active Work

- .: plans/plan-20260724-0427-codex-native-profile-aware-status.md
- .: active-worktree owner -> /Users/kito/Projects/repo-harness-wt-codex-native-profile-aware-status
## Active Sprint

- Sprint: (none)
## Workstreams

- `tasks/workstreams/workflow-engine/contract-assets/20260712-contract-assets.md`: status=completed, current_slice=completed-20260712-repo-owned-agent-fleet, source_plan=`plans/archive/plan-20260712-2053-repo-owned-agent-fleet.md`
- `tasks/workstreams/workflow-engine/contract-assets/20260714-merge-gate-enforcement.md`: status=completed, current_slice=completed-20260715-merge-gate-enforcement, source_plan=`plans/archive/plan-20260714-1713-merge-gate-enforcement.md`
- `tasks/workstreams/workflow-engine/contract-assets/agent-fleet-specialists.md`: status=completed, current_slice=completed-20260713-specialist-roles, source_plan=`plans/archive/plan-20260712-2215-agent-fleet-specialists.md`
- `tasks/workstreams/workflow-engine/contract-assets/cleanup-script-policy.md`: status=completed, current_slice=completed-20260529-cleanup-script-policy, source_plan=(none)
- `tasks/workstreams/workflow-engine/inspection-migration/20260703-inspection-migration.md`: status=completed, current_slice=completed-20260703-architecture-closeout, source_plan=(none)
- `tasks/workstreams/workflow-engine/inspection-migration/20260712-inspection-migration.md`: status=completed, current_slice=completed-20260712-repo-owned-agent-fleet, source_plan=`plans/archive/plan-20260712-2053-repo-owned-agent-fleet.md`
- `tasks/workstreams/workflow-engine/inspection-migration/agent-fleet-specialists.md`: status=completed, current_slice=completed-20260713-policy-seed, source_plan=`plans/archive/plan-20260712-2215-agent-fleet-specialists.md`
## Handoff

- Exact Next Step: (none)

## Checks

- status=(none), source=(none), exit_code=(none), file=.ai/harness/checks/latest.json

## Git Status

- Summary: 33 changed/untracked path(s)

```
M  .ai/harness/policy.json
M  .ai/harness/workflow-contract.json
M  .ai/hooks/.projection.json
M  .ai/hooks/lib/workflow-state.sh
M  assets/hooks/lib/workflow-state.sh
M  assets/templates/helpers/archive-workflow.sh
M  assets/templates/helpers/check-task-workflow.sh
A  assets/templates/helpers/classify-historical-plans.ts
M  assets/templates/helpers/ensure-task-workflow.sh
M  assets/workflow-contract.v1.json
A  plans/archive/plan-20260724-0324-workflow-status-archive-authority.md
M  scripts/archive-workflow.sh
M  scripts/check-task-workflow.sh
A  scripts/classify-historical-plans.ts
M  scripts/ensure-task-workflow.sh
M  scripts/lib/project-init-lib.sh
M  src/cli/hook/mutation-guard.ts
M  src/core/adoption/standard-plan.ts
A  tasks/archive/contract-20260724-0433-workflow-status-archive-authority.md
A  tasks/archive/notes-20260724-0433-workflow-status-archive-authority.md
A  tasks/archive/review-20260724-0433-workflow-status-archive-authority.md
A  tasks/archive/todo-20260724-0433-workflow-status-archive-authority.md
M  tasks/current.md
M  tasks/todos.md
M  tests/archive-evidence-gates.test.ts
M  tests/helper-scripts.test.ts
A  tests/historical-plan-classifier.test.ts
M  tests/mutation-guard.test.ts
M  tests/plan-status-gate.test.ts
M  tests/runtime-profile-enforcement.test.ts
M  tests/skill-surface/retired-names-scan.test.ts
M  tests/state/loop-semantics-characterization.test.ts
M  tests/workflow-state-lib.test.ts
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
