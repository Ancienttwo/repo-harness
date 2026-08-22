> **Archived**: 2026-08-23 00:48
> **Related Plan**: plans/archive/plan-20260822-2346-issue-216-bun-runtime-floor.md
> **Outcome**: Completed
> **Lifecycle**: notes
> **Parent Run ID**: run-20260823-0048

# Implementation Notes: issue-216-bun-runtime-floor

> **Status**: Active
> **Plan**: plans/plan-20260822-2346-issue-216-bun-runtime-floor.md
> **Contract**: tasks/contracts/20260822-2346-issue-216-bun-runtime-floor.contract.md
> **Review**: tasks/reviews/20260822-2346-issue-216-bun-runtime-floor.review.md
> **Last Updated**: 2026-08-22 23:47
> **Lifecycle**: notes

## Design Decisions

- Treat Bun 1.4.0 as the minimum supported runtime, not merely the CI pin. Issue #216 is caused by accepting Bun 1.3.14 after the repository had already moved its verified runtime baseline to 1.4.0.
- Preserve the existing publication provider subprocess contract. Adding explicit `env` propagation would create a compatibility path for a runtime the package no longer supports and would leave other Bun 1.3 behavior differences exposed.
- Keep two explicit 1.3.14 global-runtime boundary cases: a self-managed Bun is upgraded and verified; a package-manager-owned Bun fails closed with an actionable instruction. All non-boundary fake Bun fixtures now report 1.4.0.
- Enforce the same floor at the CLI dispatch boundary. `package.json#engines` is declaration-only on older Bun releases, so installer checks alone cannot protect direct source/package entrypoints.

## Deviations From Plan Or Spec

- None recorded.

## Tradeoffs Considered

| Option | Decision | Reason |
|--------|----------|--------|
| Raise the public runtime floor | Selected | Matches the already-landed CI baseline and rejects the known-bad runtime before product execution. |
| Pass `env` explicitly only in publication helpers | Rejected | It would mask one Bun 1.3 incompatibility while continuing to advertise an unverified runtime. |
| Remove old-runtime branch tests | Rejected | The self-managed upgrade and package-manager fail-closed paths have intentionally different ownership behavior. |
| Rely only on installer and package metadata | Rejected | Direct CLI invocation can bypass installer mutation, and affected Bun versions do not reliably enforce `engines`; the CLI now rejects before command dispatch. |

## Open Questions

- None.

## Evidence Links

- Checks: `.ai/harness/checks/latest.json`
- Run snapshots: `.ai/harness/runs/`

## Promotion Filter

Promote a candidate to `tasks/lessons.md`, `docs/researches/`, or harness asset files only when all three hold: hard to reverse, surprising without local context, and a real trade-off existed. If any one is missing, keep it in this notes file instead.

## Promotion Candidates

- None. The existing Bun 1.4 lessons already cover runtime-upgrade verification; this slice enforces the missing public floor through product tests and current documentation.
