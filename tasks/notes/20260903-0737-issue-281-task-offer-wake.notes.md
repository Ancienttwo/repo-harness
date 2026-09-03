# Implementation Notes: issue-281-task-offer-wake

> **Substantive Change SHA256**: `sha256:b2c1a5719c0030e40d6c261b37617cd6e8fa5ff8168894c63291428cfbc27a12`

> **Substantive Change SHA256**: `sha256:a82b0fab8f64172b34b96a0bf75697bf6411a16a74aee7920db3ff7c6899787b`

> **Status**: Active
> **Plan**: plans/plan-20260903-0737-issue-281-task-offer-wake.md
> **Contract**: tasks/contracts/20260903-0737-issue-281-task-offer-wake.contract.md
> **Review**: tasks/reviews/20260903-0737-issue-281-task-offer-wake.review.md
> **Last Updated**: 2026-09-03 07:37
> **Lifecycle**: notes
> **Substantive Change SHA256**: `sha256:fbed964e0040f5b0c03a9dc9866556fa6b793568e67fc41c4dacd2c9fb41447d`

## Design Decisions

- Protocol extension shape: `AgentRuntimeEffectIntentV2` and `AgentRuntimeHostActionV2` became
  operation-discriminated unions instead of widening `message_ref`. `notify_inbox` keeps its exact key
  set, so every persisted V2 message intent keeps its canonical bytes and derived digests; the wake
  variant carries `wake_ref` and the wake host action carries `repository_id`/`snapshot_revision`/
  `wake_reason` and nothing from the Task or Claim world. Protocol stays 2, no migration.
- Control identity is per operation: `repo-harness-inbox:` versus `repo-harness-wake:`, derived under
  two different digest domains, so an inbox control reference can never satisfy a wake and the reverse
  is equally impossible.
- Receipt type: a new `AgentRuntimeControllerStepReceiptV2`
  (`repo-harness-agent-runtime-controller-step-receipt`) persisted at `<effect>/controller-step.json`
  by `recordAgentRuntimeControllerStep`. `assertAgentRuntimeReceiptKindForOperation` closes the pairing
  in both directions. `observed_snapshot_revision` records what the woken controller actually re-read,
  which may legitimately differ from the wake's frozen snapshot.
- Offer-snapshot authority (round 1): the incoming `EngineerOffersV1` is another authority's product and
  is now re-proved before anything is derived from it. `validateEngineerOffersDocument` lives in the
  scheduling core beside `validateEngineerOffer` as the single whole-document authority: closed key set,
  every offer and exclusion valid and owned by the document, and `snapshot_revision` recomputed over the
  arrays as given (so an edit, a reorder or a forged revision fails there). The store then fences the
  document to the registered repository for this worktree and to the exact current Binding, so a snapshot
  collected under a previous Binding generation or contract revision is refused rather than re-bound.
- Linearization (round 1): the wake ledger lock and the per-effect lock had no common order, so a
  superseding observer and an old-wake starter could interleave. Every wake mutation -- arm/supersede,
  start, observe, controller-step receipt -- now takes the per-Binding wake lock before the per-effect
  lock, making the lock order one-way everywhere. `startAgentRuntimeEffect` decides which lock to take
  from an unlocked peek at the intent, which is safe because the intent is written once with O_EXCL and
  fsynced before any observation exists. `assertWakeStartable` reads the ledger inside that lock, so the
  read is the linearization point rather than a hint.
- Cross-authority fences (round 1): the Binding, capability observation and authorization revision live
  outside these locks and can commit between the check and the durable `effect_started`. Rather than
  reach across authorities for a lock, the start re-reads the same fences after the append and, when one
  moved, records `observed_failure` (`binding_stale` / `capability_unsupported` / `fence_conflict` / new
  `authorization_stale`) and returns `action: null`. The Host action is admitted only if every fence held
  both immediately before and immediately after the start became durable.
- The post-durable re-check is deliberately NOT wake-only: `assertStartFences` runs the same second read
  for `notify_inbox` starts, so a Binding that rotates during a message start also records
  `binding_stale` and returns no action, and a message fence that moves (a delivery state or attempt that
  advanced under the start, which surfaces as `agent_runtime_effect_transition_invalid`) is re-thrown
  rather than mislabelled, leaving the effect at `effect_started` so the next start reconciles it to
  `reconciliation_required`. This widening is intentional fail-closed convergence of both operations on
  one start contract, not a #281-local rule: the same check-then-commit window existed on the message
  path before this work and simply had no second read. Nothing that previously succeeded now fails --
  only starts whose fence genuinely moved mid-start change outcome, and they change from "stale Host
  action handed out" to "recorded failure, no action".
