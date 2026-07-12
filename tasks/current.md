# Current Status Snapshot

<!-- generated-by: repo-harness refresh-current-status v1 -->
<!-- updated_at: 2026-07-12T16:41:45+0800 -->
<!-- stale_after: 24h -->

> **Status**: Active
> **Updated At**: 2026-07-12T16:41:45+0800
> **Source Branch**: codex/bdd2-shape-experiment
> **Source Commit**: a60d5e7
> **Target Branch**: main
> **Stale After**: 24h
> **Reason**: bdd2-e02-merged-latest-main
> **Derived From**: active-plan, active-sprint, workstreams, handoff, checks, git status

This file is a tracked mainline snapshot derived from repo artifacts. It is not a live lock, not a kanban board, and not an implementation gate. If it is stale, read the source artifacts below.

## Current Focus

- Status: Active
- Active Plan: plans/plan-20260712-0605-bdd2-e-02-run-experiment-s-shape-hypothesis.md
- Plan Status: Executing
- Next Task: Complete review/notes/current/handoff, run required checks, commit, push, and open the E-02 module PR.
- Clear Note: (none)

## Mainline Snapshot Reading

- Current worktree: `tasks/current.md`
- Target branch snapshot: `git show main:tasks/current.md`
- Rule: non-target worktrees may read the target branch snapshot, but must verify against source artifacts before acting.

## Active Work

- .: plans/plan-20260712-0605-bdd2-e-02-run-experiment-s-shape-hypothesis.md
- .: active-worktree owner -> /Users/kito/Projects/repo-harness-worktrees/bdd2-shape-experiment
- /Users/kito/Projects/repo-harness-worktrees/bdd2-eval-foundation: plans/plan-20260712-0450-bdd2-eval-foundation.md
- /Users/kito/Projects/repo-harness-worktrees/bdd2-eval-foundation: active-worktree owner -> /Users/kito/Projects/repo-harness-worktrees/bdd2-eval-foundation
- /Users/kito/Projects/repo-harness-worktrees/chatgpt-coding-mcp-integration: plans/plan-20260712-0301-chatgpt-coding-mcp-integration.md
- /Users/kito/Projects/repo-harness-worktrees/chatgpt-coding-mcp-integration: active-worktree owner -> /Users/kito/Projects/repo-harness-worktrees/chatgpt-coding-mcp-integration
- /Users/kito/Projects/repo-harness-worktrees/native-role-capability-gate: plans/plan-20260712-0219-native-role-capability-gate.md
- /Users/kito/Projects/repo-harness-worktrees/native-role-capability-gate: active-worktree owner -> /Users/kito/Projects/repo-harness-worktrees/native-role-capability-gate
- /Users/kito/Projects/repo-harness-worktrees/upgrade-bun-1-3-14: plans/plan-20260712-1330-bun-1-3-14-runtime-upgrade.md
- /Users/kito/Projects/repo-harness-worktrees/upgrade-bun-1-3-14: active-worktree owner -> /Users/kito/Projects/repo-harness-worktrees/upgrade-bun-1-3-14
- /Users/kito/Projects/repo-harness-wt-codex-native-role-model-override: plans/plan-20260711-0219-codex-native-role-model-override.md
- /Users/kito/Projects/repo-harness-wt-codex-native-role-model-override: active-worktree owner -> /Users/kito/Projects/repo-harness-wt-codex-native-role-model-override
## Active Sprint

- Sprint: (none)
## Workstreams

- `tasks/workstreams/workflow-engine/contract-assets/cleanup-script-policy.md`: status=completed, current_slice=todo-01, source_plan=(none)
- `tasks/workstreams/workflow-engine/inspection-migration/20260703-inspection-migration.md`: status=active, current_slice=completed-20260703-architecture-closeout, source_plan=(none)
## Handoff

- Exact Next Step: If a major module was just completed, stage its coherent diff first; then continue the next Task Breakdown item: Complete review/notes/current/handoff, run required checks, commit, push, and open the E-02 module PR.

## Checks

- status=(none), source=(none), exit_code=(none), file=.ai/harness/checks/latest.json

## Git Status

- Summary: 15 changed/untracked path(s)

```
M  .github/workflows/ci.yml
M  assets/templates/helpers/architecture-event.ts
M  "docs/researches/repo-harness \351\222\251\345\255\220\346\227\266\345\273\266\344\270\216 LLM \346\217\220\344\276\233\345\225\206\351\231\220\346\265\201\345\275\222\345\233\240\347\240\224\347\251\266\346\212\245\345\221\212.md"
A  plans/plan-20260712-1330-bun-1-3-14-runtime-upgrade.md
M  scripts/architecture-event.ts
M  src/cli/hook-entry.ts
M  src/cli/hook/runtime.ts
M  src/cli/index.ts
A  src/cli/runtime/write-all-sync.ts
A  tasks/contracts/20260712-1330-bun-1-3-14-runtime-upgrade.contract.md
UU tasks/current.md
A  tasks/notes/20260712-1330-bun-1-3-14-runtime-upgrade.notes.md
A  tasks/reviews/20260712-1330-bun-1-3-14-runtime-upgrade.review.md
UU tasks/todos.md
A  tests/write-all-sync.test.ts
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
