# Current Status Snapshot

<!-- generated-by: repo-harness refresh-current-status v1 -->
<!-- updated_at: 2026-07-22T15:29:54+0800 -->
<!-- stale_after: 24h -->

> **Status**: Active
> **Updated At**: 2026-07-22T15:29:54+0800
> **Source Branch**: codex/terminal-plans-sweep-integration
> **Source Commit**: cbeee53e
> **Target Branch**: main
> **Stale After**: 24h
> **Reason**: manual
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

- /Users/kito/Projects/repo-harness-wt-epc-01-evidence-event-store: plans/plan-20260722-1151-epc-01-evidence-event-store.md
- /Users/kito/Projects/repo-harness-wt-epc-01-evidence-event-store: active-worktree owner -> /Users/kito/Projects/repo-harness-wt-epc-01-evidence-event-store
- /Users/kito/Projects/repo-harness-wt-terminal-plans-sweep: plans/plan-20260722-0350-terminal-plans-sweep.md
- /Users/kito/Projects/repo-harness-wt-terminal-plans-sweep: active-worktree owner -> /Users/kito/Projects/repo-harness-wt-terminal-plans-sweep
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

- status=(none), source=(none), file=.ai/harness/checks/latest.json

## Git Status

- Summary: 30 changed/untracked path(s)

```
M  .ai/hooks/.projection.json
M  .ai/hooks/lib/workflow-state.sh
M  assets/hooks/lib/workflow-state.sh
M  evals/harness/reports/profile-comparison.json
M  evals/harness/reports/profile-comparison.md
M  evals/harness/reports/profile-comparison.sha256.json
A  plans/plan-20260721-2237-vgbr-benchmark-runner-subject-immutability.md
M  plans/plan-20260722-0020-vgbr-post-hrd-baseline-recovery.md
A  plans/plan-20260722-0538-receipt-subject-target-split.md
A  plans/plan-20260722-1107-epc-00-program-canonicalization.md
M  plans/sprints/20260722-0001-evidence-projection-convergence.sprint.md
M  scripts/run-harness-profile-benchmark.ts
M  src/cli/hook/prompt-handler.ts
A  tasks/contracts/20260721-2237-vgbr-benchmark-runner-subject-immutability.contract.md
A  tasks/contracts/20260722-0020-vgbr-post-hrd-baseline-recovery.contract.md
A  tasks/contracts/20260722-0538-receipt-subject-target-split.contract.md
A  tasks/contracts/20260722-1107-epc-00-program-canonicalization.contract.md
M  tasks/current.md
A  tasks/notes/20260721-2237-vgbr-benchmark-runner-subject-immutability.notes.md
A  tasks/notes/20260722-0020-vgbr-post-hrd-baseline-recovery.notes.md
A  tasks/notes/20260722-0538-receipt-subject-target-split.notes.md
A  tasks/notes/20260722-1107-epc-00-program-canonicalization.notes.md
A  tasks/reviews/20260721-2237-vgbr-benchmark-runner-subject-immutability.review.md
A  tasks/reviews/20260722-0020-vgbr-post-hrd-baseline-recovery.review.md
A  tasks/reviews/20260722-0538-receipt-subject-target-split.review.md
A  tasks/reviews/20260722-1107-epc-00-program-canonicalization.review.md
M  tasks/todos.md
M  tests/harness-benchmark-matrix.test.ts
M  tests/prompt-handler.test.ts
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
