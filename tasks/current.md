# Current Status Snapshot

<!-- generated-by: repo-harness refresh-current-status v1 -->
<!-- updated_at: 2026-07-10T02:30:00+0800 -->
<!-- stale_after: 24h -->

> **Status**: Idle
> **Updated At**: 2026-07-10T02:30:00+0800
> **Source Branch**: main
> **Source Commit**: 55709e9
> **Target Branch**: main
> **Stale After**: 24h
> **Reason**: ensure-task-workflow
> **Derived From**: active-plan, active-sprint, workstreams, handoff, checks, git status

This file is a tracked mainline snapshot derived from repo artifacts. It is not a live lock, not a kanban board, and not an implementation gate. If it is stale, read the source artifacts below.

## Current Focus

- Status: Idle
- Active Plan: (none)
- Plan Status: (none)
- Next Task: (none)
- Clear Note: (none)

## Mainline Snapshot Reading

- Current worktree: `tasks/current.md`
- Target branch snapshot: `git show main:tasks/current.md`
- Rule: non-target worktrees may read the target branch snapshot, but must verify against source artifacts before acting.

## Active Work

- (none)
## Active Sprint

- Sprint: (none)
## Workstreams

- `tasks/workstreams/workflow-engine/contract-assets/cleanup-script-policy.md`: status=completed, current_slice=todo-01, source_plan=(none)
- `tasks/workstreams/workflow-engine/inspection-migration/20260703-inspection-migration.md`: status=active, current_slice=completed-20260703-architecture-closeout, source_plan=(none)
## Handoff

- Exact Next Step: Clean up merged contract worktree codex/context-contract-sync-archive-fix. Command: repo-harness run contract-worktree cleanup --slug context-contract-sync-archive-fix --target main

## Checks

- status=(none), source=(none), exit_code=(none), file=.ai/harness/checks/latest.json

## Git Status

- Summary: 37 changed/untracked path(s)

```
 M .ai/hooks/.projection.json
 M .ai/hooks/AGENTS.md
 M .ai/hooks/CLAUDE.md
 M .ai/hooks/prompt-guard.sh
 M .codex/agents/deep-reasoner.toml
 M .codex/agents/fast-worker.toml
 M .codex/agents/gatekeeper.toml
 M README.es.md
 M README.fr.md
 M README.ja.md
 M README.md
 M README.zh-CN.md
 M assets/hooks/AGENTS.md
 M assets/hooks/CLAUDE.md
 M assets/hooks/prompt-guard.sh
 M assets/reference-configs/external-tooling.md
 M assets/reference-configs/global-working-rules.md
 M assets/templates/helpers/install-agent-fleet.sh
 M docs/CHANGELOG.md
 M docs/reference-configs/external-tooling.md
 M docs/reference-configs/global-working-rules.md
 M scripts/install-agent-fleet.sh
 M scripts/lib/project-init-lib.sh
 M src/cli/commands/doctor.ts
 M src/cli/commands/global-runtime.ts
 M tasks/lessons.md
 M tests/bootstrap-files.test.ts
 M tests/cli/doctor.test.ts
 M tests/cli/global-runtime-init.test.ts
 M tests/cli/init.test.ts
 M tests/create-project-dirs.runtime.test.ts
 M tests/global-working-rules-distribution.test.ts
 M tests/install-agent-fleet.test.ts
 M tests/install-scripts.test.ts
 M tests/readme-dx.test.ts
 M tests/scaffold-parity.test.ts
?? docs/architecture/requests/archive/2026/20260710-020546-runtime-harness-hook-adapters.md
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
