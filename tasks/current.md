# Current Status Snapshot

<!-- generated-by: repo-harness refresh-current-status v1 -->
<!-- updated_at: 2026-06-29T00:07:31+0800 -->
<!-- stale_after: 24h -->

> **Status**: Active
> **Updated At**: 2026-06-29T00:07:31+0800
> **Source Branch**: main
> **Source Commit**: 30a111a
> **Target Branch**: main
> **Stale After**: 24h
> **Reason**: cleanup-and-workflow-hygiene
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

- /Users/kito/Projects/agentic-dev-wt-fe-302-search-facets-result-cards: plans/plan-20260628-0451-fe-302-search-facets-result-cards.md
- /Users/kito/Projects/agentic-dev-wt-fe-302-search-facets-result-cards: active-worktree owner -> /Users/kito/Projects/agentic-dev-wt-fe-302-search-facets-result-cards
- /Users/kito/Projects/agentic-dev-wt-salesko-app-signin: plans/plan-20260624-1125-salesko-app-signin.md
- /Users/kito/Projects/agentic-dev-wt-salesko-app-signin: active-worktree owner -> /Users/kito/Projects/agentic-dev-wt-salesko-app-signin
- /Users/kito/Projects/agentic-dev-wt-salesko-login-account-ux-google-oauth: plans/plan-20260625-0253-salesko-login-account-ux-google-oauth.md
- /Users/kito/Projects/agentic-dev-wt-salesko-login-account-ux-google-oauth: active-worktree owner -> /Users/kito/Projects/agentic-dev-wt-salesko-login-account-ux-google-oauth
- /Users/kito/Projects/agentic-dev-wt-salesko-mobile-pwa-real-data-tabs: plans/plan-20260624-2207-salesko-mobile-pwa-real-data-tabs.md
- /Users/kito/Projects/agentic-dev-wt-salesko-mobile-pwa-real-data-tabs: active-worktree owner -> /Users/kito/Projects/agentic-dev-wt-salesko-mobile-pwa-real-data-tabs
- /Users/kito/Projects/agentic-dev-wt-think-skill-codex-repo-skill-think-hook-agents-md: plans/plan-20260606-0245-think-skill-codex-repo-skill-think-hook-agents-md.md
- /Users/kito/Projects/agentic-dev-wt-think-skill-codex-repo-skill-think-hook-agents-md: active-worktree owner -> /Users/kito/Projects/agentic-dev-wt-think-skill-codex-repo-skill-think-hook-agents-md
## Active Sprint

- Sprint: (none)
## Workstreams

- `tasks/workstreams/workflow-engine/contract-assets/cleanup-script-policy.md`: status=completed, current_slice=todo-01, source_plan=(none)
## Handoff

- Exact Next Step: Clean up merged contract worktree codex/fe-302-search-facets-result-cards. Command: bash scripts/contract-worktree.sh cleanup --slug fe-302-search-facets-result-cards --target main

## Checks

- status=(none), source=(none), exit_code=(none), file=.ai/harness/checks/latest.json

## Git Status

- Summary: 56 changed/untracked path(s)

```
 M .ai/harness/policy.json
 M .claude/templates/plan.template.md
 M .claude/templates/sprint.template.md
 M .gitignore
 M AGENTS.md
 M CLAUDE.md
 M assets/partials-agents/02-operating-mode.partial.md
 M assets/partials-agents/04-task-protocol.partial.md
 M assets/partials/08-orchestration.partial.md
 M assets/reference-configs/agentic-development-flow.md
 M assets/reference-configs/harness-overview.md
 M assets/reference-configs/sprint-contracts.md
 M assets/reference-configs/workflow-orchestration.md
 M assets/skill-commands/repo-harness-sprint/SKILL.md
 M assets/templates/helpers/archive-workflow.sh
 M assets/templates/helpers/capture-plan.sh
 M assets/templates/helpers/check-task-workflow.sh
 M assets/templates/helpers/contract-worktree.sh
 M assets/templates/helpers/ensure-task-workflow.sh
 M assets/templates/helpers/new-plan.sh
 M assets/templates/helpers/plan-to-todo.sh
 M assets/templates/helpers/ship-worktrees.sh
 M assets/templates/helpers/sprint-backlog.sh
 M assets/templates/plan.template.md
 M assets/templates/sprint.template.md
 M docs/reference-configs/agentic-development-flow.md
 M docs/reference-configs/harness-overview.md
 M docs/reference-configs/sprint-contracts.md
 M docs/reference-configs/workflow-orchestration.md
 M scripts/archive-workflow.sh
 M scripts/capture-plan.sh
 M scripts/check-task-workflow.sh
 M scripts/contract-worktree.sh
 M scripts/ensure-task-workflow.sh
 M scripts/lib/project-init-lib.sh
 M scripts/new-plan.sh
 M scripts/plan-to-todo.sh
 M scripts/ship-worktrees.sh
 M scripts/sprint-backlog.sh
 M scripts/sync-codex-installed-copies.sh
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
