# Current Status Snapshot

<!-- generated-by: repo-harness refresh-current-status v1 -->
<!-- updated_at: 2026-07-12T17:46:09+0800 -->
<!-- stale_after: 24h -->

> **Status**: Active
> **Updated At**: 2026-07-12T17:46:09+0800
> **Source Branch**: codex/bdd2-shape-experiment
> **Source Commit**: e66418b
> **Target Branch**: main
> **Stale After**: 24h
> **Reason**: bdd2-e02-merged-e519ab1
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
- /Users/kito/Projects/repo-harness/.claude/worktrees/agent-ae14c20f2b5dac4a3: plans/plan-20260712-1642-adaptive-lite-hook-routing.md
- /Users/kito/Projects/repo-harness/.claude/worktrees/agent-ae14c20f2b5dac4a3: active-worktree owner -> /Users/kito/Projects/repo-harness/.claude/worktrees/agent-ae14c20f2b5dac4a3
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

- Summary: 54 changed/untracked path(s)

```
M  .agents/skills/repo-harness-chatgpt-bridge/SKILL.md
M  .agents/skills/repo-harness-chatgpt-bridge/references/chatgpt-connector-manual.md
M  .agents/skills/repo-harness-chatgpt-bridge/references/workflow.md
M  .ai/context/capabilities.json
M  bun.lock
M  docs/architecture/domains/runtime-harness.md
M  docs/architecture/index.md
A  docs/architecture/modules/runtime-harness/mcp-sidecar.md
A  docs/reference-configs/chatgpt-coding-mcp.md
M  docs/repo-harness-chatgpt-mcp-setup.md
A  docs/researches/20260711-devspace-chatgpt-local-control.md
M  docs/spec.md
M  package.json
A  plans/archive/plan-20260711-0137-chatgpt-coding-mcp.md
A  plans/plan-20260711-1034-chatgpt-coding-mcp-live-canary.md
A  plans/plan-20260711-1343-chatgpt-coding-mcp-authorization-runtime.md
A  plans/plan-20260712-0301-chatgpt-coding-mcp-integration.md
M  src/cli/chatgpt-browser/file-policy.ts
M  src/cli/commands/mcp.ts
M  src/cli/mcp/auth.ts
M  src/cli/mcp/codegraph-adapter.ts
A  src/cli/mcp/coding-tools.ts
A  src/cli/mcp/coding-workspaces.ts
M  src/cli/mcp/instructions.ts
M  src/cli/mcp/oauth.ts
M  src/cli/mcp/policy.ts
A  src/cli/mcp/process-sessions.ts
M  src/cli/mcp/server.ts
M  src/cli/mcp/setup.ts
M  src/cli/mcp/tools.ts
M  src/cli/mcp/transports/http.ts
M  src/cli/mcp/types.ts
M  src/effects/repo-registry.ts
A  tasks/archive/contract-20260711-0609-chatgpt-coding-mcp.md
A  tasks/archive/notes-20260711-0609-chatgpt-coding-mcp.md
A  tasks/archive/review-20260711-0609-chatgpt-coding-mcp.md
A  tasks/archive/todo-20260711-0609-chatgpt-coding-mcp.md
A  tasks/contracts/20260711-1034-chatgpt-coding-mcp-live-canary.contract.md
A  tasks/contracts/20260711-1343-chatgpt-coding-mcp-authorization-runtime.contract.md
A  tasks/contracts/20260712-0301-chatgpt-coding-mcp-integration.contract.md
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
