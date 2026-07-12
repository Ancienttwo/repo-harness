# Current Status Snapshot

<!-- generated-by: repo-harness refresh-current-status v1 -->
<!-- updated_at: 2026-07-12T23:35:51+0800 -->
<!-- stale_after: 24h -->

> **Status**: ManualClearedWithActiveWork
> **Updated At**: 2026-07-12T23:35:51+0800
> **Source Branch**: codex/chatgpt-coding-mcp-closeout
> **Source Commit**: f7db295
> **Target Branch**: main
> **Stale After**: 24h
> **Reason**: chatgpt-coding-mcp-latest-main-merge
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

- /Users/kito/Projects/repo-harness: plans/plan-20260712-2103-agent-fleet-worker-routing-telemetry.md
- /Users/kito/Projects/repo-harness: active-worktree owner -> /Users/kito/Projects/repo-harness
- /Users/kito/Projects/repo-harness-worktrees/agent-fleet-specialists: plans/plan-20260712-2215-agent-fleet-specialists.md
- /Users/kito/Projects/repo-harness-worktrees/agent-fleet-specialists: active-worktree owner -> /Users/kito/Projects/repo-harness-worktrees/agent-fleet-specialists
- /Users/kito/Projects/repo-harness-worktrees/bdd2-eval-foundation: plans/plan-20260712-0450-bdd2-eval-foundation.md
- /Users/kito/Projects/repo-harness-worktrees/bdd2-eval-foundation: active-worktree owner -> /Users/kito/Projects/repo-harness-worktrees/bdd2-eval-foundation
- /Users/kito/Projects/repo-harness-worktrees/bdd2-shape-experiment: plans/plan-20260712-0605-bdd2-e-02-run-experiment-s-shape-hypothesis.md
- /Users/kito/Projects/repo-harness-worktrees/bdd2-shape-experiment: active-worktree owner -> /Users/kito/Projects/repo-harness-worktrees/bdd2-shape-experiment
- /Users/kito/Projects/repo-harness-worktrees/harness-cost-baseline-slo: plans/plan-20260712-2327-harness-kernel-reduction.md
- /Users/kito/Projects/repo-harness-worktrees/harness-cost-baseline-slo: active-worktree owner -> /Users/kito/Projects/repo-harness-worktrees/harness-cost-baseline-slo
- /Users/kito/Projects/repo-harness-worktrees/native-role-capability-gate: plans/plan-20260712-0219-native-role-capability-gate.md
- /Users/kito/Projects/repo-harness-worktrees/native-role-capability-gate: active-worktree owner -> /Users/kito/Projects/repo-harness-worktrees/native-role-capability-gate
- /Users/kito/Projects/repo-harness-worktrees/repo-owned-agent-fleet: plans/plan-20260712-2053-repo-owned-agent-fleet.md
- /Users/kito/Projects/repo-harness-worktrees/repo-owned-agent-fleet: active-worktree owner -> /Users/kito/Projects/repo-harness-worktrees/repo-owned-agent-fleet
- /Users/kito/Projects/repo-harness-worktrees/upgrade-bun-1-3-14: plans/plan-20260712-1330-bun-1-3-14-runtime-upgrade.md
- /Users/kito/Projects/repo-harness-worktrees/upgrade-bun-1-3-14: active-worktree owner -> /Users/kito/Projects/repo-harness-worktrees/upgrade-bun-1-3-14
- /Users/kito/Projects/repo-harness-wt-codex-native-role-model-override: plans/plan-20260711-0219-codex-native-role-model-override.md
- /Users/kito/Projects/repo-harness-wt-codex-native-role-model-override: active-worktree owner -> /Users/kito/Projects/repo-harness-wt-codex-native-role-model-override
- /Users/kito/Projects/repo-harness/.claude/worktrees/agent-ae14c20f2b5dac4a3: plans/plan-20260712-1642-adaptive-lite-hook-routing.md
- /Users/kito/Projects/repo-harness/.claude/worktrees/agent-ae14c20f2b5dac4a3: active-worktree owner -> /Users/kito/Projects/repo-harness/.claude/worktrees/agent-ae14c20f2b5dac4a3
## Active Sprint

- Sprint: (none)
## Workstreams

- `tasks/workstreams/workflow-engine/contract-assets/cleanup-script-policy.md`: status=completed, current_slice=todo-01, source_plan=(none)
- `tasks/workstreams/workflow-engine/inspection-migration/20260703-inspection-migration.md`: status=active, current_slice=completed-20260703-architecture-closeout, source_plan=(none)
## Handoff

- Exact Next Step: Clean up merged contract worktree codex/code-authority-foundation-v1. Command: repo-harness run contract-worktree cleanup --slug code-authority-foundation-v1 --target main

## Checks

- status=pass, source=verify-sprint, exit_code=0, file=.ai/harness/checks/latest.json

## Git Status

- Summary: 33 changed/untracked path(s)

```
M  .ai/context/capabilities.json
M  assets/templates/helpers/contract-run.ts
M  docs/architecture/modules/workflow-engine/contract-assets.md
M  evals/bdd2/evaluation-manifest.json
A  evals/bdd2/metrics/audit-metrics.md
A  evals/bdd2/reports/experiment-a-evidence.json
A  evals/bdd2/reports/experiment-a.md
A  evals/bdd2/reports/phase-e-gate.md
A  evals/bdd2/rubrics/audit-score.schema.json
M  evals/bdd2/rubrics/blind-adjudication.md
R  evals/bdd2/rubrics/score.schema.json -> evals/bdd2/rubrics/shape-score.schema.json
M  evals/bdd2/tasks/held-out.json
M  evals/bdd2/truth/held-out.json
A  plans/archive/plan-20260712-2213-bdd2-e-06-record-phase-e-gate-decision.md
A  plans/plan-20260712-1811-bdd2-e-03-run-experiment-a-audit-hypothesis.md
A  plans/plan-20260712-2103-agent-fleet-worker-routing-telemetry.md
M  plans/sprints/20260712-bdd2-phase-e-evaluation.sprint.md
M  scripts/contract-run.ts
M  scripts/run-bdd2-evals.ts
A  tasks/archive/contract-20260712-2242-bdd2-e-06-record-phase-e-gate-decision.md
A  tasks/archive/notes-20260712-2242-bdd2-e-06-record-phase-e-gate-decision.md
A  tasks/archive/review-20260712-2242-bdd2-e-06-record-phase-e-gate-decision.md
A  tasks/archive/todo-20260712-2242-bdd2-e-06-record-phase-e-gate-decision.md
A  tasks/contracts/20260712-1811-bdd2-e-03-run-experiment-a-audit-hypothesis.contract.md
A  tasks/contracts/20260712-2103-agent-fleet-worker-routing-telemetry.contract.md
UU tasks/current.md
A  tasks/notes/20260712-1811-bdd2-e-03-run-experiment-a-audit-hypothesis.notes.md
A  tasks/notes/20260712-2103-agent-fleet-worker-routing-telemetry.notes.md
A  tasks/reviews/20260712-1811-bdd2-e-03-run-experiment-a-audit-hypothesis.review.md
A  tasks/reviews/20260712-2103-agent-fleet-worker-routing-telemetry.review.md
M  tests/bdd2-evals-contract.test.ts
M  tests/contract-run.test.ts
M  tests/run-bdd2-evals.test.ts
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
