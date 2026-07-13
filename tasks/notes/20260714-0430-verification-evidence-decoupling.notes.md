# Implementation Notes: verification-evidence-decoupling

> **Status**: Active
> **Plan**: plans/plan-20260714-0430-verification-evidence-decoupling.md
> **Contract**: tasks/contracts/20260714-0430-verification-evidence-decoupling.contract.md
> **Review**: tasks/reviews/20260714-0430-verification-evidence-decoupling.review.md
> **Last Updated**: 2026-07-14 04:43
> **Lifecycle**: notes

## Design Decisions

- Slice 1: applied the base_ref/base_rev hash-exclusion to both hash sites
  in `diff-fingerprint.ts` -- `buildDiffFingerprint` (lower-level,
  currently only consumed internally by `buildImplementationDiffFingerprint`
  for its sub-hashes, not its own `.fingerprint`) and
  `buildImplementationDiffFingerprint` (the actual review-freshness path).
  The contract named the file, not one function; leaving the dead-path
  hash inconsistent with its sibling would be a latent correctness bug if
  `buildDiffFingerprint`'s own fingerprint is ever consumed directly.
- Slice 1: the new "same-file target change" test needed a real `git
  rebase`, not just a target advance, to move the merge-base. Discovered
  empirically that single-line edits on adjacent lines (feature line 5,
  target line 6) make git's default merge-based rebase report a conflict
  even though the two sides touch different lines -- git's 3-way merge
  treats adjacent changed lines as one hunk. Used a 1-line gap (feature
  line 5, target line 7) instead: far enough apart for a clean rebase,
  still inside the default 3-line diff context window so the patch hash
  genuinely changes post-rebase.
- Slice 2: searched `scripts/`, `tests/`, `docs/` for "Human Review Card"
  and for any test constructing "canonical missing/unavailable + Card
  external=pass" before touching code (contract's Falsifier). Found no
  existing test that exercises the removed fallback path -- the closest
  matches (`tests/helper-scripts.test.ts` "should write passing structured
  checks", and `workflow-state-lib.test.ts`'s "external acceptance parser"
  test) all drive the canonical section's own Manual Override note, a
  separate and still-supported mechanism untouched by this change. There
  was nothing literal to delete; added a fresh end-to-end regression test
  instead and verified it would have passed pre-fix (reintroduced the old
  fallback block in a scratch copy, confirmed exit 0, confirmed exit 1
  with the fix) so it has real discriminating power.
- Slice 2: `scripts/verify-sprint.sh` projects into
  `assets/templates/helpers/verify-sprint.sh` via
  `scripts/sync-helper-sources.ts` (checked by
  `tests/helper-scripts.test.ts`'s "workflow contract drives a
  deterministic helper projection" test). The contract's Goal text named
  only `scripts/verify-sprint.sh`, but `assets/` was already in
  `allowed_paths`, and leaving the projection stale would fail that test
  in the final full `bun test` pass. Ran `bun run sync:helpers` to
  re-project after editing the canonical source.

## Deviations From Plan Or Spec

- None recorded.

## Tradeoffs Considered

| Option | Decision | Reason |
|--------|----------|--------|
| ... | ... | ... |

## Open Questions

- None.

## Evidence Links

- Checks: `.ai/harness/checks/latest.json`
- Run snapshots: `.ai/harness/runs/`

## Promotion Filter

Promote a candidate to `tasks/lessons.md`, `docs/researches/`, or harness asset files only when all three hold: hard to reverse, surprising without local context, and a real trade-off existed. If any one is missing, keep it in this notes file instead.

## Promotion Candidates

- Promote to `tasks/lessons.md` only after a repeated correction or failure pattern.
- Promote to `docs/researches/` only when it is durable repo knowledge with evidence.
- Promote to harness asset files only after verification across more than one task or fixture.
