> **Archived**: 2026-08-18 02:21
> **Related Plan**: plans/archive/plan-20260818-0126-typed-lock-transient-errors.md
> **Outcome**: Completed
> **Lifecycle**: notes
> **Parent Run ID**: run-20260818-0221

# Implementation Notes: typed-lock-transient-errors

> **Status**: Active
> **Plan**: plans/plan-20260818-0126-typed-lock-transient-errors.md
> **Contract**: tasks/contracts/20260818-0126-typed-lock-transient-errors.contract.md
> **Review**: tasks/reviews/20260818-0126-typed-lock-transient-errors.review.md
> **Last Updated**: 2026-08-18 01:26
> **Lifecycle**: notes

## Design Decisions

- The regression guard raises every lock failure from the real lock layer instead
  of hand-writing an `Error` with the matching text: `assertOwned()` is driven
  into its lost-ownership throw by publishing a second entry inside the held
  lock directory, and the timeout throw by a second acquire with
  `waitTimeoutMs: 1` while the lock is held. A message-shaped fake would have
  passed under the old string-match classifier too, so it could not have proved
  the classification is type-driven.
- `StateResolutionUnstableError` lives in `resolve-effective-state.ts` (its only
  throw site) rather than beside `StateVersionConfirmMismatchError` in
  `git-state-version-store.ts`. Same ownership rule as the precedent -- the
  module that throws owns the type -- and it keeps the classifier's import
  pointing at the module whose failure it classifies.
- `tests/session-state-authority.test.ts` mocks the resolver module through
  `mock.module`. Its factory now spreads the real module before overriding
  `resolveEffectiveState`, because `runtime.ts` imports
  `StateResolutionUnstableError` from that same module: a replacement-only
  factory would drop the class and turn the `instanceof` check into a
  `TypeError` on `undefined`.

## Deviations From Plan Or Spec

- None in the code change. Two contract-declaration gaps block
  `verify-sprint --prepare-acceptance` and were left for the contract owner
  rather than self-authored:
  - `allowed_paths` omits
    `tasks/notes/20260818-0126-typed-lock-transient-errors.prefix-failure.txt`,
    the artifact the contract's own `Root Cause Evidence.pre_fix_failure_artifact`
    field requires; the `allowed_paths` guard reports it as the only outside path.
  - `Change Assessment` declares `oracles: []`, so the strict `auth` category's
    `authority_change` reason has no covering `deterministic_test` oracle and the
    assessment resolves `blocked` with an `oracle_gap` reason.

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
