# Implementation Notes: architecture-queue-idempotent-events

> **Status**: Active
> **Plan**: plans/plan-20260814-0157-architecture-queue-idempotent-events.md
> **Contract**: tasks/contracts/20260814-0157-architecture-queue-idempotent-events.contract.md
> **Review**: tasks/reviews/20260814-0157-architecture-queue-idempotent-events.review.md
> **Last Updated**: 2026-08-14 05:20
> **Lifecycle**: notes

## Design Decisions

- A pending request is a set of current semantic file events, not an edit-attempt log. Wall-clock `ts` is excluded from equality; the separate append-only JSONL remains an audit log only for actual semantic queue updates.
- `upsert-request` returns the closed vocabulary `changed|unchanged`; `architecture-queue.sh` fails closed on any other value and exits before JSONL append/reindex on `unchanged`.
- `record-event` owns one cross-process critical section. It persists the deduplicated audit event first, then atomically replaces the canonical card and derived index. A retry completes any interrupted suffix without duplicating the audit event.
- The card stores full canonical `Event Records`; `Event Fields` must match one validated record and every `event_key` must recompute from the per-file semantic fields. Markdown tables are presentation only.
- Every request/event/index write rejects symlink targets and parents resolving outside the repository, and uses same-directory temporary files plus rename.
- A durable transaction journal distinguishes retry from a later semantic recurrence (`K1 -> K2 -> K1` or archive/reopen), while the shared event-log lock prevents SessionStart rotation from racing the writer. Dead queue owners are reclaimed by PID evidence.

## Deviations From Plan Or Spec

- Security review showed that a shell-level early exit was insufficient: card-first persistence could lose the audit record after interruption, concurrent Stop handlers could lose card entries, and editable Markdown hashes were not trustworthy authority. The slice was widened within the same six code/test paths to make the whole queue update convergent and fail closed.

## Tradeoffs Considered

| Option | Decision | Reason |
|--------|----------|--------|
| Content fingerprint | Rejected | Current queue cards do not store one; adding it would force a one-time rewrite and widen the event schema. The queue only needs to know whether its represented semantic state changed. |
| Compare rendered bytes after a fresh timestamp | Rejected | The timestamp itself guarantees different bytes and does not prevent event-log growth. |
| Compare normalized semantic event fields | Selected | Smallest change that preserves real routing updates and makes repeat observation byte-idempotent. |
| Shell-managed card then append | Rejected after review | It has an unrecoverable interruption window and no cross-process serialization. |
| Locked TS transaction with event-first reconciliation | Selected | Retrying completes card/index state while the semantic key prevents duplicate JSONL events. |

## Open Questions

- None.

## Evidence Links

- Checks: `.ai/harness/checks/latest.json`
- Run snapshots: `.ai/harness/runs/`
- Pre-fix regression: `.ai/harness/runs/architecture-queue-idempotent-events-pre-fix.txt`
- Focused verification: architecture/event queue regressions cover byte-idempotency, interruption, recurrence, archive/reopen, stable-card migration, SIGKILL recovery, concurrent writers, metadata authority, and symlink boundaries; Stop and SessionStart tests cover the shared rotation lock.
- Safety verification: helper projection, architecture sync, deploy SQL order, strict workflow, project-state inspection, init dry-run, and architecture reindex checks pass.

## Promotion Filter

Promote a candidate to `tasks/lessons.md`, `docs/researches/`, or harness asset files only when all three hold: hard to reverse, surprising without local context, and a real trade-off existed. If any one is missing, keep it in this notes file instead.

## Promotion Candidates

- Promote to `tasks/lessons.md` only after a repeated correction or failure pattern.
- Promote to `docs/researches/` only when it is durable repo knowledge with evidence.
- Promote to harness asset files only after verification across more than one task or fixture.
