# Implementation Notes: e1-selected-receipt

> **Status**: Active
> **Plan**: plans/plan-20261001-0025-e1-selected-receipt.md
> **Contract**: tasks/contracts/20261001-0025-e1-selected-receipt.contract.md
> **Review**: tasks/reviews/20261001-0025-e1-selected-receipt.review.md
> **Last Updated**: 2026-10-01 00:25
> **Lifecycle**: notes
> **Substantive Change SHA256**: `sha256:478248e5fda59709a78c3f39031f68a567c81d1680dfe363f4a01db95d8e5123`

## Frozen-Time Preflight Audit

Baseline: dc77b3c6405894f8ad3b1a7477beba740072d064. Read-only inventory and independent safety judgment were followed by root re-opening cited source and a pure-function reproduction (`bun -`, exit 0). T1=2026-10-01T00:00:00Z; T2=T1+120000ms covers lock waiting beyond the admission-start freshness limit. No unsafe old-time admission consumer was found; no production code was edited before publishing this audit conclusion.

| Consumer/path | Old T1 effect | Safety evidence |
|---|---|---|
| effects/engineers/scheduling.ts:349-360 -> core/engineers/automation-attempt.ts:69-78 | Explicit now_ms reaches Fleet and retry; absent time samples different clocks | S2 explicit time path has one server T1. Unchanged pure-read callers without now_ms remain out of scope. |
| retry backoff -> core/engineers/scheduling.ts:614 | T1 retry_backoff, T2 eligible across next_eligible_at | Only time eligibility comparison is now < next_eligible_at; old time is conservative for every T2>=T1 at fixed current authority. |
| first eligible_since -> core/engineers/scheduling.ts:660,813-816 | Preserves first-offer identity and same-priority sort | This is observation evidence, not grant/cutover TTL. |
| starvation_attention / blocker_owner -> core/engineers/scheduling.ts:604-618,664-669 | Both times eligible; diagnostic none/false -> operator/true | Fields alter hash/diagnostics, not eligibility blockers. Attention may be delayed. |
| effects/fleet/acquire.ts:217-220 -> effects/state/resolve-board.ts:41-64 -> collect-board-inputs.ts:224,234 | Same T1 on both Board reads; liveness fallback live -> liveness_unproven | core/state/project-board.ts:384-410 attaches diagnostic only; Fleet classification uses current lease_state at effects/fleet/acquire.ts:155-183. Bound leases remain unsupported via core/fleet/task-offer.ts:196-198. |
| collect-board-inputs.ts:153 -> resolve-effective-state.ts:849-872 -> core/state/project-effective-state.ts:240-247 | current_snapshot freshness fresh -> stale at 24h | progress_token excludes current snapshot/time at :302-308; root reproduction showed progress/readiness/blockers/authority identical. Board consumes only progress_token. |
| resolve-effective-state.ts:480-489 pendingState compatibility | Separate snapshot compatibility path | Read-only Board resolver does not call this path; not a consumer here. |
| eligible_since -> controller-run.ts:211 / campaign-worker.ts:306 | Retained as first_eligible_at | automation-attempt-store.ts:29-35 independently checks actual started_at against current retry authority; no grant/cutover TTL consumer. |
| claim/concurrency | Current state-based authority, not clock restoration | scheduling.ts:285-310 and claim-actor-store.ts:148-180 count non-released current leases; scheduling-acquire.ts:124-158 re-reads twice, Fleet :600-623 revalidates, coordination-sprint.ts:310-320 checks available under task lock. |

Limits: Board liveness is not included in Board revision (collect-board-inputs.ts:261-275); this is diagnostic consistency, not a discovered admission relaxation. Current grant/Binding/Task/attempt facts are not restored to T1. Audit is a source trace plus pure-function boundary proof, not a deployment canary.

## Design Decisions

- One same-module C core owns identity, key lock, pending/completed/fenced ordering and callback-before-completion. Auto preserves selection/retry/capacity behavior; selected only MATCHes the full assertion to one trusted snapshot entry and calls unchanged A once.
- Protocol-2 identity binds logical key SHA, repository common directory, full authenticated principal/Binding, session (explicit null if no session), operation, filters/attempt bound or assertion/ref, and trusted R1 callback-policy/scope metadata. One builder is reused by inner and outer owners. Callback closures are never serialized or transport-selected.
- The physical legacy logical-key path is preserved; v2 normal readers never dispatch a v1 parser. `inspectAcquisitionReceiptCutover` / `migrateAcquisitionReceipts` are explicit operator-only exports, not new production tools. Migration validates expected inventory and quiescence evidence; pending/corrupt/unsettled entries stop activation. Completed legacy keys become v2 fences retaining exact original bytes. Interrupted conversion retains those bytes and no seal, so normal activation stays closed. Missing known legacy fences also refuse.
- Campaign planning records stay immutable. Explicit inspect/migrate exports use existing campaign/planning locks, pair legacy admission/result by reservation cursor, fence old keys and seal the inventory; unresolved/orphan metadata stops cutover. No normal-path v1 semantic reader or transparent legacy replay.
- Determinate auto idle deletes its temporary pending receipt under the key lock, as the original auto path did. Polls do not retain per-key files or bind filters after a proved no-effect idle; stale-then-empty also returns idle so the key can be reused. Selected stale/refusal never falls back to PICK.
- Observation missing/corrupt/identity/expired/future/policy/unsafe-path errors are frozen and mapped through the existing MCP boundary. Pending/completed/conflict handling precedes observation lookup/freshness. Selected pending/completed retain observation_ref; no expiry-based deletion or GC exists.
- Outer budget checks its exact request and inner disposition before reserve/invoke. Outer result-before-idempotent usage settlement remains unchanged; replay may repeat settlement lookup but not reserve, inner effect or callback. The existing R1 own-claim compensation and unbudgeted replay guard remain intact. No S3 membership/post-effect strengthening, no S4 selected transport wiring.