- Failure labels are truthful (round 1 gate residual): `startFenceFailureClass` no longer folds
  `agent_runtime_effect_conflict` into `capability_unsupported`. A capability digest that moved under the
  start is a conflict with another writer, not a Host that stopped supporting the operation, so it gets
  its own `fence_conflict` class; sending an operator to the Host instead of to the competing writer was
  the concrete harm.
- Empty documents are fenced too (round 1 gate residual): an offers document carries no Binding fields,
  and an empty one carries no offers to fence, so `assertOffersBindCurrentEndpoint` iterating `offers`
  alone let an empty snapshot collected under a previous generation update the current ledger's
  `observed`. `recordEngineerOfferSnapshot` now requires the collector to state
  `expected_binding_id` / `expected_binding_generation` / `expected_engineer_contract_revision` -- the
  same shape `PrepareAgentRuntimeEffectInput` already uses -- and checks them against the current Binding
  before any ledger write, with the per-offer check kept as the second proof that the document agrees
  with what the collector asserted. Extending `EngineerOffersV1` with a document-level Binding fence was
  rejected: it would change the offers protocol digest basis and belongs to the scheduling authority, not
  to this consumer.
- Coalescing: the durable per-Binding ledger keeps one pending wake pointer plus a window
  (`requested_at`, `coalesce_until`). A due decision while the pending wake is still `intent_persisted`
  replaces the pointer and inherits the original window, so a flapping repository cannot slide the
  window forward; a started wake yields `no_wake`/`wake_in_flight` instead of a second concurrent wake.
  A non-due observation updates only `observed` and never drops the pointer, which is why an
  empty snapshot between two eligible ones still coalesces instead of restarting the window.
- Supersession is terminal (round 1): a superseded intent now moves to a new terminal `superseded` state,
  reachable only from `intent_persisted`. Leaving it at `intent_persisted` made the Board count two
  pending wakes for one Binding and forced every reader to consult the ledger to know an intent was dead.
  `superseded` is a wake-only outcome in practice, carries no receipt or failure evidence, and starting
  such an effect fails loudly with `agent_runtime_effect_wake_superseded` instead of silently returning
  no action. The ledger pointer fence is kept as the second guard.
- A→B transitions (round 1): `decideAgentRuntimeOfferWake` no longer returns `already_eligible`. Any move
  to a different snapshot that still has eligible work is due, so an already-eligible Engineer whose offer
  set changes still supersedes the pending wake and the newest revision is never lost. The reason is read
  from the previous blockers of the highest-priority newly eligible Work Package, falling back to the
  highest-priority eligible one.
- Reading of the issue's "exactly one durable wake intent on the empty-to-eligible transition": the
  uniqueness that is enforced is one wake per (Binding, snapshot) -- the idempotency key is derived from
  Binding, snapshot revision and reason, so a given snapshot arms at most one intent and repeats are
  idempotent -- while any eligible snapshot change is due and supersedes the unstarted wake into
  `superseded`. The alternative reading (only a literal empty-to-eligible edge may arm a wake) was
  rejected because it drops the newest revision on an A→B change, which the same acceptance list forbids.
- Crash replay (round 1): `created_at` for a wake intent is this store's own clock, so a crash between the
  intent write and the ledger publish would make a byte comparison reject the replay of the same snapshot
  forever. The replay path now reconciles on identity -- same idempotency key, endpoint fence and wake
  subject -- and still fails closed on anything else.
- Subscription seam: `listDueOfferWakes` plus `subscribeToOfferWakes` (caller-driven `poll(now)`,
  in-memory per-handle dedupe on `effect_id:state`). No timers, no CLI, deterministic under test.
  The ledger is published by atomic replace so reads take no lock, which keeps the lock order
  one-way (wake lock may take an effect lock, never the reverse).
- Authorization fence reuses the existing authority: `repoHarnessAuthorizationRevision(env)`, the same
  registry counter `src/effects/fleet/acquire.ts` fences acquisition against. It is checked when the
  wake is armed and again before the Host action.
- Adapter support matrix: both adapters implement both operations, so both `CODEX_APP_THREAD_OPERATIONS`
  and `TMUX_CLI_AGENT_OPERATIONS` list both and an action naming anything else returns a typed
  `unsupported` observation. The Codex invoker now receives `operation` so the host knows what it was
  asked to do. Host-level non-support stays where it already lived: the capability observation's
  per-operation status, which fails closed unless the controller policy enables scheduled polling.

## Deviations From Plan Or Spec

- The plan's P3 said to persist only the last observed snapshot revision per Binding. The wake reason
  cannot be derived from a digest, so the ledger persists a bounded projection
  (`AgentRuntimeOfferWakeSnapshotV2`: eligibility list plus blocker codes per Work Package) instead of
  the revision alone. It is still bounded by the Work Package count and carries no offer bodies.
