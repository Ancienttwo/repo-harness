# Implementation Notes: architecture-queue-idempotent-events

> **Status**: Active
> **Plan**: plans/plan-20260814-0157-architecture-queue-idempotent-events.md
> **Contract**: tasks/contracts/20260814-0157-architecture-queue-idempotent-events.contract.md
> **Review**: tasks/reviews/20260814-0157-architecture-queue-idempotent-events.review.md
> **Last Updated**: 2026-08-14 01:57
> **Lifecycle**: notes

## Design Decisions

- A pending request is a set of current semantic file events, not an edit-attempt log. Wall-clock `ts` is excluded from equality; the separate append-only JSONL remains an audit log only for actual semantic queue updates.
- `upsert-request` returns the closed vocabulary `changed|unchanged`; `architecture-queue.sh` fails closed on any other value and exits before JSONL append/reindex on `unchanged`.

## Deviations From Plan Or Spec

- None recorded.

## Tradeoffs Considered

| Option | Decision | Reason |
|--------|----------|--------|
| Content fingerprint | Rejected | Current queue cards do not store one; adding it would force a one-time rewrite and widen the event schema. The queue only needs to know whether its represented semantic state changed. |
| Compare rendered bytes after a fresh timestamp | Rejected | The timestamp itself guarantees different bytes and does not prevent event-log growth. |
| Compare normalized semantic event fields | Selected | Smallest change that preserves real routing updates and makes repeat observation byte-idempotent. |

## Open Questions

- None.

## Evidence Links

- Checks: `.ai/harness/checks/latest.json`
- Run snapshots: `.ai/harness/runs/`
- Pre-fix regression: `.ai/harness/runs/architecture-queue-idempotent-events-pre-fix.txt`

## Promotion Filter

Promote a candidate to `tasks/lessons.md`, `docs/researches/`, or harness asset files only when all three hold: hard to reverse, surprising without local context, and a real trade-off existed. If any one is missing, keep it in this notes file instead.

## Promotion Candidates

- Promote to `tasks/lessons.md` only after a repeated correction or failure pattern.
- Promote to `docs/researches/` only when it is durable repo knowledge with evidence.
- Promote to harness asset files only after verification across more than one task or fixture.
