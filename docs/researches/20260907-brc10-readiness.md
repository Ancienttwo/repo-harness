# BRC10 readiness and prerequisite boundary

> Historical record. Campaign execution moved to the existing Bot skills on 2026-10-04. Use [repo-harness](../../SKILL.md) to dispatch and collect work through Herdr/OAR. Use [repo-harness-product](../../assets/skills/repo-harness-product/SKILL.md) for planning and [repo-harness-check](../../assets/skill-commands/repo-harness-check/SKILL.md) for scope and verification. repo-harness has no campaign runtime.

Status: BRC9 publication `2b611fc9` passed CI 34059698519. BRC10 remains incomplete; its first prerequisite fixes reclaim receipt consumption across observation time. This document does not claim full campaign lifecycle acceptance. The owning Sprint is `plans/sprints/20260902-2238-gpt-pro-seeded-repair-campaign.sprint.md`, rows 11–12 and Execution Dependencies Requiring Resolution.

## P1 — Existing authority and ownership

- `src/effects/state/coordination-lease-liveness-store.ts:54` owns generation-bound renewal under the existing Task lock, immutable renewal records and current projection. Its current production caller is the generic automation `controller-run.ts`; campaign code does not call it.
- `src/core/state/lease-liveness.ts:169` classifies current liveness. Expiry alone cannot authorize reclaim; unknown evidence requires operator attention, active effects block reclaim, and completing/reviewing require publication recovery.
- `src/effects/state/coordination-lease-reclaim.ts:30` re-observes evidence under the Task lock and consumes the existing generation-incrementing steal transition. The source tree currently contains no production caller of this entrypoint or `observeLeaseReclaimEligibility`.
- BRC9 final acceptance now covers the real standalone contract worker, complete attempt reservation, acquisition/provider accounting and transient retry consumers. Their authoritative interfaces are recorded in `docs/researches/20260907-brc9-writable-dispatch-attempt.md` and `docs/researches/20260907-brc9-transient-retry-consumption.md`. Their completion does not cover BRC10 process supervision or reclaim.

## P2 — Required evidence flow

Current campaign acquisition produces a real WorkEnvelope/ClaimActor handoff. BRC10 must consume the accepted execution path's actual Task revision, Claim, Lease generation, binding generation, runtime effect identity and terminal observations. Those inputs feed renewal and the existing five reclaim evidence fields: controller terminal, runtime effect inactive, publication inactive, binding generation matches and ClaimActor matches. Missing evidence stays unknown; neither a PID nor an expired deadline supplies it.

A recovery step must re-read campaign journal, budget reservations, current Lease and execution/publication evidence before deciding whether an action is a replay, an attention-only outcome or an evidence-gated reclaim. Replaying a campaign step must not imply that an external effect did not run. Task locks and campaign locks remain their existing authorities; lock ordering must follow the finalized BRC9 consumer path rather than introducing a reverse nesting order.

## P3 — Smallest coherent execution slice

After full BRC9 acceptance, freeze the exact producer contracts and add campaign consumption of existing renewal/classification/reclaim APIs, with controller recovery tests at the existing persisted boundaries. Keep one Lease store, one budget ledger and one campaign journal. No new command, daemon, dependency, takeover heuristic or writable runner is justified by BRC10 itself.

At 10x tasks, the first concern to measure is serial evidence reads and lock hold time; unknown or incomplete evidence must still refuse takeover. Performance does not justify cached ownership authority.

The next campaign plan must add an explicit liveness policy source and truthful process-group supervision evidence to the now-published worker path. Its current synchronous child runner and exit/output observations do not by themselves supply live renewal or descendant quiescence authority. Do not fabricate those values from a PID or final result.

## Acceptance work to carry forward

- Exact current owner renews; stale generation, task revision, binding or ClaimActor cannot renew/reclaim.
- Expired but active provider work, completing/reviewing publication and unknown liveness preserve ownership.
- Two actual reclaimer processes yield exactly one new generation; the existing unit test exercises sequential stale replay and does not establish cross-process campaign behavior.
- Crash after renewal persistence and after Lease mutation recovers using exact durable identities, without a second owner or duplicate provider effect.
- Exercise observation and reclaim at different real timestamps. The current reclaim API compares a fresh full receipt digest, including `classified_at`, with the prior receipt; current unit fixtures inject the same fixed timestamp. This is a consumer timing risk to reproduce before implementation, not a verified runtime fix or a reason to bypass the receipt fence.
- Exercise the finalized campaign path end to end with real local Lease/budget/journal stores and bounded fake external effects. Reuse upstream tests as substrate evidence, not whole-BRC10 acceptance.

## Reclaim timing prerequisite

The pre-fix regression reproduced three failures: later consumption of unchanged evidence, competing real processes, and crash after durable owner write. Both API calls previously had to share the same injected clock because the effect compared the new full receipt digest against the historical receipt, including classified_at.

The consumer now validates the input receipt, reconstructs its historical observation against current owner/evidence under the Task lock, and independently classifies eligibility at actual consumption time. It rejects clock regression, receipt tampering, changed evidence, generation drift and publication recovery before calling the unchanged steal transition. No schema, store or dependency was added. Concurrent consumers produce one new generation; replay after a durable write cannot produce another.

Verification: the new regression plus the three existing #286 suites pass (13 tests, 39 assertions). The pre-fix artifact records 2 pass / 3 fail and nonzero exit. These checks validate the substrate correction, not full BRC10. Canonical acceptance and PR evidence live in the package workflow artifacts.

Coordination: BRC9 owner pane %14 completed its final CI handoff; BRC10–15 delivery is delegated to this session. Real canary target/profile authorization and BRC6a provider revision evidence are separate unmet boundaries. This document remains independent of the shared campaign-boundary research file.
