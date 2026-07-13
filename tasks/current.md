# Current Status Snapshot

<!-- generated-by: repo-harness refresh-current-status v1 -->
<!-- updated_at: 2026-07-14T05:25:16+0800 -->
<!-- stale_after: 24h -->

> **Status**: Active
> **Updated At**: 2026-07-14T05:25:16+0800
> **Source Branch**: codex/verifier-evidence-lifecycle-cutover
> **Source Commit**: e3d35b75
> **Target Branch**: main
> **Stale After**: 24h
> **Reason**: verifier-evidence-lifecycle-cutover
> **Derived From**: active-plan, active-sprint, workstreams, handoff, checks, git status

This file is a tracked mainline snapshot derived from repo artifacts. It is not a live lock, not a kanban board, and not an implementation gate. If it is stale, read the source artifacts below.

## Current Focus

- Status: Active
- Active Plan: plans/plan-20260714-0421-verifier-evidence-lifecycle-cutover.md
- Plan Status: Executing
- Next Task: Run exactly one final authoritative 3x9 matrix for the frozen benchmark subject.
- Clear Note: (none)

## Mainline Snapshot Reading

- Current worktree: `tasks/current.md`
- Target branch snapshot: `git show main:tasks/current.md`
- Rule: non-target worktrees may read the target branch snapshot, but must verify against source artifacts before acting.

## Active Work

- .: plans/plan-20260714-0421-verifier-evidence-lifecycle-cutover.md
- .: active-worktree owner -> /Users/kito/Projects/repo-harness-wt-verifier-evidence-lifecycle-cutover
- /Users/kito/Projects/repo-harness-worktrees/bdd3-ps1-inception: plans/plan-20260714-0512-bdd3-ps1-protected-shape-ledger.md
- /Users/kito/Projects/repo-harness-worktrees/bdd3-ps1-inception: active-worktree owner -> /Users/kito/Projects/repo-harness-worktrees/bdd3-ps1-inception
- /Users/kito/Projects/repo-harness-worktrees/harness-cost-baseline-slo-closeout: plans/plan-20260712-2327-harness-kernel-reduction.md
- /Users/kito/Projects/repo-harness-worktrees/harness-cost-baseline-slo-closeout: active-worktree owner -> /Users/kito/Projects/repo-harness-worktrees/harness-cost-baseline-slo-closeout
- /Users/kito/Projects/repo-harness-worktrees/harness-cost-baseline-slo-final: plans/plan-20260712-2327-harness-kernel-reduction.md
- /Users/kito/Projects/repo-harness-worktrees/harness-cost-baseline-slo-final: active-worktree owner -> /Users/kito/Projects/repo-harness-worktrees/harness-cost-baseline-slo-final
- /Users/kito/Projects/repo-harness-wt-codex-native-role-model-override: plans/plan-20260711-0219-codex-native-role-model-override.md
- /Users/kito/Projects/repo-harness-wt-codex-native-role-model-override: active-worktree owner -> /Users/kito/Projects/repo-harness-wt-codex-native-role-model-override
- /Users/kito/Projects/repo-harness-wt-verification-evidence-decoupling: plans/plan-20260714-0430-verification-evidence-decoupling.md
- /Users/kito/Projects/repo-harness-wt-verification-evidence-decoupling: active-worktree owner -> /Users/kito/Projects/repo-harness-wt-verification-evidence-decoupling
- /Users/kito/Projects/repo-harness/.claude/worktrees/agent-ae14c20f2b5dac4a3: plans/plan-20260712-1642-adaptive-lite-hook-routing.md
- /Users/kito/Projects/repo-harness/.claude/worktrees/agent-ae14c20f2b5dac4a3: active-worktree owner -> /Users/kito/Projects/repo-harness/.claude/worktrees/agent-ae14c20f2b5dac4a3
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

- Exact Next Step: (none)

## Checks

- status=(none), source=(none), exit_code=(none), file=.ai/harness/checks/latest.json

## Git Status

- Summary: 61 changed/untracked path(s)

```
 M .ai/context/capabilities.json
 M .ai/harness/workflow-contract.json
 M .ai/hooks/.projection.json
 M .ai/hooks/lib/workflow-state.sh
 M .ai/hooks/prompt-guard.sh
 M .claude/templates/contract.template.md
 M .claude/templates/review.template.md
 M assets/hooks/lib/workflow-state.sh
 M assets/hooks/prompt-guard.sh
 M assets/reference-configs/hook-operations.md
 M assets/reference-configs/sprint-contracts.md
 M assets/templates/contract.template.md
 M assets/templates/helpers/archive-workflow.sh
 M assets/templates/helpers/contract-worktree.sh
 M assets/templates/helpers/ensure-task-workflow.sh
 M assets/templates/helpers/plan-to-todo.sh
 M assets/templates/helpers/ship-worktrees.sh
 M assets/templates/helpers/verify-contract.sh
 M assets/templates/helpers/verify-sprint.sh
 M assets/templates/review.template.md
 M assets/workflow-contract.v1.json
 M docs/architecture/modules/runtime-harness/hook-adapters.md
 M docs/architecture/modules/verification/evals-checks.md
 M docs/architecture/modules/workflow-engine/contract-assets.md
 M docs/reference-configs/hook-operations.md
 M docs/reference-configs/sprint-contracts.md
 M docs/spec.md
 M scripts/archive-workflow.sh
 M scripts/contract-worktree.sh
 M scripts/ensure-task-workflow.sh
 M scripts/lib/project-init-lib.sh
 M scripts/plan-to-todo.sh
 M scripts/run-harness-profile-benchmark.ts
 M scripts/ship-worktrees.sh
 M scripts/verify-contract.sh
 M scripts/verify-sprint.sh
 M src/cli/hook-entry.ts
 M src/cli/hook/diff-fingerprint.ts
 M src/cli/hook/state-snapshot.ts
 M src/cli/index.ts
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