- `agentRuntimeCapabilityStatusFor` no longer returns a top-level `status`. With two operations that
  field silently meant `notify_inbox`, a second authority for a datum the returned capability
  observation already carries per operation. The MCP `engineer_runtime_effect_capability` payload now
  exposes the full matrix instead.
- Recorded capability observations from before this change fail closed on read as
  `agent_runtime_effect_unreadable`: the operations map is a closed exact-key set and its digest is part
  of `capability_sha256`. The store read previously leaked the core protocol code
  (`agent_runtime_effect_invalid`) through `mapped`; a file that exists on disk but no longer parses under
  the current contract is a store read failure, so that read now reports `unreadable` and a test asserts
  it from a real pre-upgrade file. Re-record capability with both operations; this is runtime evidence
  under the Git common directory, not durable history.

## Tradeoffs Considered

| Option | Decision | Reason |
|--------|----------|--------|
| Widen `message_ref` to a third `offer_wake` variant | Rejected | A wake carries no message; the field name would lie and every message intent would still have to be re-validated through a union it does not belong to |
| Bump protocol to 3 and rewrite the store | Rejected | The issue asks to extend the protocol, not retire it; a bump would invalidate every persisted V2 effect and demand a second migration outside this scope |
| Separate wake daemon/store beside the runtime effect | Rejected | Two provider-neutral seams for one endpoint; the R1 workstream owns exactly one |
| Ledger keyed by (Engineer, Binding, generation) | Chosen | A Binding rotation naturally starts a fresh ledger and leaves the old pointer unstartable through the existing Binding fence |

## Open Questions

- A wake that failed is never retried for the same snapshot by design (no infinite retry). `retry_due`
  stays a closed enum slot with no emitter until the attempt-receipt authority (#287) lands.
- An unstarted wake whose snapshot went empty stays pending and startable. That is deliberate — the
  awakened controller re-reads offers and no-ops — but it means the board can show a pending wake for
  work that has already gone away until the next eligible transition supersedes it.
- Now that an A→B eligible transition is due, a repository whose offer set keeps changing while the
  Engineer is already awake arms a new wake per changed snapshot once the previous one is terminal. The
  coalescing window bounds how fast a wake becomes startable, not how many snapshots arm one; if that
  proves noisy in the controller (#279), the window should move from the pending record to the ledger.

## Evidence Links

- Architecture acceptance: the `agent-runtime-effects` capability projection reported
  `unresolved-major-change` (`entrypoint-changed`, `responsibility-changed`) for signal
  `sha256:25f8bf36a73e5ac619269e473ad798cb1fff1bc24f3439b1abbe6bab42cb54e4`. Accepted under approval
  reference `event.orchestrator-approval-20260903-issue-281-task-offer-wake`; the regenerated
  `docs/architecture/` projection is committed with that acceptance.
- Checks: `.ai/harness/checks/latest.json`
- Run snapshots: `.ai/harness/runs/`
- Deterministic oracle `issue-281-wake-deterministic`:
  `bun test tests/unit/issue-281-task-offer-wake.test.ts tests/unit/r1-provider-neutral-agent-runtime.test.ts tests/unit/r1-agent-runtime-adapters.test.ts tests/cli/engineer.test.ts tests/cli/mcp-engineer-tools.test.ts --timeout 60000`
- Runtime readback oracle `issue-281-wake-runtime-readback`: drive the new CLI surface against a
  disposable fixture repository and private registry home --
  `engineer runtime-effect capability` -> `wake-record-offers` (blocked snapshot, then eligible) ->
  `wake-status --now ... --json` -> `start` -> `wake-receipt` -> `observe` -> `wake-status`.
  The readback proves the wake Host action key set carries no message, Task or Claim field
  (`action_keys=action_sha256,adapter_kind,control_ref,control_sha256,effect_id,endpoint_id,host_id,intent_sha256,kind,operation,protocol,repository_id,snapshot_revision,wake_reason`),
  that the control reference is `repo-harness-wake:<effect_id>:<control_sha256>`, and that the effect
  reaches `observed_success` only with `receipt_kind=controller_step_receipt`.

## Promotion Filter

Promote a candidate to `tasks/lessons.md`, `docs/researches/`, or harness asset files only when all three hold: hard to reverse, surprising without local context, and a real trade-off existed. If any one is missing, keep it in this notes file instead.

## Promotion Candidates

- Promote to `tasks/lessons.md` only after a repeated correction or failure pattern.
- Promote to `docs/researches/` only when it is durable repo knowledge with evidence.
- Promote to harness asset files only after verification across more than one task or fixture.
