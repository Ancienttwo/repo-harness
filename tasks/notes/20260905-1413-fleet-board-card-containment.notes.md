# Implementation Notes: fleet-board-card-containment

> **Status**: Active
> **Plan**: plans/plan-20260905-1413-fleet-board-card-containment.md
> **Contract**: tasks/contracts/20260905-1413-fleet-board-card-containment.contract.md
> **Review**: tasks/reviews/20260905-1413-fleet-board-card-containment.review.md
> **Last Updated**: 2026-09-05 17:50
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
- The Task Board send holds the task lock as the outer lock and takes the
  registry authorization lock for one short critical section that re-asserts
  registration plus `access_mode` and performs `writeImmutableEvent`. Checking
  authorization and then publishing outside that lock leaves a revoke-after-check
  window: an unlocked re-read cannot see a revocation that commits between the
  read and the write. The check and the write therefore share one critical
  section of the same lock revocation must take.
- Deadlock proof for the task -> registry nesting:
  `rg -n "withRepoHarnessRegistryAuthorizationLock" src` shows one definition in
  `src/effects/repo-registry.ts` and one product caller in
  `src/effects/fleet/task-message-request.ts`; `src/effects/repo-registry.ts`
  imports no lease, inbox, or coordination module and never calls `withTaskLock`
  or `withInboxTaskLock`, and the only caller-supplied hook run under that lock
  (`applyRepoHarnessRegistryBatch`'s `beforeCommit`, used by
  `src/cli/mcp/setup.ts:751`) writes a config file, so no path holds the registry
  lock and then waits for a task lock.
- `TaskInboxAuthorityRejection` exists so the caller's own typed authority
  failure crosses `withInboxTaskLock` unchanged. Without it the Task Inbox
  module flattened a `repository_read_only` rejection into
  `task_message_unreadable`, which named the wrong cause. It wraps only failures
  raised before the publication callback starts, so a genuine write failure keeps
  this module's own vocabulary.

## Deviations From Plan Or Spec

- The plan decided the lock order the other way: resolve the repository under
  the registry lock, release it, take the task lock, and carry the registry
  revision forward as a fence. The shipped code inverts that to task-outer,
  registry-inner, and replaces the fence with a second registry-lock critical
  section that re-proves registration, `access_mode`, and path and performs the
  write inside it. The plan's order left the re-check unlocked, which is the
  revoke-after-check window the external reviewer reproduced: a revocation
  landing between the release and the write was still published against the
  authorization it had already lost.
- The additive `FleetBoardCardV1.error` and `FleetBoardCountsV1.unclassified`
  fields are required members of the type `src/operator-web` shares, so the
  branch could not type-check without the browser transport decoding them. The
  minimal blocking fix is in scope: `decodeCard` reuses the existing
  `decodeError` allowlist for the card error and `decodeOperatorFleetSnapshot`
  requires `counts.unclassified`, plus the demo fixture literals. Board chips,
  composer copy, styling for the new fields, and all other client i18n work stay
  with the sibling browser package.
- `origin_required` was added to `OPERATOR_API_ERROR_CODES` in
  `src/operator-web/types.ts` with en/zh copy in `src/operator-web/i18n.ts`. The
  merged server (`src/effects/operator/server.ts`) already returns that code, so
  without the client entry the board raised `OperatorPayloadError` on a
  legitimate 403 instead of naming it. The #316 acceptance gate recorded this as
  "`origin_required` absent from the client i18n catalogue" and deferred it to
  ride this branch; the orchestrator adopted it here. The i18n half is not
  optional polish: `test.each([...OPERATOR_API_ERROR_CODES])` requires every code
  to resolve a message and an action in both locales, so adding the code without
  both locales fails the guard.
- Two existing tests encoded the old lock order and had to change meaning, not
  just shape. `tests/effects/operator-task-message.test.ts` no longer asserts
  that a sender holding registry authorization publishes ahead of a waiting
  revocation; under the new order the revocation lands immediately and the send
  fails closed at the task-lock re-check. `tests/cli/operator-serve.test.ts` now
  asserts the registry lock is *free* while a worker is stuck in a blocked
  canonical read.
- Merging `main` made `> **Status**:` required metadata on every live canonical
  sprint carrier (`isLiveSprint` in `src/effects/state/coordination-canonical-source.ts`).
  Two sprint fixtures this branch authored predate that contract and omitted the
  line, so the board collector reported `repo_board_unavailable` and the inbox
  scan threw instead of skipping. Both fixtures now declare
  `> **Status**: Executing`; no product behavior changed.
- `superseded_revision_count` needs no CLI surfacing work. `repo-harness fleet
  inbox list --json` writes `JSON.stringify(result)` of the whole
  `listTaskInbox` return (`src/cli/commands/fleet.ts:857-866`), so the new
  counter is already in the rendered output and there is no deferred item to
  carry.
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
| Keep the unlocked authority re-read inside the task lock | Rejected | A revocation committing between the read and the write is unobservable, so the send published against a read-only repository |
| Restore the original registry -> task order | Rejected | The proof above shows task -> registry closes no cycle, and the original order held a machine-global lock across canonical Git I/O and a five-second task-lock wait |
| Keep `assertEventCanonical` throwing in scans and filter its error at the fleet card | Rejected | The stale event would still hide every other message of that task from every other caller |

## Open Questions

- None.

## Evidence Links

- Checks: `.ai/harness/checks/latest.json`
- Run snapshots: `.ai/harness/runs/`
- Pre-fix artifacts: `.ai/harness/runs/pre-fix-operator-task-message-publication-authority.log`,
  `.ai/harness/runs/pre-fix-fleet-board-card-containment.log`,
  `.ai/harness/runs/pre-fix-fleet-board-projection.log`,
  `.ai/harness/runs/pre-fix-operator-fleet-snapshot.log`,
  `.ai/harness/runs/pre-fix-task-inbox-revision-skip.log`,
  `.ai/harness/runs/pre-fix-operator-task-message-lock-order.log`

## Promotion Filter

Promote a candidate to `tasks/lessons.md`, `docs/researches/`, or harness asset files only when all three hold: hard to reverse, surprising without local context, and a real trade-off existed. If any one is missing, keep it in this notes file instead.

## Promotion Candidates

- An additive field on a type shared with `src/operator-web` is not additive at
  the type level: the browser decoder and its fixture construct that type by
  literal, so every core field addition has to land the browser decode in the
  same slice. Promote to `tasks/lessons.md` if a second work package hits the
  same wall.
- Splitting a lock to fix an ordering problem moves the write out of the
  authority's critical section unless the write is deliberately put back inside
  it. "Check under the lock, then release, then write" is a revoke-after-check
  window, not a fence. Promote to `tasks/lessons.md` if it recurs.
