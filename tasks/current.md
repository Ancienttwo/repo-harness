# Current Status Snapshot

<!-- generated-by: repo-harness refresh-current-status v1 -->
<!-- updated_at: 2026-08-05T00:51:14+0800 -->
<!-- stale_after: 24h -->

> **Status**: Active
> **Updated At**: 2026-08-05T00:51:14+0800
> **Source Branch**: codex/github-issues-158-159
> **Source Commit**: d74e1775
> **Target Branch**: main
> **Stale After**: 24h
> **Reason**: github-issues-158-159-verified
> **Derived From**: active-plan, active-sprint, workstreams, handoff, checks, git status

This file is a tracked mainline snapshot derived from repo artifacts. It is not a live lock, not a kanban board, and not an implementation gate. If it is stale, read the source artifacts below.

## Current Focus

- Status: Active
- Active Plan: plans/plan-20260805-0001-github-issues-158-159.md
- Plan Status: Executing
- Next Task: (none)
- Clear Note: (none)

## Mainline Snapshot Reading

- Current worktree: `tasks/current.md`
- Target branch snapshot: `git show main:tasks/current.md`
- Rule: non-target worktrees may read the target branch snapshot, but must verify against source artifacts before acting.

## Active Work

- .: plans/plan-20260805-0001-github-issues-158-159.md
- .: active-worktree owner -> /Users/kito/Projects/repo-harness-wt-github-issues-158-159
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

- status=(none), source=(none), exit_code=(none), file=.ai/harness/checks/latest.json

## Git Status

- Summary: 34 changed/untracked path(s)

```
 M .ai/hooks/.projection.json
 M .ai/hooks/AGENTS.md
 M .ai/hooks/CLAUDE.md
 M AGENTS.md
 M CLAUDE.md
 M assets/AGENTS.md
 M assets/CLAUDE.md
 M assets/hooks/AGENTS.md
 M assets/hooks/CLAUDE.md
 M assets/templates/helpers/verify-sprint.sh
 M docs/architecture/modules/runtime-harness/hook-adapters.md
 M docs/architecture/modules/verification/evals-checks.md
 M docs/architecture/modules/workflow-engine/contract-assets.md
 M scripts/verify-sprint.sh
 M src/cli/hook/mutation-guard.ts
 M src/core/state/artifact-parsers.ts
 M src/core/state/project-effective-state.ts
 M src/core/workflow/operation-readiness.ts
 M src/effects/state/collect-state-inputs.ts
 M src/effects/state/resolve-effective-state.ts
 M tasks/todos.md
 M tests/helper-scripts.test.ts
 M tests/mutation-guard.test.ts
 M tests/state/loop-semantics-characterization.test.ts
 M tests/state/operation-readiness.test.ts
 M tests/state/project-effective-state.test.ts
?? docs/architecture/requests/archive/2026/20260805-001621-runtime-harness-hook-adapters.md
?? plans/plan-20260805-0001-github-issues-158-159.md
?? tasks/contracts/20260805-0001-github-issues-158-159.contract.md
?? tasks/notes/20260805-0001-github-issues-158-159.notes.md
?? tasks/reviews/20260805-0001-github-issues-158-159.review.md
?? tasks/workstreams/runtime-harness/
?? tasks/workstreams/verification/
?? tasks/workstreams/workflow-engine/contract-assets/github-issues-158-159.md
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
