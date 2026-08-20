> **Archived**: 2026-08-20 16:19
> **Related Plan**: plans/archive/plan-20260819-2155-finish-auto-cleanup.md
> **Outcome**: Superseded
> **Lifecycle**: review
> **Parent Run ID**: run-20260820-1619

# Task Review: finish-auto-cleanup

> **Status**: Pending
> **Plan**: plans/plan-20260819-2155-finish-auto-cleanup.md
> **Contract**: tasks/contracts/20260819-2155-finish-auto-cleanup.contract.md
> **Notes File**: tasks/notes/20260819-2155-finish-auto-cleanup.notes.md
> **Checks File**: .ai/harness/checks/latest.json
> **Last Updated**: 2026-08-19 21:55
> **Recommendation**: fail
> **Review Rubric Version**: 2
> **Reviewed Subject SHA256**: pending
> **Reviewed Subject Scope**: normalized-final-content
> **Reviewed Target Revision**: pending

## Human Review Card

- Verdict: pending
- Change type: code-change
- Intended files changed: `scripts/contract-worktree.sh`,
  `assets/templates/helpers/contract-worktree.sh`,
  `tests/contract-worktree-single-publication.test.ts`,
  `tests/continuation-conformance.test.ts`
- Actual files changed: the four above, plus this work package's own plan,
  contract, review, and notes artifacts
- Commands passed:
  - `cmp scripts/contract-worktree.sh assets/templates/helpers/contract-worktree.sh` — identical
  - `bash -n scripts/contract-worktree.sh` — OK
  - `bun test tests/contract-worktree-squash-cleanup.test.ts tests/contract-worktree-single-publication.test.ts tests/contract-worktree-closeout-journal.test.ts tests/continuation-conformance.test.ts tests/helper-scripts.test.ts tests/state/loop-semantics-characterization.test.ts` — 165 pass / 0 fail, 2347 expect() calls, 6 files, 206.48s
- Residual risks: the cleanup subprocess deletes this process's own cwd, so any
  future code added after the cleanup block in `finish_worktree` would run from
  a removed directory; the block carries an inline comment saying nothing may
  follow it.
- Reviewer action required: inspect diff and card
- Rollback: single revert of the two-script edit plus the test adaptations;
  contract rollback point is `main@e2a67b9657bc378a7cb1a580b4558b77f7af1c72`.

## Mode Evidence

- Selected route: planning (captured plan `plans/plan-20260819-2155-finish-auto-cleanup.md`)
- P1/P2/P3 evidence: captured planning output in the plan (Problem, Decision,
  Task Breakdown, Verification, Rollback)
- Root cause or plan evidence: the fail-closed `cleanup --slug` path existed but
  had no caller after a successful `finish --merge`; 12 stale worktrees
  (~3.7GB) observed on disk.

## Verification Evidence

- Waza `/check` run: not run for this slice; gatekeeper review was used instead
- Commands run: `cmp`, `bash -n`, the six-file `bun test` set,
  `bash scripts/check-task-sync.sh`, `repo-harness run check-task-workflow --strict`
- Manual checks: confirmed the cleanup block sits after
  `finish_transaction_commit` and `sprint_lease_reconcile_after_publication`,
  so a refusal cannot reach `finish_transaction_abort`
- Supporting artifacts: `.ai/harness/checks/latest.json`
- Implementation notes reviewed: `tasks/notes/20260819-2155-finish-auto-cleanup.notes.md`
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

- `finish --merge` now ends by removing the merged contract worktree, its
  `codex/<slug>` branch, and `.ai/harness/worktrees/<slug>.json`, and prints
  `cd <target_worktree>` because the caller's cwd no longer exists.
- A refused cleanup no longer leaves the operator without a next step: finish
  still exits 0 and prints a stderr hint. The subprocess's own stderr (including
  `cleanup_worktree`'s dirty-branch guidance) passes through unchanged.
- `finish --no-merge` behavior is unchanged.

## Residual Risks / Follow-ups

- Pre-existing stale worktrees are not retroactively cleaned by this change;
  that remains the batch `repo-harness run ship-worktrees --cleanup-merged`
  flow's job.

## Gatekeeper Findings (Addressed)

- HIGH — cleanup-refusal hint pointed at a self-host-only path. The fallback
  printed `bash scripts/contract-worktree.sh cleanup ...`, but downstream repos
  run helpers from the package (`src/cli/runtime/helper-runner.ts`
  `PACKAGE_HELPERS_ROOT`) and have no `scripts/contract-worktree.sh`. Fixed: the
  hint now uses the `repo-harness run contract-worktree cleanup --slug <slug>
  --target <target>` form used by every other user-facing hint in this file.
  Both script copies remain byte-identical.
- LOW (approved) — the third hint line about scaffold-only dirt duplicated what
  `cleanup_worktree` itself prints on the dirty branch, and the subprocess's
  stderr already passes through. Deleted.
- HIGH ×2 — the active Approved plan had no companion contract, review, or notes
  artifacts, so `repo-harness run check-task-workflow --strict` and
  `bash scripts/check-task-sync.sh` both failed. Fixed: this review plus
  `tasks/contracts/20260819-2155-finish-auto-cleanup.contract.md` and
  `tasks/notes/20260819-2155-finish-auto-cleanup.notes.md` were created.
- MEDIUM — the three delivered test-adaptation items were unchecked in the plan
  Task Breakdown, which appears twice in the file. Fixed: all three are checked
  in both occurrences.

## Scorecard

| Dimension | Score | Notes |
|-----------|-------|-------|
| Functionality | 0/10 | |
| Product depth | 0/10 | |
| Design quality | 0/10 | |
| Code quality | 0/10 | |

## Failing Items

- None open. All gatekeeper findings listed above are addressed; the recorded
  recommendation stays `fail` until an AcceptanceReceipt is issued.

## Retest Steps

- Re-run: `bun test tests/contract-worktree-squash-cleanup.test.ts tests/contract-worktree-single-publication.test.ts tests/contract-worktree-closeout-journal.test.ts tests/continuation-conformance.test.ts tests/helper-scripts.test.ts tests/state/loop-semantics-characterization.test.ts`
- Re-check: `cmp scripts/contract-worktree.sh assets/templates/helpers/contract-worktree.sh`, `bash -n scripts/contract-worktree.sh`, `bash scripts/check-task-sync.sh`, `repo-harness run check-task-workflow --strict`

## Summary

- The auto-cleanup tail is implemented in both script copies, the refusal path
  degrades to a package-correct hint without changing finish's exit code, and
  the six-file test set is green at 165 pass / 0 fail. The companion contract,
  review, and notes artifacts now exist so the workflow gates pass.
