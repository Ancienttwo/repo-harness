> **Archived**: 2026-08-20 18:10
> **Related Plan**: (none)
> **Outcome**: Superseded
> **Lifecycle**: notes
> **Parent Run ID**: orphan-family-sweep

# Implementation Notes: hook-finish-archive-sequence

> **Status**: Active
> **Plan**: (bug-hunt fix, no active plan)
> **Contract**: (none)
> **Review**: (none)
> **Last Updated**: 2026-05-29
> **Lifecycle**: notes

## Design Decisions

- Moved contract worktree archival into `scripts/contract-worktree.sh finish` instead of letting `prompt-guard.sh` mutate workflow state from a done prompt inside the linked worktree.
- Kept primary worktree AutoArchive behavior unchanged because non-contract workflows still need a direct done-intent archive path.
- Captured the active plan before clearing local runtime markers, checked implementation scope before archive mutations, skipped the local runtime marker paths owned by `finish`, then cleared those markers after archive so finish can still resolve contract/review inputs.

## Deviations From Plan Or Spec

- A standalone cleanup subcommand was kept as a bounded terminal step because `workflow_next_action` can recommend it only after the contract branch is already merged.

## Tradeoffs Considered

| Option | Decision | Reason |
|--------|----------|--------|
| AutoArchive from done prompt in all worktrees | Rejected | It archives before the command that can commit and merge, splitting terminal state across worktrees. |
| Archive after fast-forward merge on main | Rejected | It creates a second dirty state on the target worktree after merge. |
| Archive inside `contract-worktree finish` before commit/merge | Chosen | It produces one reviewable commit containing implementation plus terminal workflow archive state. |
| Cleanup inside `finish` | Rejected | It would remove the worktree the agent is still running in; cleanup is a separate target-worktree command. |

## Open Questions

- None for this bug fix.

## Evidence Links

- `bun test tests/workflow-state-lib.test.ts tests/hook-runtime.test.ts tests/helper-scripts.test.ts tests/create-project-dirs.runtime.test.ts tests/migration-script.test.ts`
