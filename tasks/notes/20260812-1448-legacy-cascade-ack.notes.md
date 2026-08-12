# Implementation Notes: legacy-cascade-ack

> **Status**: Active
> **Plan**: plans/plan-20260812-1448-legacy-cascade-ack.md
> **Contract**: tasks/contracts/20260812-1448-legacy-cascade-ack.contract.md
> **Review**: tasks/reviews/20260812-1448-legacy-cascade-ack.review.md
> **Last Updated**: 2026-08-12 14:56
> **Lifecycle**: notes

## Design Decisions

- Keep the Stop-time git cursor as the only changed-set authority. The defect is acknowledgement conflation, not changed-set construction.
- Treat runner absence and any non-zero command in a request-triggered legacy cascade as delivery failure. Cursor acknowledgement represents completion of the complete legacy cascade, not merely the primary classifier call.

## Deviations From Plan Or Spec

- None recorded.

## Tradeoffs Considered

| Option | Decision | Reason |
|--------|----------|--------|
| Restore journal architecture delivery | Reject | Reintroduces dual authority and still misses shell writes. |
| Advance after `architecture-queue record` but ignore follow-up failures | Reject | The frozen plan names the cascade outcome as the acknowledgement boundary; partial context/capability sync is not complete delivery. |
| Return a typed result from the existing cascade function | Use | Smallest change that lets both consumers fail closed without duplicating classifier semantics. |

## Open Questions

- None.

## Evidence Links

- Checks: `.ai/harness/checks/latest.json`
- Run snapshots: `.ai/harness/runs/`
- Pre-fix regression: `.ai/harness/runs/legacy-cascade-ack-pre-fix.log` records the two focused guards failing against the original implementation (43 pass, 2 fail).
- Targeted green: `bun test tests/architecture-drift.test.ts tests/stop-handler.test.ts tests/mutation-observed.test.ts tests/architecture-projection-orchestration.test.ts` (78 pass, 0 fail).
- Typecheck: `bun run check:type` (exit 0).

## Promotion Filter

Promote a candidate to `tasks/lessons.md`, `docs/researches/`, or harness asset files only when all three hold: hard to reverse, surprising without local context, and a real trade-off existed. If any one is missing, keep it in this notes file instead.

## Promotion Candidates

- Promote to `tasks/lessons.md` only after a repeated correction or failure pattern.
- Promote to `docs/researches/` only when it is durable repo knowledge with evidence.
- Promote to harness asset files only after verification across more than one task or fixture.
