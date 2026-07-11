# Current Status Snapshot

<!-- generated-by: repo-harness refresh-current-status v1 -->
<!-- updated_at: 2026-07-11T20:34:32+0800 -->
<!-- stale_after: 24h -->

> **Status**: ManualClearedWithActiveWork
> **Updated At**: 2026-07-11T20:34:32+0800
> **Source Branch**: detached
> **Source Commit**: eaae117
> **Target Branch**: main
> **Stale After**: 24h
> **Reason**: archive-workflow rebase
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

- Summary: 27 changed/untracked path(s)

```
M  deploy/runbooks/general-repo-mcp-codegraph.md
M  docs/reference-configs/general-repo-mcp.md
M  docs/repo-harness-chatgpt-mcp-setup.md
A  plans/archive/plan-20260711-1401-mcp-rollout-cutover-v1.md
D  scripts/mcp-rollout-gate.ts
M  src/cli/chatgpt-browser/file-policy.ts
M  src/cli/mcp/auth.ts
M  src/cli/mcp/general-repo-access.ts
M  src/cli/mcp/general-repo-access/authority.ts
M  src/cli/mcp/policy.ts
M  src/cli/mcp/reader-tools.ts
M  src/cli/mcp/server.ts
M  src/cli/mcp/setup.ts
M  src/cli/mcp/tools.ts
M  src/cli/mcp/types.ts
A  tasks/archive/contract-20260711-2033-mcp-rollout-cutover-v1.md
A  tasks/archive/notes-20260711-2033-mcp-rollout-cutover-v1.md
A  tasks/archive/review-20260711-2033-mcp-rollout-cutover-v1.md
A  tasks/archive/todo-20260711-2033-mcp-rollout-cutover-v1.md
UU tasks/current.md
M  tests/cli/mcp-policy.test.ts
M  tests/cli/mcp-reader-tools.test.ts
M  tests/cli/mcp-setup.test.ts
M  tests/cli/mcp-stdio.test.ts
M  tests/cli/mcp-tools.test.ts
M  tests/cli/mcp.test.ts
D  tests/mcp-rollout-gate.test.ts
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
