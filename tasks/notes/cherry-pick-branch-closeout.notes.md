# Cherry-pick Branch Closeout Notes

> **Date**: 2026-05-29
> **Scope**: local Group B worktree branch closeout into `main`

## Decisions

- Used `git cherry-pick -x` instead of merge commits for the preserved worktree branch commits.
- Kept `tasks/todo.md` as the deferred-goal ledger when older branch commits tried to restore execution-checklist content.
- Kept root `AGENTS.md` / `CLAUDE.md` on the current architecture request while preserving the new semantic diagram source field from the architecture branch.
- Resolved the CLI registry conflict by registering both `brain` and `capability-context`.
- Restored CodeGraph generated policy to the current host-neutral contract: `primary_host: "both"` and `readiness: "required-for-agent-code-navigation"`.

## Verification Notes

- The first full `bun test` exposed the CodeGraph policy regression from the cherry-pick combination.
- After the policy fix, focused migration/scaffold tests passed, followed by the full `bun test` suite.
