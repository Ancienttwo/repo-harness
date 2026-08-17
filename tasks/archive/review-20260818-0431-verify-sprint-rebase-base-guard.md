> **Archived**: 2026-08-18 04:31
> **Related Plan**: plans/archive/plan-20260818-0347-verify-sprint-rebase-base-guard.md
> **Outcome**: Completed
> **Lifecycle**: review
> **Parent Run ID**: run-20260818-0431

# Task Review: verify-sprint-rebase-base-guard

> **Status**: Pending
> **Plan**: plans/plan-20260818-0347-verify-sprint-rebase-base-guard.md
> **Contract**: tasks/contracts/20260818-0347-verify-sprint-rebase-base-guard.contract.md
> **Notes File**: tasks/notes/20260818-0347-verify-sprint-rebase-base-guard.notes.md
> **Checks File**: .ai/harness/checks/latest.json
> **Last Updated**: 2026-08-18 03:47
> **Recommendation**: pass
> **Review Rubric Version**: 2
> **Reviewed Subject SHA256**: pending
> **Reviewed Subject Scope**: normalized-final-content
> **Reviewed Target Revision**: pending

## Human Review Card

- Verdict: pass
- Change type: bugfix
- Intended files changed: `scripts/verify-sprint.sh`, `assets/templates/helpers/verify-sprint.sh`, `tests/verify-sprint-rebase-base-guard.test.ts`, plus this slice's plan/contract/notes/review and the closed ledger row
- Actual files changed: same; no other path touched
- Commands passed: `bun test` (2476 pass / 0 fail), `bun run check:type`, `bash scripts/verify-sprint.sh --prepare-acceptance` (total=16 failed=0 status=Fulfilled)
- Residual risks: the guard runs before every gate invocation, so a false positive would block all closeouts. Bounded by the ancestor-case test and by the guard returning early whenever no worktree metadata or no `base_commit` is present.
- Reviewer action required: inspect diff and card
- Rollback: revert this branch's commits; the guard is additive with no persisted state.

## Mode Evidence

- Selected route: bugfix — a real defect observed twice in production use, not a feature.
- P1/P2/P3 evidence: P1 the scope gate reads its diff base through `git_diff_base_ref` (`scripts/verify-sprint.sh:261`), which prefers `contract_worktree_base_commit` (`:221`) over `origin/main`. P2 traced start → `write_start_metadata` (`scripts/contract-worktree.sh:232`, early-returns once the file exists) → rebase moves the branch → `:237` accepts the orphaned commit on existence alone → `allowed_paths_check` charges the target's commits to this contract. P3 the immutability of `base_commit` is deliberate and correct for an unrebased worktree (`docs/reference-configs/sprint-contracts.md:176-182`), so the invariant to preserve is "the recorded base is the branch's fork point"; asserting it is the smallest change that keeps the invariant and refuses when it no longer holds.
- Root cause or plan evidence: `tasks/notes/20260818-0347-verify-sprint-rebase-base-guard.prefix-failure.txt` (`PRE_FIX_EXIT=1`), `tasks/lessons.md` 2026-08-18, closed `tasks/todos.md` row 22.

## Verification Evidence

- Waza `/check` run: not run; the contract gate plus the full suite covered this slice.
- Commands run: `bun test`, `bun run check:type`, `bash scripts/verify-sprint.sh --prepare-acceptance`, `diff -q` parity between the two helper copies, `bash -n` syntax check.
- Manual checks: reproduced the orphaned-base shape in a throwaway repo and confirmed `contract_worktree_base_commit` returns the orphan commit there, which is the value the guard now rejects.
- Supporting artifacts: `tasks/notes/20260818-0347-verify-sprint-rebase-base-guard.prefix-failure.txt`
- Implementation notes reviewed: yes — `tasks/notes/20260818-0347-verify-sprint-rebase-base-guard.notes.md`
- Run snapshot: `.ai/harness/runs/run-20260818T040941-45333-20260818-0347-verify-sprint-rebase-base-guard.json`

## Acceptance Receipt Projection

> **Disposition**: external_pass
> **Reviewer**: Claude
> **Source**: claude-review
> **Actor**: not-applicable
> **Reviewed Subject SHA256**: sha256:b2e1c68d471590dbbf77e93fe4b4a8d406f4e15b960b0728a42d88263b858dc0
> **Reviewed Subject Scope**: normalized-final-content
> **Reviewed Target Revision**: 3b541c8aa5831ffed1c09e3cf9dc1799e1c0a436
> **Verification Evidence SHA256**: sha256:e877de5be761bd03c6affe82885488cd7c01978ce5b94964f3d511723669b83b
> **Issued At**: 2026-08-17T20:31:38.390Z

- Summary: Fork-point equality predicate; guard verified live against this worktree's own post-rebase stale base. 16/16 contract criteria pass on the rebased tree, full suite 2476 pass / 0 fail, typecheck clean.
- Findings: none

## Behavior Diff Notes

- Before: a rebased contract worktree ran the gate to completion and reported an `allowed_paths` violation listing the target branch's own files, with the real cause visible only in the run snapshot's `diff_base` field.
- After: the same worktree stops before contract resolution with both the recorded base and the current fork point in stderr, plus the refresh command.
- Rejected mid-slice: an ancestry predicate (`merge-base --is-ancestor`), which passes on the observed case because the advanced target descends from the recorded base. See the notes.
- Unchanged: worktrees with no metadata, with an empty `base_commit` or `base_branch`, or whose recorded base still equals the fork point.

## Residual Risks / Follow-ups

- The guard rejects; it does not repair. Refreshing `.ai/harness/worktrees/<slug>.json` stays a manual step, deliberately — see the notes on why an automatic fallback to `origin/main` was rejected.
- `base_epoch` / evidence invalidation on rebase remains unmodelled. Not filed as a deferred goal: no observed case yet where a rebase left stale evidence bound to a contract.

## Scorecard

| Dimension | Score | Notes |
|-----------|-------|-------|
| Functionality | 9/10 | Fires on the exact shape observed twice in production, on the diverged-rebase shape, and stays silent on the healthy one |
| Product depth | 7/10 | Closes the diagnosis gap the lessons entries paid for twice; does not attempt the broader evidence-invalidation model |
| Design quality | 8/10 | Fail-closed with a named cause and no semantic fallback; placement at top level is forced by the `$(... \|\| true)` call convention |
| Code quality | 8/10 | Guard plus one extracted metadata-row reader across two byte-identical copies; three regression cases, one of which asserts the ancestry precondition so a rewrite back to `--is-ancestor` fails loudly |

## Failing Items

- none

## Retest Steps

- Re-run: `bun test tests/verify-sprint-rebase-base-guard.test.ts`
- Re-check: `bash scripts/verify-sprint.sh --prepare-acceptance` and `diff -q scripts/verify-sprint.sh assets/templates/helpers/verify-sprint.sh`

## Summary

- `verify-sprint` now refuses to run when a contract worktree's recorded `base_commit` is no longer the branch's current fork point against its `base_branch`, naming both SHAs instead of reporting the target's own commits as a scope violation. Closes `tasks/todos.md` row 22.
