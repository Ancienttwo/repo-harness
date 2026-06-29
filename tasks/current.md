# Current Status Snapshot

<!-- generated-by: repo-harness refresh-current-status v1 -->
<!-- updated_at: 2026-06-29T12:28:51+0800 -->
<!-- stale_after: 24h -->

> **Status**: Idle
> **Updated At**: 2026-06-29T12:28:51+0800
> **Source Branch**: main
> **Source Commit**: 7ff2092
> **Target Branch**: main
> **Stale After**: 24h
> **Reason**: remove-local-helper-wrappers
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
## Handoff

- Exact Next Step: (none)

## Checks

- status=(none), source=(none), exit_code=(none), file=.ai/harness/checks/latest.json

## Git Status

- Summary: 115 changed/untracked path(s)

```
 M .ai/context/context-map.json
 M .ai/harness/policy.json
 M .ai/harness/workflow-contract.json
 M .ai/hooks/prompt-guard.sh
 M .claude/templates/plan.template.md
 M .claude/templates/sprint.template.md
 M .gitignore
 M AGENTS.md
 M CLAUDE.md
 M assets/hooks/prompt-guard.sh
 M assets/partials-agents/02-operating-mode.partial.md
 M assets/partials-agents/03-orchestration.partial.md
 M assets/partials-agents/04-task-protocol.partial.md
 M assets/partials-agents/06-quality-safety.partial.md
 M assets/partials/04-project-structure.partial.md
 M assets/partials/05-workflow.partial.md
 M assets/partials/08-orchestration.partial.md
 M assets/reference-configs/agentic-development-flow.md
 M assets/reference-configs/document-generation.md
 M assets/reference-configs/external-tooling.md
 M assets/reference-configs/harness-overview.md
 M assets/reference-configs/heartbeat-triage.md
 M assets/reference-configs/hook-operations.md
 M assets/reference-configs/sprint-contracts.md
 M assets/skill-commands/repo-harness-plan/SKILL.md
 M assets/skill-commands/repo-harness-ship/SKILL.md
 M assets/skill-commands/repo-harness-sprint/SKILL.md
 M assets/templates/contract.template.md
 M assets/templates/helpers/archive-workflow.sh
 M assets/templates/helpers/capture-plan.sh
 M assets/templates/helpers/check-brain-manifest.sh
 M assets/templates/helpers/check-task-workflow.sh
 M assets/templates/helpers/contract-worktree.sh
 M assets/templates/helpers/ensure-task-workflow.sh
 M assets/templates/helpers/new-plan.sh
 M assets/templates/helpers/new-spec.sh
 M assets/templates/helpers/new-sprint.sh
 M assets/templates/helpers/plan-to-todo.sh
 M assets/templates/helpers/prepare-codex-handoff.sh
 M assets/templates/helpers/prepare-handoff.sh
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
