# BRC6a active admission boundary

> Historical record. Campaign execution moved to the existing Bot skills on 2026-10-04. Use [repo-harness](../../SKILL.md) to dispatch and collect work through Herdr/OAR. Use [repo-harness-product](../../assets/skills/repo-harness-product/SKILL.md) for planning and [repo-harness-check](../../assets/skill-commands/repo-harness-check/SKILL.md) for scope and verification. repo-harness has no campaign runtime.

## Decision and status

The content challenge is not exact-revision readback. Its three content answers and echoed SHA can match when the provider still sees an older commit with identical sampled content. There is no trusted revision producer in the current Connector transport. BRC6a therefore remains pending; BRC14 fresh audit and BRC15a real canary are not established by this package.

Until that producer exists, active adoption (including stored adoption replay and active dry-run), new planning jobs/plan_ready results, acquisition, fresh Fleet claims, new handoffs and new child launches refuse before their effects. `campaign-revision-admission.ts` is the shared current-admission decision; it has no configuration switch, fabricated receipt or fallback. Shadow content observation remains available and retains its budget and reconciliation checks.

## P1 — authorities and consumers

`connector-challenge.ts` owns content-challenge validation. `issue-batch-adoption.ts` previously used it as active admission. `campaign-planning-proof.ts` validates stored campaign membership, canonical task/plan, source binding and admission evidence. The latter is also consumed by live WorkEnvelope validation and reclaimed work; rejecting it globally would strand existing work.

The new gate is applied at active mutation boundaries and separately in `collectRepoTaskOffers`. Fleet uses its existing `plan_not_projectable` result to state that the plan cannot project into current execution; it does not mutate or invalidate the historical plan proof. No public protocol or Operator payload change is needed. `withCampaignCapacity` separately refuses the actual claim operation, so an old offer cannot bypass the projection.

## P2 — positive and negative paths

An active adoption request now fails before challenge generation, provider observation, reservation or publication, including replay of a stored content-only adoption. Historical materialization cannot produce another planning job, Claim, handoff or worker launch. A previously issued planning job can still close with an exact non-executing result under its original parent/request identity.

A stored worker final can settle through the original reservation and exact result identity once. Replay cannot prepare, renew or spawn a child. Historical transient finals that already have a charge retain that charge; current policy does not recalculate it. Retirement and read-only inactivity observation remain available. Recovery without a final refuses before retirement or generation change. Recovery with a final first uses the existing budget-store read authority to validate its original reservation and any existing result charge, then preserves the existing inactive-runtime, Lease, ClaimActor, exact rebind and post-rebind settlement gates. Closeout retains publication identity, source readback, compare-and-delete and exact cleanup checks.

A persisted but unsettled final is still an existing immutable local journal fact, not provider revision proof. The budget read validates its reservation and any existing charge; it does not invent an independent producer for its result bytes. Raw shell completion is not provider terminal evidence. A typed provider terminal with detached command effects cannot prove those effects inactive.

## P3 — constraints and tradeoff

Availability is deliberately reduced for new active campaign work because current evidence cannot justify it. Existing evidence remains usable only at historical settlement and cleanup boundaries. No storage migration, new schema, provider adapter, budget arithmetic, Lease state model or release change is introduced. At 10x request volume the same refusal happens before external calls and fresh work allocation; existing serialized recovery and closeout remain the throughput limits.

## Verification surface

The real pre-fix adoption regression resolved instead of rejecting; its captured failure is in the package's archived notes evidence. `tests/effects/brc6a-admission.test.ts` asserts pre-effect refusal and stored replay refusal. The unchanged-content/new-echoed-SHA counterexample is in `tests/unit/connector-challenge.test.ts`.

`tests/helpers/historical-campaign-lifecycle.ts` constructs explicitly synthetic historical adoption/planning records using the existing typed builders, then binds real disposable Git worktrees, Leases and ClaimActor receipts. It never calls a current active admission API or mocks the gate. These inputs test maintenance of already-created work; they are not an active campaign canary or trusted provider readback.

Active-success tests that require the now-disabled admission path have been replaced by refusal assertions or historical final/recovery assertions. Shadow adoption retains real budgeted observations and unknown-result reconciliation. Historical lifecycle tests still run model-free provider processes through the real bounded process supervisor and inspect actual output, terminal evidence and detached descendant behavior. Underlying planning protection, budget, retry, renewal and process-group contracts remain covered by their named unit suites. Canonical acceptance records the frozen package's exact commands and results; development runs are not relabelled as final acceptance.

## Remaining boundary

The next BRC6a slice requires an actual trusted exact-revision producer and an explicit same-content/old-revision falsifier. Merely adding a SHA field, provider self-report or Operator notification receipt cannot reopen active admission. The independent classified_at reclaim issue and BRC14 audit work are not resolved here.
