# Issue and PR Brief Example

This example shows the issue and PR text for an ordinary task. It replaces the
retired task-contract example. The GitHub issue and PR own task state; no
contract, plan or review file is needed.

## Issue

### Goal

Let automation read `check-task-sync` results without parsing text.

### Scope

- Add a `--json` flag to `scripts/check-task-sync.sh`.
- Add one regression case in `tests/helper-scripts.test.ts`.
- Out of scope: text-mode wording, exit codes and other `check-*` scripts.

### Acceptance

- `--json` prints one JSON object with `status`, `has_task_sync_change`,
  `has_non_task_change` and `message`.
- The default text mode and exit codes do not change.
- `bun run test:files tests/helper-scripts.test.ts --timeout 60000` passes.

### Dependencies

None.

## Pull Request

### Goal

Add the JSON mode that the issue specifies.

### Scope

`scripts/check-task-sync.sh`, `tests/helper-scripts.test.ts`.

### Changes

- Add `--json` parsing.
- Build the JSON object from the existing verdict.
- Add the regression case.

### Verification

- `bun run check:type`: pass.
- `bun run test:files tests/helper-scripts.test.ts --timeout 60000`: 14 pass.
- `bash scripts/check-task-sync.sh --json`: prints the documented object.

### Risk and Rollback

Risk: a caller may expect text output. The flag is opt-in, so the default path is
unchanged. Rollback: revert the single commit. No data migration is involved.
