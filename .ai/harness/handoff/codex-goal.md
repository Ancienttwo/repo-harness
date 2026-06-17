---
title: "Codex Goal"
kind: "codex-goal"
created_at: "2026-06-16T21:25:03.011Z"
source: "repo-harness-mcp"
---
# Codex Goal

## Source of truth

- PRD: `/Users/ancienttwo/Projects/agentic-dev-wt-mcp-connector/plans/prds/20260617-repo-harness-mcp-prd.md`
- Checklist Sprint: `/Users/ancienttwo/Projects/agentic-dev-wt-mcp-connector/plans/sprints/20260617-repo-harness-mcp-sprint.md`
- Reference repo: `/Users/ancienttwo/Projects/agentic-dev/_ref/local-dev-mcp` (read-only comparison source)

## Role

Codex is the executor. ChatGPT/repo-harness may prepare planning artifacts, but implementation ownership stays in the local Codex session.

## Scope

- Open or use an isolated worktree for the sprint implementation.
- Execute the checklist Sprint task cards in order.
- Update the Sprint checklist as phases complete.
- Stage each completed phase before continuing to the next phase.
- Do not modify the reference repo or ignored secrets/ops state.

## Required workflow

1. Read the PRD and Sprint paths above before editing.
2. Build the P1/P2/P3 map required by repo-local AGENTS.md for non-trivial changes.
3. Execute one checklist task card at a time.
4. After each phase, run the relevant focused checks, update the checklist, and stage the completed slice.
5. Continue until the Sprint checklist is complete or a real blocker is reached.
6. Leave a concise handoff with staged state and verification evidence.

## Required checks

- Run the checks named by the Sprint task card.
- At sprint closeout, run repo-required checks unless the Sprint narrows the verification surface with a stated reason.

## Done when

- The checklist Sprint is complete.
- Every completed phase is staged.
- Checks pass or failures are documented with exact blocker evidence.
- No commit is created unless the user explicitly asks for commit.

## Host-native /goal prompt

```text
/goal
阅读： /Users/ancienttwo/Projects/agentic-dev-wt-mcp-connector/plans/prds/20260617-repo-harness-mcp-prd.md
开worktree完整执行：/Users/ancienttwo/Projects/agentic-dev-wt-mcp-connector/plans/sprints/20260617-repo-harness-mcp-sprint.md
完成阶段性任务，要staging再继续
参考repo: /Users/ancienttwo/Projects/agentic-dev/_ref/local-dev-mcp
```
