> **Archived**: 2026-08-20 16:03
> **Related Plan**: plans/archive/plan-20260814-0157-architecture-queue-idempotent-events.md
> **Outcome**: Completed
> **Lifecycle**: notes
> **Parent Run ID**: run-20260820-1603

# Implementation Notes: architecture-queue-idempotent-events

> **Status**: Archived
> **Plan**: plans/plan-20260814-0157-architecture-queue-idempotent-events.md
> **Contract**: tasks/contracts/20260814-0157-architecture-queue-idempotent-events.contract.md
> **Review**: tasks/reviews/20260814-0157-architecture-queue-idempotent-events.review.md
> **Last Updated**: 2026-08-15 00:58
> **Lifecycle**: notes

## Design Decisions

- A pending request is a set of current semantic file events, not an edit-attempt log. Wall-clock `ts` is excluded from equality; the separate append-only JSONL remains an audit log only for actual semantic queue updates.
- `upsert-request` returns the closed vocabulary `changed|unchanged`; `architecture-queue.sh` fails closed on any other value and exits before JSONL append/reindex on `unchanged`.
- `record-event` owns one cross-process critical section. It persists the deduplicated audit event first, then atomically replaces the canonical card and derived index. A retry completes any interrupted suffix without duplicating the audit event.
- The card stores full canonical `Event Records`; `Event Fields` must match one validated record and every `event_key` must recompute from the per-file semantic fields. Markdown tables are presentation only.
- Every request/event/index write rejects symlink targets and parents resolving outside the repository, and uses same-directory temporary files plus rename.
- A durable transaction journal distinguishes retry from a later semantic recurrence (`K1 -> K2 -> K1` or archive/reopen), while the shared event-log lock prevents SessionStart rotation from racing the writer. Dead queue owners are reclaimed by PID evidence.
- Legacy-card reconstruction is preflighted against the existing audit log before any journal or event mutation. The writer and rotation path now share the same 60-second stale-lock contract, so neither side can reclaim the other's live lock at the former two-second boundary.
- Queue ownership is an atomic exclusive file carrying PID evidence; ownerless partial locks have bounded stale recovery. An unfinished transaction is replayed before a different incoming event, public CLI callers cannot inject migration events, and stable-card reconstruction reads both canonical monthly archives and the live log.
- Request archival now acquires that same queue-owner file before inspecting the live card and holds it through archive, reindex, contract projection, and rollback/commit. The lock lives under `.ai/harness/architecture`, outside the `docs/architecture` rollback snapshot; its cross-process owner is the live shell PID plus an opaque token, so rollback cannot remove it, a crashed archiver is reclaimable, and a live archiver cannot race `record-event`.
- SessionStart rotation rejects symlinks in both the source event-log path and the archive destination path before reading or writing, including a second source check inside the event-log lock.

## Deviations From Plan Or Spec

- Security review showed that a shell-level early exit was insufficient: card-first persistence could lose the audit record after interruption, concurrent Stop handlers could lose card entries, archival could hide a concurrent record, and editable Markdown hashes were not trustworthy authority. The contract scope was explicitly widened to the archive helper/projection and architecture-sync fixture so every queue writer shares one lock and every strict-gate fixture uses canonical card authority.

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
