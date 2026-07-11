# Current Status Snapshot

<!-- generated-by: repo-harness refresh-current-status v1 -->
<!-- updated_at: 2026-07-12T05:46:36+0800 -->
<!-- stale_after: 24h -->

> **Status**: ManualClearedWithActiveWork
> **Updated At**: 2026-07-12T05:46:36+0800
> **Source Branch**: codex/adoption-apply-cutover-v1
> **Source Commit**: 788ba60
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

- /Users/kito/Projects/repo-harness-worktrees/bdd2-eval-foundation: plans/plan-20260712-0450-bdd2-eval-foundation.md
- /Users/kito/Projects/repo-harness-worktrees/bdd2-eval-foundation: active-worktree owner -> /Users/kito/Projects/repo-harness-worktrees/bdd2-eval-foundation
- /Users/kito/Projects/repo-harness-worktrees/chatgpt-coding-mcp-integration: plans/plan-20260712-0301-chatgpt-coding-mcp-integration.md
- /Users/kito/Projects/repo-harness-worktrees/chatgpt-coding-mcp-integration: active-worktree owner -> /Users/kito/Projects/repo-harness-worktrees/chatgpt-coding-mcp-integration
- /Users/kito/Projects/repo-harness-worktrees/native-role-capability-gate: plans/plan-20260712-0219-native-role-capability-gate.md
- /Users/kito/Projects/repo-harness-worktrees/native-role-capability-gate: active-worktree owner -> /Users/kito/Projects/repo-harness-worktrees/native-role-capability-gate
- /Users/kito/Projects/repo-harness-wt-codex-native-role-model-override: plans/plan-20260711-0219-codex-native-role-model-override.md
- /Users/kito/Projects/repo-harness-wt-codex-native-role-model-override: active-worktree owner -> /Users/kito/Projects/repo-harness-wt-codex-native-role-model-override
## Active Sprint

- Sprint: (none)
## Workstreams

- `tasks/workstreams/workflow-engine/contract-assets/cleanup-script-policy.md`: status=completed, current_slice=todo-01, source_plan=(none)
- `tasks/workstreams/workflow-engine/inspection-migration/20260703-inspection-migration.md`: status=active, current_slice=completed-20260703-architecture-closeout, source_plan=(none)
## Handoff

- Exact Next Step: (none)

## Checks

- status=pass, source=verify-sprint, exit_code=0, file=.ai/harness/checks/latest.json

## Git Status

- Summary: 69 changed/untracked path(s)

```
 M .ai/context/capabilities.json
 M .ai/harness/workflow-contract.json
 M AGENTS.md
 M CLAUDE.md
 M README.es.md
 M README.fr.md
 M README.ja.md
 M README.md
 M README.zh-CN.md
 M SKILL.md
 M assets/reference-configs/harness-overview.md
 M assets/reference-configs/hook-operations.md
 M assets/skill-commands/manifest.json
 M assets/skill-commands/repo-harness-architecture/SKILL.md
 M assets/skill-commands/repo-harness-capability/SKILL.md
 M assets/skill-commands/repo-harness-check/SKILL.md
 M assets/skill-commands/repo-harness-init/SKILL.md
 M assets/skill-commands/repo-harness-migrate/SKILL.md
 M assets/templates/helpers/architecture-queue.sh
 M assets/templates/helpers/check-task-workflow.sh
 D assets/templates/helpers/migrate-project-template.sh
 D assets/templates/helpers/migrate-workflow-docs.ts
 M assets/workflow-contract.v1.json
 M docs/architecture/domains/public-surface.md
 M docs/architecture/domains/verification.md
 M docs/architecture/domains/workflow-engine.md
 M docs/architecture/index.md
 M docs/architecture/modules/public-surface/adoption.md
 M docs/architecture/modules/public-surface/root-router.md
 M docs/architecture/modules/verification/evals-checks.md
 M docs/architecture/modules/workflow-engine/inspection-migration.md
 M docs/architecture/transactional-adoption-planner.md
 M docs/reference-configs/harness-overview.md
 M docs/reference-configs/hook-operations.md
 M evals/evals.json
 M references/evaluation-playbook.md
 M references/migration-guide.md
 M scripts/AGENTS.md
 M scripts/CLAUDE.md
 M scripts/architecture-queue.sh
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
