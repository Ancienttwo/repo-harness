# Current Status Snapshot

<!-- generated-by: repo-harness refresh-current-status v1 -->
<!-- updated_at: 2026-06-19T19:33:03+0800 -->
<!-- stale_after: 24h -->

> **Status**: Active
> **Updated At**: 2026-06-19T19:33:03+0800
> **Source Branch**: codex/delegation-hooks
> **Source Commit**: 52103a6
> **Target Branch**: main
> **Stale After**: 24h
> **Reason**: codex-delegation-hooks
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

- /Users/ancienttwo/Projects/agentic-dev-wt-think-plan-000127: plans/plan-20260617-0010-think-plan-000127.md
- /Users/ancienttwo/Projects/agentic-dev-wt-think-plan-000127: active-worktree owner -> /Users/ancienttwo/Projects/agentic-dev-wt-think-plan-000127
## Active Sprint

- Sprint: (none)
## Workstreams

- `tasks/workstreams/workflow-engine/contract-assets/cleanup-script-policy.md`: status=completed, current_slice=todo-01, source_plan=(none)
## Handoff

- Exact Next Step: Clean up merged contract worktree codex/think-plan-000127. Command: bash scripts/contract-worktree.sh cleanup --slug think-plan-000127 --target main

## Checks

- status=(none), source=(none), exit_code=(none), file=.ai/harness/checks/latest.json

## Git Status

- Summary: 38 changed/untracked path(s)

```
 M .ai/harness/policy.json
 M .ai/harness/workflow-contract.json
 M .ai/hooks/run-hook.sh
 M .ai/hooks/stop-orchestrator.sh
 M .gitignore
 M assets/hooks/codex.hooks.template.json
 M assets/hooks/run-hook.sh
 M assets/hooks/settings.template.json
 M assets/hooks/stop-orchestrator.sh
 M assets/reference-configs/hook-operations.md
 M assets/skill-commands/repo-harness-goal/SKILL.md
 M assets/templates/helpers/ensure-task-workflow.sh
 M assets/workflow-contract.v1.json
 M bun.lock
 M docs/architecture/modules/runtime-harness/hook-adapters.md
 M docs/reference-configs/hook-operations.md
 M scripts/ensure-task-workflow.sh
 M scripts/hook-dispatch-diet-report.ts
 M scripts/lib/project-init-lib.sh
 M src/cli/hook/route-registry.ts
 M src/cli/hook/runtime.ts
 M src/core/adoption/gitignore-plan.ts
 M tasks/current.md
 M tests/cli/hook.test.ts
 M tests/cli/init-hook.test.ts
 M tests/cli/install.test.ts
 M tests/cli/route-registry.test.ts
 M tests/cli/status.test.ts
 M tests/hook-contracts.test.ts
 M tests/run-skill-evals.test.ts
 M tests/scaffold-parity.test.ts
?? .ai/harness/delegation/
?? .ai/hooks/codex-delegation-advisor.sh
?? .ai/hooks/subagent-start-context.sh
?? .ai/hooks/subagent-stop-quality.sh
?? assets/hooks/codex-delegation-advisor.sh
?? assets/hooks/subagent-start-context.sh
?? assets/hooks/subagent-stop-quality.sh
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
