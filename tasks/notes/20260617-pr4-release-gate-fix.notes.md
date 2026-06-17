# PR #4 Release Gate Fix Notes

## Decision

Tightened the PR #4 workflow-control release gate instead of treating the
branch clean state as evidence. `verify-sprint` now checks committed branch
diffs from the base ref plus local changes, and `harness-trace-grade` rejects
traces whose Human Review Card or allowed-path evidence is incomplete.

## Tradeoffs

- Runtime active-plan markers are excluded from allowed-path scope because
  `contract-worktree` creates them as local execution state.
- `.claude/templates/` is added to generated contract allowed paths because
  `plan-to-todo` materializes compatibility templates as part of the workflow
  surface.
- The gate now requires Human Review Card change type to match `task_profile`
  and rollback to be concrete; legacy review verdict-only pass is no longer
  enough for trace-grade release evidence.

## Verification

- `bun test tests/helper-scripts.test.ts`
- `bun test`
