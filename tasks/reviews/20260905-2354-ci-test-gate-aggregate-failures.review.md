# Task Review: ci-test-gate-aggregate-failures

> **Status**: Complete
> **Plan**: plans/plan-20260905-2354-ci-test-gate-aggregate-failures.md
> **Contract**: tasks/contracts/20260905-2354-ci-test-gate-aggregate-failures.contract.md
> **Notes File**: tasks/notes/20260905-2354-ci-test-gate-aggregate-failures.notes.md
> **Checks File**: .ai/harness/checks/latest.json
> **Last Updated**: 2026-09-05 23:54
> **Recommendation**: pass
> **Review Rubric Version**: 2
> **Reviewed Subject SHA256**: pending
> **Reviewed Subject Scope**: normalized-final-content
> **Reviewed Target Revision**: 9fba4387

## Human Review Card

- Verdict: pass
- Change type: code-change
- Intended files changed: `scripts/lib/ci-run-tests.sh` (add), `scripts/check-ci.sh` (source the lib), `tests/check-ci-isolate-aggregation.test.ts` (add), plus this work package's plan/contract/review/notes and `tasks/todos.md`
- Actual files changed: same set; `assets/templates/helpers/` untouched because `scripts/check-ci.sh` is not a projected helper
- Commands passed: `bun test --timeout 60000 tests/check-ci-isolate-aggregation.test.ts tests/bootstrap-files.test.ts` (17 pass / 0 fail); `bun run check:helpers` / `check:hooks` / `check:reference-configs`; the six repository-integrity checks; `verify-contract --strict` (total=20 failed=0 Fulfilled); one full `bun test --timeout 60000`
- Residual risks: the aggregation is bash-level; a future edit that reintroduces a bare `run_bun_test_file` call in the loop would restore fail-fast, which only the new guard catches
- Reviewer action required: inspect diff and card
- Rollback: revert the two commits `0c00b95c` and `6d5302b1`; no state or data migration

## Mode Evidence

- Selected route: planning (captured work-package plan `plans/plan-20260905-2354-ci-test-gate-aggregate-failures.md`)
- P1/P2/P3 evidence: recorded in the plan's `## Captured Planning Output`; confirmed in this worktree that `scripts/check-ci.sh` is the only caller of the loop and that `check:helpers` projects 56 helpers without `check-ci.sh`
- Root cause or plan evidence: bugfix profile gate passed all four `Root Cause Evidence` fields; `pre_fix_failure_artifact` shows `PRE_FIX_EXIT=1` and proves the second selected file never ran before the fix

## Verification Evidence

- Waza `/check` run: not run in this worktree; gatekeeper review is the acceptance gate
- Commands run: see Human Review Card `Commands passed`, plus CI-mode `REPO_HARNESS_DIFF_BASE=origin/main REPO_HARNESS_DIFF_MODE=merge-base bash scripts/check-task-sync.sh`
- Manual checks: positive runtime readback `BUN_TEST_ISOLATE_FILES=1 BUN_TEST_FILES="tests/unit/fleet-board.test.ts tests/check-ci-isolate-aggregation.test.ts" bash -c 'source scripts/lib/ci-run-tests.sh; run_bun_tests'` exits 0 with both `[ci] test` lines and no summary; the negative readback with a deliberately failing temp file first exits 1, still runs the second file, and prints `[ci] failed test files (1):` naming only the failing file with `(exit 1)`
- Supporting artifacts: `.ai/harness/evidence/pre-fix/check-ci-isolate-aggregation.log`
- Implementation notes reviewed: `tasks/notes/20260905-2354-ci-test-gate-aggregate-failures.notes.md`
- Run snapshot: `.ai/harness/runs/`

## Acceptance Receipt Projection

> **Disposition**: unavailable
> **Reviewer**: unavailable
> **Source**: unavailable
> **Actor**: not-applicable
> **Reviewed Subject SHA256**: pending
> **Reviewed Subject Scope**: normalized-final-content
> **Reviewed Target Revision**: pending
> **Verification Evidence SHA256**: pending
> **Issued At**: pending

- Summary: No AcceptanceReceipt has been recorded.
- Findings: none

## Behavior Diff Notes

- Isolate mode: the per-file loop no longer aborts on the first failure; every selected file runs and a stderr summary lists each failing file with its exit code before the function returns 1.
- Unchanged: non-isolate mode, `BUN_TEST_FILES` selection, the `find tests` fallback ordering, the "no test files matched" error, per-file `[ci] test <file>` lines and raw bun output, and the gate's phase order (it still stops after the test phase when any file failed).

## Residual Risks / Follow-ups

- `scripts/lib/ci-run-tests.sh` is a new local library with no packaged mirror; if it is ever added to the workflow contract's helper list, the projection must be regenerated rather than hand-copied.
- bash 5.x is not available on this machine; correctness on `ubuntu-latest` is inferred from the constructs used, and the PR's own CI run is the proof.
- Default values for `BUN_TEST_TIMEOUT_MS`/`BUN_TEST_MAX_CONCURRENCY`/`BUN_TEST_ISOLATE_FILES` now exist in two places: `scripts/check-ci.sh:7-9` and the lib's inline `${VAR:-default}` fallbacks. Accepted because the contract required `check-ci.sh` to stay byte-identical apart from the `source` line.
- The pre-fix RED artifact lives under gitignored `.ai/harness/evidence/`, so it is not preserved in version control.
- The gate still stops after the test summary and does not continue into the workflow checks; that is by design and unchanged by this work package.

## Scorecard

| Dimension | Score | Notes |
|-----------|-------|-------|
| Functionality | 9/10 | Guard 2/2 and `tests/bootstrap-files.test.ts` 17/17; positive readback exits 0 with no summary; negative readbacks exit 1, still run every selected file, and print summaries naming 1 and 2 failing files with their exit codes; per-file `[ci] test` lines stay on stdout while the summary goes to stderr; full suite 4422 pass / 4 skip / 0 fail at product commit `6d5302b1` |
| Product depth | 8/10 | Solves the observed failure (a red `main` hid every file sorting after the first failure) and stops there: no phase-order change, no new knobs, no scope creep past the isolate-mode loop |
| Design quality | 8/10 | Extracting `scripts/lib/ci-run-tests.sh` makes the loop directly observable without an install/typecheck/pack cycle; `check-ci.sh` stays byte-identical apart from the `source` line; helper/hook/reference-config projections unchanged |
| Code quality | 9/10 | `bash -n` clean and verified on `/bin/bash` 3.2.57 including an empty selection with no unbound-variable error; per-file status captured into a `local` instead of reading `$?` in the `then` branch; six repository-integrity checks exit 0; `verify-contract --strict` 20/20 Fulfilled; CI-mode task-sync digest `sha256:b637a977…` matches the contract; `git merge-tree` clean against `origin/main` `5a6a2121` |

## Failing Items

- None.

## Retest Steps

- Re-run: `bun test --timeout 60000 tests/check-ci-isolate-aggregation.test.ts tests/bootstrap-files.test.ts`
- Re-check: the negative runtime readback above, then `bun src/cli/index.ts run verify-contract --contract tasks/contracts/20260905-2354-ci-test-gate-aggregate-failures.contract.md --strict`

## Summary

- The CI test gate now reports the complete failing set in one isolate-mode run instead of stopping at the first red file, guarded by `tests/check-ci-isolate-aggregation.test.ts` whose pre-fix capture shows the previous loop skipping every later file.
