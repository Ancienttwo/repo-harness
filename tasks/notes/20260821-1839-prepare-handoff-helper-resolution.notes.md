# Prepare Handoff Helper Resolution Notes

## Confirmed Failure

- External target: `/Users/kito/Projects/salesko-new-wt-byok-db-authority-readback`
- Command: `repo-harness run prepare-handoff --reason diagnose-helper-path`
- Result: exit 1, `Module not found "scripts/recovery-view-cli.ts"`
- Root cause: the runner selected the packaged helper family and exported its source path, but `workflow_write_handoff` hard-coded a target-relative dependent helper.

## Invariant

The target repository owns handoff outputs and workflow state. All executable helpers participating in one invocation come from the same runner-selected helper runtime.

## Implementation

- When `REPO_HARNESS_HELPER_SOURCE_PATH` is present, `workflow_write_handoff` validates that it names the selected `prepare-handoff.sh` and resolves `recovery-view-cli.ts` beside it.
- The helper runner also binds `prepare-handoff.sh` to `workflow-state.sh` from that same selected runtime, so a stale target-local library cannot reintroduce mixed-generation helper resolution.
- Without a runner-selected helper path, direct repo-local invocation continues to use `scripts/recovery-view-cli.ts`.
- Either shape fails closed when its resolved materializer is absent.

## Verification

- `tests/cli/run.test.ts`: 17 pass, 0 fail.
- `tests/helper-scripts.test.ts`: 130 pass, 0 fail.
- Helper and hook projection checks: pass.
- Deploy SQL, architecture sync, task sync, strict workflow, project inspection, and init dry-run checks: pass.
- Original Salesko command succeeds with the fixed source runtime and writes the handoff.
- An attempted ambient full-suite run exposed two pre-existing `trace-observer` failures because the Codex host injects `CODEX_SESSION_ID`/host identity into tests that expect no ambient host. The focused file passes 9/9 when those host variables are removed. The long full-suite run was stopped after establishing that unrelated environment cause; no source change was made for it.