## Verification and Review Scope

- Contract Verification Plan contains existing affected fixture files plus check:type and required repository-integrity commands. Runtime evidence is ignored `.ai/harness/checks/e1-s2-verification.latest.json` and `.ai/harness/runs/`; no parallel benchmark or task-named test file was added.
- Independent security/architecture source reviews found no verified blocking defect; at that stage canonical execution evidence was not yet supplied, so they did not issue a ship/acceptance decision. Formal re-acceptance remains separate from Draft delivery.

## Residual Risks and Operator Boundary

- Quiescence_evidence is a trusted operator attestation/reference, not an automatic proof that old CLI/MCP processes have stopped. Actual cutover must stop old inner/outer producers together, inventory both stores, explicitly reconcile unknown effects, then seal both. Raw legacy MCP requests without keys require operator readback; this code never guesses their status or auto-replays them.
- One-shot migration has no public CLI/MCP transport in S2; the explicit library exports are available to the operator, with exact source inventory matching. This Draft does not activate migration against the primary checkout or decide release.
- 30 seconds is admission-start freshness, not retention TTL or claim-mutation-time TTL. No quota/GC implementation; closeout/recovery owns eventual explicit retention/cleanup and must preserve referenced pending/completed and unknown/corrupt metadata.
- Local store integrity assumes a trusted OS owner, as S1. Cross-store operations use durable boundaries/refusal, not a global atomic transaction. No live deployment/canary acceptance is claimed.

## Evidence Links

- Canonical execution: `.ai/harness/checks/e1-s2-verification.latest.json`
- Runtime provenance: `.ai/harness/runs/`

## CI Merge-Candidate Evidence Boundary

The PR CI base advanced to cebb590e after S2 started from dc77b3c6. Task-sync includes its effective base in the digest. Reproduced GitHub candidate d8a4c465 in a disposable clone using REPO_HARNESS_DIFF_BASE=cebb590e and merge-base mode; it required the hash below. This separate boundary is not a waiver, production code change or live cutover.

> **Substantive Change SHA256**: `sha256:1cc8d920ef9e79b1a01ddedcf85d51a5e7c35ad6e86d5e3be5ed32acc0e24114`

## CI Base Alignment

Main advanced again to 281e6555 (release preparation). The earlier CI event retained base cebb590e while checkout included those upstream release files, so it counted unrelated paths. Rebased this S2 branch onto 281e6555 rather than binding evidence for unrelated release changes. All nine audited clock/admission source files are byte-identical to dc77b3c6; S2 scope and source semantics are unchanged.

Current PR boundary against main 281e6555:

> **Substantive Change SHA256**: `sha256:4c884efbf1e5ba78312603ab8be0f4423bcc6a2b4b8eac9b791054acbe365e19`

## Gatekeeper PASS Follow-up

- A valid existing seal is read and validated without the global cutover mutex. Only cold initialization takes that mutex and rechecks the seal inside it; stale empty/owner reclaim matches the per-key lock. Regression holds a live cutover lock while replay succeeds and covers stale empty initialization.
- Restored delete-on-determinate-auto-idle under the per-key lock and unfiltered MCP JSON side-effect assertion. Fixture seal setup is explicitly outside the measured idle call. Five different polling keys leave the initialized directory unchanged; idle keys may change filters. Stale-then-empty returns idle, not a cached stale result; same key acquires after current offers change.
- Prepare validates policy, collection, principal and snapshot before creating observations storage. Missing/corrupt policy and collector refusal create no empty observations directory. Child-eval import is only runCampaignAcquisition; plan rollback names the actual branch and completed Task Breakdown items are checked. Contract rollback base is 281e6555.
- No operator/runbook surface, AcceptanceReceipt, ledger error-code ownership change, S3, or frozen-time audit test expansion was added; those items remain deferred by owner instruction.

Gatekeeper follow-up against 3cf3ea04:

> **Substantive Change SHA256**: `sha256:21db173bc454fe5a95d23846b78c9f71c5068aa543df91642cc4ca564143cf34`

Updated full PR boundary against main 281e6555:

> **Substantive Change SHA256**: `sha256:7c753962cf35c8fe3444a8934ebc1688d99e460dfe4c23887e20d0b51d3d1d11`
