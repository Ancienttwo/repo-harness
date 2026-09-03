# Implementation Notes: issue-281-task-offer-wake

> **Status**: Active
> **Plan**: plans/plan-20260903-0737-issue-281-task-offer-wake.md
> **Contract**: tasks/contracts/20260903-0737-issue-281-task-offer-wake.contract.md
> **Review**: tasks/reviews/20260903-0737-issue-281-task-offer-wake.review.md
> **Last Updated**: 2026-09-03 07:37
> **Lifecycle**: notes
> **Substantive Change SHA256**: `sha256:34a95b2e8275a788bfce6bcaf70bf237a60e042f7a48d9cf83a542aac62afb62`

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
- Coalescing: the durable per-Binding ledger keeps one pending wake pointer plus a window
  (`requested_at`, `coalesce_until`). A due decision while the pending wake is still `intent_persisted`
  replaces the pointer and inherits the original window, so a flapping repository cannot slide the
  window forward; a started wake yields `no_wake`/`wake_in_flight` instead of a second concurrent wake.
  A non-due observation updates only `observed` and never drops the pointer, which is why an
  empty snapshot between two eligible ones still coalesces instead of restarting the window.
- Supersession has no `stopped` transition: `intent_persisted -> stopped` is not in the shared
  transition table and adding it would change the message state machine too. The ledger fence in
  `assertWakeStartable` makes a superseded intent permanently unstartable, which is the fail-closed
  outcome without touching the shared table.
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
- Recorded capability observations from before this change fail closed on read: the operations map is a
  closed exact-key set and its digest is part of `capability_sha256`. Re-record capability with both
  operations; this is runtime evidence under the Git common directory, not durable history.

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

## Evidence Links

- Checks: `.ai/harness/checks/latest.json`
- Run snapshots: `.ai/harness/runs/`

## Promotion Filter

Promote a candidate to `tasks/lessons.md`, `docs/researches/`, or harness asset files only when all three hold: hard to reverse, surprising without local context, and a real trade-off existed. If any one is missing, keep it in this notes file instead.

## Promotion Candidates

- Promote to `tasks/lessons.md` only after a repeated correction or failure pattern.
- Promote to `docs/researches/` only when it is durable repo knowledge with evidence.
- Promote to harness asset files only after verification across more than one task or fixture.
