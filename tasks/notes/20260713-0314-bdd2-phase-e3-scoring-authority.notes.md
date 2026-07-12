# Implementation Notes: bdd2-phase-e3-scoring-authority

> **Status**: Active
> **Plan**: plans/plan-20260713-0314-bdd2-phase-e3-scoring-authority.md
> **Contract**: tasks/contracts/20260713-0314-bdd2-phase-e3-scoring-authority.contract.md
> **Review**: tasks/reviews/20260713-0314-bdd2-phase-e3-scoring-authority.review.md
> **Last Updated**: 2026-07-13 03:15
> **Lifecycle**: notes

## Design Decisions

- E3 is a direct current-authority cut; the runner accepts only the E3 manifest.
- The tracked E3 corpus contains 120 redacted E2 full/normalized responses plus their
  original hashes, while ignored E2 runs remain provenance input rather than required
  clean-checkout state.
- Proposal-only outcome scores cannot judge filesystem artifacts. I3, if enabled,
  derives artifact delta only from before/after inventories.
- Primary disagreement resolution is a frozen fresh holistic adjudicator score. It
  never unions, averages, or mechanically selects primary fields.
- Evidence compliance counts unsupported assertions as violations and records explicit
  limitations separately without penalizing them.

## Deviations From Plan Or Spec

- The first S3 transport attempt was rejected before any score was returned because
  the response schema used `const` without the provider-required explicit string
  `type`. The empty/partial ignored run was discarded and authority was resealed as
  revision r2 before held-out scoring. No score or decision existed under r1.

## Tradeoffs Considered

| Option | Decision | Reason |
|--------|----------|--------|
| Regenerate E2 intervention outputs | Reject | The defect was scoring authority, not the frozen intervention. |
| Reuse old owner-proxy scores | Reject | Their aggregation semantics were not sealed. |
| Rescore frozen output with fresh isolated reviewers | Use | Corrects only the invalid layer while preserving intervention evidence. |
| Keep E2 and E3 parsers active | Reject | Current authority must remain singular and fail closed. |

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
