# Implementation Notes: fleet-board-card-containment

> **Status**: Active
> **Plan**: plans/plan-20260905-1413-fleet-board-card-containment.md
> **Contract**: tasks/contracts/20260905-1413-fleet-board-card-containment.contract.md
> **Review**: tasks/reviews/20260905-1413-fleet-board-card-containment.review.md
> **Last Updated**: 2026-09-05 16:05
> **Lifecycle**: notes

## Design Decisions

- Round preemption is the one failure that is still not contained at the card
  boundary. `isCollectionPreemption` in `src/effects/fleet/board.ts` treats a
  `FleetBoardError` or a `repo_collection_timeout` `FleetRepositoryError` as
  round-level and rethrows it, because the deadline and the abort belong to the
  round, not to the card that happened to observe them first.
- "Still pending at the deadline" is now a recorded fact instead of a clock read.
  `collectFleetBoard` keeps an in-flight token per repository and the deadline
  timer copies the in-flight set into `preempted`. The previous
  `deadlineExceededNow()` check after the await discarded a completed
  observation whenever the round clock crossed the deadline while the event loop
  was blocked, even though the repository's own final `assertCollectionActive`
  had already proved it finished in time.
- The Agent Runtime tear check re-reads the effect store once per card rather
  than once per repository. The statuses are read once for the repository but
  joined against per-card delivery receipts, so only a per-card re-read can
  observe that specific join being torn.
- The Task Board send keeps its registry fence by re-reading the registry
  without a lock inside the task lock and comparing `registryRevision`. Taking
  the registry lock there would restore the machine-global lock underneath the
  per-task lock, which is exactly the ordering this change removes; the registry
  writer publishes whole documents by rename, so a lock-free read observes one
  complete revision.
- `TaskInboxAuthorityRejection` exists so the caller's own typed authority
  failure crosses `withInboxTaskLock` unchanged. Without it the Task Inbox
  module flattened a `repository_read_only` rejection into
  `task_message_unreadable`, which named the wrong cause.

## Deviations From Plan Or Spec

- The plan's transport decision is implemented, but the additive
  `FleetBoardCardV1.error` and `FleetBoardCountsV1.unclassified` fields are
  required members of the type the browser shares, so `bun run check:type`
  reports six errors in `src/operator-web/types.ts` and
  `src/operator-web/fixture.ts`. That surface is a declared non-goal and is not
  in this contract's Allowed Paths, so it is left to the sibling browser work
  package. `bun run build:operator-web` is unaffected.
- Two existing tests encoded the old lock order and had to change meaning, not
  just shape. `tests/effects/operator-task-message.test.ts` no longer asserts
  that a sender holding registry authorization publishes ahead of a waiting
  revocation; under the new order the revocation lands immediately and the send
  fails closed at the task-lock re-check. `tests/cli/operator-serve.test.ts` now
  asserts the registry lock is *free* while a worker is stuck in a blocked
  canonical read.
- `createFleetProviderObservationLimiter` is exported so the slot-transfer
  invariant has a deterministic unit guard; the release window it protects is
  one microtask wide and cannot be reproduced through the provider fixture.
- The plan lists `src/effects/operator/fleet-collector-process.ts` as "modify
  only if its decoder is exact-key". It is not: the collector parses only the
  *request*, and `src/effects/operator/server.ts` accepts the snapshot response
  by cast, so no collector change was needed.

## Tradeoffs Considered

| Option | Decision | Reason |
|--------|----------|--------|
| Drop the post-await deadline relabel entirely | Rejected | An injected collector can return after being aborted; the in-flight token still needs to discard that result |
| Re-read the Agent Runtime store once per repository | Rejected | The torn join is per card, so a repository-level compare would report the wrong cards changed |
| Re-take the registry lock inside the task lock | Rejected | Restores registry-under-task ordering, which is the deadlock shape being removed |
| Keep `assertEventCanonical` throwing in scans and filter its error at the fleet card | Rejected | The stale event would still hide every other message of that task from every other caller |

## Open Questions

- None.

## Evidence Links

- Checks: `.ai/harness/checks/latest.json`
- Run snapshots: `.ai/harness/runs/`
- Pre-fix artifacts: `.ai/harness/runs/pre-fix-fleet-board-card-containment.log`,
  `.ai/harness/runs/pre-fix-fleet-board-projection.log`,
  `.ai/harness/runs/pre-fix-operator-fleet-snapshot.log`,
  `.ai/harness/runs/pre-fix-task-inbox-revision-skip.log`,
  `.ai/harness/runs/pre-fix-operator-task-message-lock-order.log`

## Promotion Filter

Promote a candidate to `tasks/lessons.md`, `docs/researches/`, or harness asset files only when all three hold: hard to reverse, surprising without local context, and a real trade-off existed. If any one is missing, keep it in this notes file instead.

## Promotion Candidates

- An additive field on a type shared with `src/operator-web` is not additive at
  the type level: the browser decoder and its fixture construct that type by
  literal, so every core field addition needs the browser package in the same
  slice or an explicit follow-up. Promote to `tasks/lessons.md` if a second
  work package hits the same wall.
