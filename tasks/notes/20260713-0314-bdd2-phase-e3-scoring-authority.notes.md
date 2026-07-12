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
- The r2 preflight exposed a second provider-schema restriction: `uniqueItems` is not
  accepted in structured output schemas. Runtime validation already enforces unique
  correction operations, so the unsupported JSON Schema keyword was removed and the
  still-unscored authority was resealed as r3.
- The r3 S3 run produced only an incomplete, unrevealed score directory before one
  model response echoed the wrong opaque packet id. The incomplete run had no run
  manifest or decision and was discarded. R4 freezes a maximum of three attempts for
  model responses; only a schema-valid response with the exact packet id can become a
  locked score.
- S3 completed validly under r4. The first EB3/EI3 attempts then failed before a
  complete adapter score run because the runner parsed the Markdown appendix as JSON.
  Partial adapter directories had no run manifest or decision and were discarded.
  The adapter-only authority was resealed as r5 with the frozen appendix delivered as
  text; the completed S3 r4 evidence remains immutable.

## Tradeoffs Considered

| Option | Decision | Reason |
|--------|----------|--------|
| Regenerate E2 intervention outputs | Reject | The defect was scoring authority, not the frozen intervention. |
| Reuse old owner-proxy scores | Reject | Their aggregation semantics were not sealed. |
| Rescore frozen output with fresh isolated reviewers | Use | Corrects only the invalid layer while preserving intervention evidence. |
| Keep E2 and E3 parsers active | Reject | Current authority must remain singular and fail closed. |

## Open Questions

- None. The E3 gate is terminal for the current treatments; any future BDD² direction
  requires a new product thesis and new intervention, not another scoring revision.

## Recorded Results

- S3: `Kill` — 50% unsupported-expansion reduction, but four new paired P0/P1
  protected-concern regressions.
- EB3: `Kill` — five closure wins and zero losses, but below the six-win threshold and
  with one unsupported retry-policy/feature-need inference.
- EI3: `Kill` — one win, three losses, and one unsupported lower-friction assertion.
- I3: `Defer — gated-not-run` because S3 and both adapters failed their gates.
- Final authority freezes each tracked result and the original score-manifest hash;
  raw ignored score runs remain independently validateable after closeout.

## Evidence Links

- Checks: `.ai/harness/checks/latest.json`
- Run snapshots: `.ai/harness/runs/`

## Promotion Filter

Promote a candidate to `tasks/lessons.md`, `docs/researches/`, or harness asset files only when all three hold: hard to reverse, surprising without local context, and a real trade-off existed. If any one is missing, keep it in this notes file instead.

## Promotion Candidates

- Promote to `tasks/lessons.md` only after a repeated correction or failure pattern.
- Promote to `docs/researches/` only when it is durable repo knowledge with evidence.
- Promote to harness asset files only after verification across more than one task or fixture.
