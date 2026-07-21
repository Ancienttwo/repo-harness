# Current Status Snapshot

<!-- generated-by: repo-harness refresh-current-status v1 -->
<!-- updated_at: 2026-07-21T20:14:15+0800 -->
<!-- stale_after: 24h -->

> **Status**: Active
> **Updated At**: 2026-07-21T20:14:15+0800
> **Source Branch**: codex/hrd-09-legacy-retirement-and-adopted-migration
> **Source Commit**: 49da8563
> **Target Branch**: main
> **Stale After**: 24h
> **Reason**: hrd-09-verification
> **Derived From**: active-plan, active-sprint, workstreams, handoff, checks, git status

This file is a tracked mainline snapshot derived from repo artifacts. It is not a live lock, not a kanban board, and not an implementation gate. If it is stale, read the source artifacts below.

## Current Focus

- Status: Active
- Active Plan: plans/plan-20260721-1801-hrd-09-legacy-retirement-and-adopted-migration.md
- Plan Status: Executing
- Next Task: Record exactly one semantic acceptance or contract-authorized typed owner waiver, seal, PR, CI, merge, and cleanup.
- Clear Note: (none)

## Mainline Snapshot Reading

- Current worktree: `tasks/current.md`
- Target branch snapshot: `git show main:tasks/current.md`
- Rule: non-target worktrees may read the target branch snapshot, but must verify against source artifacts before acting.

## Active Work

- .: plans/plan-20260721-1801-hrd-09-legacy-retirement-and-adopted-migration.md
- .: active-worktree owner -> /Users/kito/Projects/repo-harness/.ai/harness/worktrees/hrd-09-legacy-retirement-and-adopted-migration
- /Users/kito/Projects/repo-harness: plans/plan-20260721-1907-bdd2-followthrough.md
- /Users/kito/Projects/repo-harness: active-worktree owner -> /Users/kito/Projects/repo-harness
- /Users/kito/Projects/repo-harness-wt-acceptance-waiver-grant: plans/plan-20260721-1531-acceptance-waiver-grant.md
- /Users/kito/Projects/repo-harness-wt-acceptance-waiver-grant: active-worktree owner -> /Users/kito/Projects/repo-harness-wt-acceptance-waiver-grant
- /Users/kito/Projects/repo-harness-wt-closeout-single-acceptance-authority: plans/plan-20260721-0601-closeout-single-acceptance-authority.md
- /Users/kito/Projects/repo-harness-wt-closeout-single-acceptance-authority: active-worktree owner -> /Users/kito/Projects/repo-harness-wt-closeout-single-acceptance-authority
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

- Exact Next Step: If a major module was just completed, stage its coherent diff first; then continue the next Task Breakdown item: Port prompt, command/trace, and subagent route groups with focused parity tests.

## Checks

- status=(none), source=(none), exit_code=(none), file=.ai/harness/checks/latest.json

## Git Status

- Summary: 129 changed/untracked path(s)

```
 M .ai/harness/policy.json
 M .ai/harness/workflow-contract.json
 M .ai/hooks/.projection.json
 M .ai/hooks/AGENTS.md
 M .ai/hooks/CLAUDE.md
 D .ai/hooks/anti-simplification.sh
 D .ai/hooks/changelog-guard.sh
 D .ai/hooks/codex-delegation-advisor.sh
 D .ai/hooks/first-principles-guard.sh
 D .ai/hooks/hook-input.sh
 D .ai/hooks/lib/minimal-change.sh
 D .ai/hooks/lib/session-state.sh
 D .ai/hooks/post-bash.sh
 D .ai/hooks/post-tool-observer.sh
 D .ai/hooks/prompt-guard.sh
 D .ai/hooks/run-hook.sh
 D .ai/hooks/subagent-return-channel-guard.sh
 D .ai/hooks/subagent-start-context.sh
 D .ai/hooks/subagent-stop-quality.sh
 M AGENTS.md
 M CLAUDE.md
 M README.es.md
 M README.fr.md
 M README.ja.md
 M README.md
 M README.zh-CN.md
 M assets/hooks/AGENTS.md
 M assets/hooks/CLAUDE.md
 D assets/hooks/anti-simplification.sh
 D assets/hooks/changelog-guard.sh
 D assets/hooks/codex-delegation-advisor.sh
 D assets/hooks/first-principles-guard.sh
 D assets/hooks/hook-input.sh
 D assets/hooks/lib/minimal-change.sh
 D assets/hooks/lib/session-state.sh
 D assets/hooks/post-bash.sh
 D assets/hooks/post-tool-observer.sh
 D assets/hooks/prompt-guard.sh
 D assets/hooks/run-hook.sh
 D assets/hooks/subagent-return-channel-guard.sh
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
