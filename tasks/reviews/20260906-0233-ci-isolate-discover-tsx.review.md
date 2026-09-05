# Task Review: ci-isolate-discover-tsx

> **Status**: Pending
> **Plan**: plans/plan-20260906-0233-ci-isolate-discover-tsx.md
> **Contract**: tasks/contracts/20260906-0233-ci-isolate-discover-tsx.contract.md
> **Notes File**: tasks/notes/20260906-0233-ci-isolate-discover-tsx.notes.md
> **Checks File**: .ai/harness/checks/latest.json
> **Last Updated**: 2026-09-06 02:33
> **Recommendation**: fail
> **Review Rubric Version**: 2
> **Reviewed Subject SHA256**: pending
> **Reviewed Subject Scope**: normalized-final-content
> **Reviewed Target Revision**: pending

## Human Review Card

- Verdict: pending
- Change type: bugfix
- Intended files changed: `scripts/lib/ci-run-tests.sh`, `tests/check-ci-isolate-aggregation.test.ts`, plus this work package's plan/contract/review/notes and `tasks/todos.md`
- Actual files changed: `scripts/lib/ci-run-tests.sh`, `tests/check-ci-isolate-aggregation.test.ts`, `plans/plan-20260906-0233-ci-isolate-discover-tsx.md`, `tasks/contracts/20260906-0233-ci-isolate-discover-tsx.contract.md`, `tasks/reviews/20260906-0233-ci-isolate-discover-tsx.review.md`, `tasks/notes/20260906-0233-ci-isolate-discover-tsx.notes.md`, `tasks/todos.md`
- Commands passed: `bun test --timeout 60000 tests/check-ci-isolate-aggregation.test.ts tests/bootstrap-files.test.ts` (18 pass / 0 fail); `verify-contract --strict` (total=22 failed=0); the six repository-integrity checks; `bun run check:helpers`; one full `bun test --timeout 60000`
- Residual risks: the CI `Test` job now runs three additional `tests/operator-web/*.test.tsx` suites, so the job gets longer and any pre-existing failure there surfaces as a new CI red
- Reviewer action required: inspect diff and card
- Rollback: revert the discovery predicate and the guard case together (base main 29b3fd12)

## Mode Evidence

- Selected route: planning -> contract execution in an isolated worktree
- P1/P2/P3 evidence: `plans/plan-20260906-0233-ci-isolate-discover-tsx.md` `## Captured Planning Output`
- Root cause or plan evidence: `scripts/lib/ci-run-tests.sh:44` discovered only `-name '*.test.ts'`; pre-fix capture in `.ai/harness/evidence/pre-fix/check-ci-isolate-discover-tsx.log` (`PRE_FIX_EXIT=1`, missing `[ci] test tests/b.test.tsx`)

## Verification Evidence

- Waza `/check` run: not run; acceptance is owned by the ship gate
- Commands run: guard + `tests/bootstrap-files.test.ts`; discovery readback (`361` files, including the three `tests/operator-web/*.test.tsx` paths); `bun run check:helpers`; `check-deploy-sql-order`, `check-architecture-sync`, `check-task-sync`, `check-task-workflow --strict`, `inspect-project-state`, `init --dry-run`; CI-mode `check-task-sync` with the digest bound; one full `bun test --timeout 60000`
- Manual checks: no packaged mirror of `scripts/lib/ci-run-tests.sh` exists (`check:helpers` OK, repo-wide `run_bun_tests` scan finds only the lib and `scripts/check-ci.sh`)
- Supporting artifacts: `/tmp/rh-tb/tsx/full.log`, `/tmp/rh-tb/tsx/discovered.txt`, `.ai/harness/evidence/pre-fix/check-ci-isolate-discover-tsx.log`
- Implementation notes reviewed: `tasks/notes/20260906-0233-ci-isolate-discover-tsx.notes.md`
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

- Isolate-mode discovery went from `find tests -type f -name '*.test.ts'` to `find tests -type f \( -name '*.test.ts' -o -name '*.test.tsx' \)`; the sort, the `BUN_TEST_FILES` branch, the failure aggregation, and the `no test files matched` guard are unchanged.
- Discovered file count is now 361, equal to the `across ... files` figure bun reports for the full suite.

## Residual Risks / Follow-ups

- The pre-fix artifact lives under the gitignored `.ai/harness/evidence/` root, so it is worktree-local and not reviewable from the PR diff.

## Scorecard

| Dimension | Score | Notes |
|-----------|-------|-------|
| Functionality | 0/10 | |
| Product depth | 0/10 | |
| Design quality | 0/10 | |
| Code quality | 0/10 | |

## Failing Items

- None.

## Retest Steps

- Re-run: `bun test --timeout 60000 tests/check-ci-isolate-aggregation.test.ts tests/bootstrap-files.test.ts`
- Re-check: `find tests -type f \( -name '*.test.ts' -o -name '*.test.tsx' \) | LC_ALL=C sort | wc -l` equals the full suite's `across M files` figure

## Summary

- The isolate-mode CI loop now discovers `*.test.tsx`, closing the gap that hid the three `tests/operator-web` suites from CI. Verdict is left pending for the ship gate.
