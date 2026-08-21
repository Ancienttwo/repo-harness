> **Archived**: 2026-08-21 12:26
> **Related Plan**: plans/archive/plan-20260821-1136-basegate-ancestor-relax.md
> **Outcome**: Completed
> **Lifecycle**: notes
> **Parent Run ID**: run-20260821-1226

# Implementation Notes: basegate-ancestor-relax

> **Status**: Active
> **Plan**: plans/plan-20260821-1136-basegate-ancestor-relax.md
> **Contract**: tasks/contracts/20260821-1136-basegate-ancestor-relax.contract.md
> **Review**: tasks/reviews/20260821-1136-basegate-ancestor-relax.review.md
> **Last Updated**: 2026-08-21 11:36
> **Lifecycle**: notes

## Design Decisions

- The guard compares resolved SHAs (`base_local_sha` / `base_upstream_sha`) once and reuses them for both `merge-base --is-ancestor` and the diagnostic lines, instead of the old shape that re-ran `git rev-parse` four times.
- No-upstream behavior is untouched: `base_upstream` empty still skips the block entirely, as before.
- `reason=base_ref_unsynchronized` is kept as the token (pinned by `tests/verify-sprint-rebase-base-guard.test.ts` and described in `docs/researches/20260818-base-guard-cross-review-handoff.md`); only the human message and remediation line changed.

## Deviations From Plan Or Spec

- The existing behind-quadrant test was refactored onto the new shared `seedTrackingClone` fixture rather than left duplicated; the four quadrants now share one setup path. Behavior asserted is unchanged plus the new `behind or diverged` message assertion.
- `REPO_HARNESS_NODE_BIN` was added to `runHelper`'s env strip list (previously only `REPO_HARNESS_SOURCE_ROOT`), per the brief's project-memory instruction about host runtime leakage into spawned fixtures.

## Tradeoffs Considered

| Option | Decision | Reason |
|--------|----------|--------|
| New `reason=` token for behind/diverged | Rejected | Frozen decision 2 keeps the token; downstream test and research doc pin the literal |
| Assert full exit status on the equal/ahead quadrants | Rejected | The fixtures exercise the guard, not the whole gate; asserting absence of `reason=base_ref_unsynchronized` is the precise claim |
| Leave the behind test's inline clone setup duplicated | Rejected | Four quadrants sharing one fixture makes the matrix legible and keeps drift out |

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
