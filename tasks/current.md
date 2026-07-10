# Current Status Snapshot

<!-- generated-by: repo-harness refresh-current-status v1 -->
<!-- updated_at: 2026-07-11T04:50:53+0800 -->
<!-- stale_after: 24h -->

> **Status**: ManualClearedWithActiveWork
> **Updated At**: 2026-07-11T04:50:53+0800
> **Source Branch**: codex/code-authority-foundation-v1
> **Source Commit**: e020e01
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

- /Users/kito/Projects/repo-harness-wt-chatgpt-coding-mcp: plans/plan-20260711-0137-chatgpt-coding-mcp.md
- /Users/kito/Projects/repo-harness-wt-chatgpt-coding-mcp: active-worktree owner -> /Users/kito/Projects/repo-harness-wt-chatgpt-coding-mcp
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

- Summary: 109 changed/untracked path(s)

```
 M .ai/context/capabilities.json
 M AGENTS.md
 M CLAUDE.md
 D assets/hooks/codex.hooks.template.json
 M assets/hooks/projection.json
 D assets/hooks/settings.template.json
 M assets/reference-configs/document-generation.md
 M assets/reference-configs/global-working-rules.md
 M assets/reference-configs/hook-operations.md
 M assets/skill-commands/repo-harness-architecture/SKILL.md
 M assets/templates/helpers/architecture-event.ts
 M assets/templates/helpers/architecture-queue.sh
 M assets/templates/helpers/archive-architecture-request.sh
 M assets/templates/helpers/archive-workflow.sh
 M assets/templates/helpers/capability-config.ts
 M assets/templates/helpers/capability-resolver.ts
 M assets/templates/helpers/check-agent-tooling.sh
 M assets/templates/helpers/check-context-files.sh
 M assets/templates/helpers/check-skill-version.ts
 M assets/templates/helpers/check-task-sync.sh
 M assets/templates/helpers/codex-handoff-resume.sh
 M assets/templates/helpers/contract-run.ts
 M assets/templates/helpers/contract-worktree.sh
 M assets/templates/helpers/maintenance-triage.sh
 M assets/templates/helpers/migrate-project-template.sh
 M assets/templates/helpers/new-spec.sh
 M assets/templates/helpers/new-sprint.sh
 M assets/templates/helpers/prepare-codex-handoff.sh
 M assets/templates/helpers/prepare-handoff.sh
 M assets/templates/helpers/summarize-failures.sh
 M assets/templates/helpers/verify-contract.sh
 M assets/templates/helpers/verify-sprint.sh
 M assets/templates/helpers/workflow-contract.ts
 M bun.lock
 M docs/architecture/index.md
 M docs/architecture/modules/verification/codegraph-readiness.md
 M docs/architecture/modules/workflow-engine/contract-assets.md
 M docs/architecture/modules/workflow-engine/inspection-migration.md
 M docs/architecture/transactional-adoption-planner.md
 M docs/reference-configs/document-generation.md
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
