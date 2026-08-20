> **Archived**: 2026-08-20 18:10
> **Related Plan**: (none)
> **Outcome**: Superseded
> **Lifecycle**: notes
> **Parent Run ID**: orphan-family-sweep

# Cherry-pick Branch Closeout Notes

> **Date**: 2026-05-29
> **Scope**: local Group B worktree branch closeout into `main`

## Decisions

- Used `git cherry-pick -x` instead of merge commits for the preserved worktree branch commits.
- Kept `tasks/todo.md` as the deferred-goal ledger when older branch commits tried to restore execution-checklist content.
- Kept root `AGENTS.md` / `CLAUDE.md` on the current architecture request while preserving the new semantic diagram source field from the architecture branch.
- Resolved the CLI registry conflict by registering both `brain` and `capability-context`.
- Restored CodeGraph generated policy to the current host-neutral contract: `primary_host: "both"` and `readiness: "required-for-agent-code-navigation"`.
- Fixed `scripts/sync-brain-docs.sh --check` for empty `--changed` input under `set -u` and for legacy `icloud/brain/` default prefixes normalized to `brain/`.

## Verification Notes

- The first full `bun test` exposed the CodeGraph policy regression from the cherry-pick combination.
- After the policy fix, focused migration/scaffold tests passed, followed by the full `bun test` suite.
- `bash scripts/check-task-workflow.sh --strict` then exposed the brain sync shell/runtime path issues, which were fixed in the same closeout.
