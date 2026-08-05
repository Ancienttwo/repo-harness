> **Archived**: 2026-08-05 20:49
> **Related Plan**: plans/archive/plan-20260805-2041-verifier-wrapper-1260s.md
> **Outcome**: Completed
> **Lifecycle**: notes
> **Parent Run ID**: run-20260805-2049

# Implementation Notes: verifier-wrapper-1260s

> **Status**: Active
> **Plan**: plans/plan-20260805-2041-verifier-wrapper-1260s.md
> **Contract**: tasks/contracts/20260805-2041-verifier-wrapper-1260s.contract.md
> **Review**: tasks/reviews/20260805-2041-verifier-wrapper-1260s.review.md
> **Last Updated**: 2026-08-05 20:41
> **Lifecycle**: notes

## Design Decisions

- Sizing evidence: two verifier rounds died at the OUTER wrapper on 2026-08-05 (~21:0x and ~21:1x, ELAPSED 720/721s) with `process timed out after 720000ms`, blocking the hook-entry-single-file-bundle shipment. `1_260_000` = the merged inner budget `1_200_000` (`scripts/verify-contract.sh:5`) + 60s margin, which puts the wrapper strictly above the inner gate instead of 480s below it.
- The margin exists for an observability reason, not a performance one. Neither wrapper kill emitted a run snapshot or a `budget_ms` field, so a 720-1200s round produced no evidence at all about why it died — while the inner gate fails closed with a `verification_budget` failure class and timing evidence. The ordering invariant is what matters: the wrapper must only ever fire when the inner gate has already failed to, so the evidence-emitting path is always the one that trips first. 60s is enough for the inner gate to finish writing its snapshot and exit.
- Constant only; the wrapper keeps its existing fail-closed kill semantics. `src/cli/runtime/helper-runner.ts:133` is the sole reader, returning it for the `verify-contract` and `verify-sprint` helper identities, so no other line moved.
- This was predicted. The previous work-package's review (`tasks/archive/review-20260805-2010-verify-budget-1200s.md:87`) flagged that raising the inner budget to 1200s left this outer 720s ceiling below it and would convert 720-1200s rounds into wrapper kills. It was correctly held out of that contract's scope; the prediction landed twice within the hour.

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
