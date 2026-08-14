# Implementation Notes: change-assessment-oracle-redaction

> **Status**: Active
> **Plan**: plans/plan-20260815-0230-change-assessment-oracle-redaction.md
> **Contract**: tasks/contracts/20260815-0230-change-assessment-oracle-redaction.contract.md
> **Review**: tasks/reviews/20260815-0230-change-assessment-oracle-redaction.review.md
> **Last Updated**: 2026-08-15 02:30
> **Lifecycle**: notes

## Design Decisions

- Use the full JSON leaf path already supplied by `mapStringLeaves`; exempt
  only paths ending in `required_oracles/<canonical array index>/id`.
- Keep `findKnownSecretSpans` unconditional. The exemption skips only the
  entropy heuristic, so a known secret in the oracle position remains hashed.

## Deviations From Plan Or Spec

- The end-to-end materializer regression was strengthened to carry a real
  fingerprinted assessment and selection packet, not only their discriminants.

## Tradeoffs Considered

| Option | Decision | Reason |
|--------|----------|--------|
| Exempt every `id` key | Rejected | Broadens the entropy-redaction boundary for unrelated identifiers. |
| Recompute fingerprints after redaction | Rejected | Would change committed contract authority instead of preserving it. |
| Structural oracle-path exemption | Selected | Preserves the signed public ID with the narrowest security boundary. |

## Open Questions

- None.

## Evidence Links

- Checks: `.ai/harness/checks/latest.json`
- Run snapshots: `.ai/harness/runs/`
- Pre-fix failure: `.ai/harness/runs/20260815-change-assessment-oracle-redaction-pre-fix.log`

## Promotion Filter

Promote a candidate to `tasks/lessons.md`, `docs/researches/`, or harness asset files only when all three hold: hard to reverse, surprising without local context, and a real trade-off existed. If any one is missing, keep it in this notes file instead.

## Promotion Candidates

- Promote to `tasks/lessons.md` only after a repeated correction or failure pattern.
- Promote to `docs/researches/` only when it is durable repo knowledge with evidence.
- Promote to harness asset files only after verification across more than one task or fixture.
