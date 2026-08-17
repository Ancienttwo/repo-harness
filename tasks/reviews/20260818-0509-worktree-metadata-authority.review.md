# Task Review: worktree-metadata-authority

> **Status**: Pending
> **Plan**: plans/plan-20260818-0509-worktree-metadata-authority.md
> **Contract**: tasks/contracts/20260818-0509-worktree-metadata-authority.contract.md
> **Notes File**: tasks/notes/20260818-0509-worktree-metadata-authority.notes.md
> **Checks File**: .ai/harness/checks/latest.json
> **Last Updated**: 2026-08-18 05:09
> **Recommendation**: pass
> **Review Rubric Version**: 2
> **Reviewed Subject SHA256**: pending
> **Reviewed Subject Scope**: normalized-final-content
> **Reviewed Target Revision**: pending

## Human Review Card

- Verdict: pass
- Change type: bugfix
- Intended files changed: `scripts/verify-sprint.sh`, `assets/templates/helpers/verify-sprint.sh`, `tests/verify-sprint-rebase-base-guard.test.ts`, plus this slice's plan/contract/notes/review
- Actual files changed: same; no other path touched
- Commands passed: `bun test` (2498 pass / 0 fail), `bun run check:type`, contract gate
- Residual risks: the guard now fails closed on nine states it previously ignored, so a metadata shape nobody anticipated blocks a gate instead of passing it. The first draft did exactly that to the legacy `started_at` fallback and the full suite caught it; the three-way split in the notes is the correction.
- Reviewer action required: inspect diff and card
- Rollback: revert this branch's commits; selection and guard are one function each and carry no persisted state.

## Mode Evidence

- Selected route: bugfix — a reproduced bypass in the guard shipped by `6ad02039`.
- P1/P2/P3 evidence: P1 the scope-base authority is `contract_worktree_base_commit` inside `git_diff_base_ref`, with the guard as a separate reader of the same metadata directory. P2 traced two metadata files in one fixture: the emitter skipped rows only on empty serialization, an all-empty record joins to two separators, `head -1` gave the guard that record, and the resolver's own loop skipped it and took the stale base from the next file. P3 the invariant is that one record describes this worktree; the previous code asserted it in a comment and implemented per-caller selection, so the fix is a single selector both sides consume rather than a second condition in the guard.
- Root cause or plan evidence: `tasks/notes/20260818-0509-worktree-metadata-authority.prefix-failure.txt` (`PRE_FIX_EXIT=1`, 10 of 13 cases failing on the unfixed code).

## Verification Evidence

- Waza `/check` run: not run; the contract gate plus the full suite covered this slice.
- Commands run: `bun test`, `bun run check:type`, `bash scripts/verify-sprint.sh --prepare-acceptance`, `diff -q` parity between the two helper copies, `bash -n`.
- Manual checks: reproduced the bypass and the stacked-source shape in throwaway repos before writing either fixture, and confirmed the guard is silent with `jq` removed from `PATH` on the unfixed code.
- Supporting artifacts: `tasks/notes/20260818-0509-worktree-metadata-authority.prefix-failure.txt`
- Implementation notes reviewed: yes — `tasks/notes/20260818-0509-worktree-metadata-authority.notes.md`
- Run snapshot: recorded by the contract gate under `.ai/harness/runs/`

## Acceptance Receipt Projection

> **Disposition**: external_pass
> **Reviewer**: Claude
> **Source**: claude-review
> **Actor**: not-applicable
> **Reviewed Subject SHA256**: sha256:e5f4323962d9fb6bb26fc4b3f62598c1726d30bfe48a29b92137968b0892559c
> **Reviewed Subject Scope**: normalized-final-content
> **Reviewed Target Revision**: 639b5fc7950c09a523d421556cfd24bb97b6d966
> **Verification Evidence SHA256**: sha256:58f149fa4f73b1892643885f7b4e3e204192f15f4a31578e4455d468bf2cce9e
> **Issued At**: 2026-08-17T21:46:34.517Z

- Summary: One typed selector for worktree base metadata; reproduced bypass closed, eleven named fail-closed causes. 16/16 contract criteria pass, full suite 2498 pass / 0 fail.
- Findings: none

## Behavior Diff Notes

- Before: every matching metadata row was emitted and each caller picked its own; an all-empty record silenced the guard while the resolver used a stale base from another file; a missing `jq` removed the guard entirely; every failure claimed a rebase.
- After: one selector returns one record with its source file, exact-worktree match outranking branch match and duplicates on either failing closed; both callers read that record; eleven named causes replace the single rebase message.
- Unchanged: repos with no matching metadata, the legacy `base_branch` + `started_at` fallback, and any run with an explicit diff-base override.

## Residual Risks / Follow-ups

- `stacked_source_start` fails closed by design. If stacked contract worktrees should be supported, `base_commit` has to split into a scope origin and an integration base — a product decision this slice deliberately leaves open.
- The criss-cross fixture returns early when the local git build does not produce two best merge bases, so that case is opportunistic rather than guaranteed coverage.

## Scorecard

| Dimension | Score | Notes |
|-----------|-------|-------|
| Functionality | 9/10 | 13 cases; the reproduced bypass, duplicates, precedence, malformed, unparseable, absent parser, unresolvable and unsynchronized refs, ambiguity, stacked start, and override |
| Product depth | 8/10 | Fixes the selection authority rather than adding another condition to a single comparison |
| Design quality | 9/10 | Agreement between guard and resolver is now structural; failure causes are named rather than guessed |
| Code quality | 8/10 | Two functions replace one, mirrored byte-identically; the legacy-fallback relaxation is the one place where uniform fail-closed was wrong |

## Failing Items

- none

## Retest Steps

- Re-run: `bun test tests/verify-sprint-rebase-base-guard.test.ts`
- Re-check: `bun test` and `diff -q scripts/verify-sprint.sh assets/templates/helpers/verify-sprint.sh`

## Summary

- One typed selector now chooses a single contract-worktree metadata record, both the diff-base resolver and the staleness guard read it, and every unverifiable state fails closed under its own name. Closes the bypass reproduced against `6ad02039`.
