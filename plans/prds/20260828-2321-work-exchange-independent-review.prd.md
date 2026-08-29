# PRD: Work Exchange and Independent Review Plane
> **Status**: Approved
> **Slug**: `work-exchange-independent-review`
> **Activation**: Deferred — Phase 2
> **Depends On**: collaboration-substrate real-use evidence
> **Created**: 2026-08-28T23:21:55-07:00
> **Updated**: 2026-08-29T00:41:20-07:00
> **Source Spec**: `docs/spec.md`
> **Source Umbrella PRD**: `plans/prds/20260828-2321-collaborative-work-exchange-agent-succession.prd.md`
> **Depends On (artifact)**: `plans/prds/20260828-2321-collaboration-substrate.prd.md`
> **Baseline**: `main@456731f308b7ad54585ac50acbc510350a4c563c`
> **Tier**: standard
> **Deferral note**: 本 PRD 的设计资产完整保留。激活须同时满足下方 Reviewer Supply Admission Gate 与 Revisit Trigger。
## AI Quick-Read Card
- **Problem**: current execution work is offer-driven, but formal Review/Verification are not claimable Gate Jobs. Cross-review is advisory and current provider feedback arrives after PR activity rather than through an independent repo-harness gate reservation.
- **Users**: Module Engineer, Independent Reviewer, Independent Verifier, Program Orchestrator, Maintainer.
- **Platform**: existing Engineer Principal, Work Graph, Publication, review-subject, Acceptance and repair authorities.
- **P0 surface**: GatePolicyV1, WorkExchangeSnapshotV1, ReviewOfferV1, GateReservationV1, ReviewReceiptV1, VerificationOffer/Receipt, RepairTrigger adapter, GateStatus.
- **Core metric**: every required publication has a current independent pass or is visibly blocked.
- **Hard constraint**: no second Lease; no source mutation from reviewer/verifier; no synthetic pass.
- **Key risk**: reviewer identity accidentally aliases executor because current Module Engineer identity is capability-based.
- **Unknowns**: same-capability multi-seat reviewers are not supported in v1.
- **Acceptance scenarios**: exact offer derivation, one reservation winner, executor exclusion, stale receipt invalidation, repair re-entry, conjunctive gates.
- **Suggested next step**: implement Gate Policy and shadow Work Exchange before any required Review.
## Problem
### Existing Reuse Targets
| Existing component | Use |
|---|---|
| WorkGraph / EngineerOffer | execute offer source |
| Module Engineer Profile/Binding/Principal | gate eligibility and actor identity |
| ClaimActorReceipt | executor lineage |
| PublicationReceipt | gate subject |
| `buildReviewSubject` | exact normalized subject |
| verification evidence / merge seal | evidence source |
| AcceptanceReceipt | semantic acceptance remains external |
| Feedback / RepairOffer | repair lifecycle |
| Module Message | notification and resource refs |
| Engineering Overlay | gate actor/status projection |
### Product Direction
The Work Exchange is a read model over authorities:
```text
execution offers = existing EngineerOfferV1
review offers = Publication + GatePolicy + current Review receipts
verification offers = subject + policy + evidence state
integration offers = existing Integration authority readiness
```
No offer grants authority. Execution uses existing acquire/Lease. Review and Verification use a new read-only Gate Reservation.
### Hard Constraints
- no WorkGraph protocol bump;
- no generic `WorkOffer` database;
- no reviewer source writer;
- formal reviewer must be different Engineer identity in v1;
- provider transcript is evidence, not receipt;
- cross-review remains advisory unless a separately authenticated reviewer submits a formal receipt;
- missing/unreadable Gate Policy never means “not required”;
- all source revisions revalidated under lock;
- Gate status does not change Task state;
- Operator Board adds no write.
### Recommended Defaults
```text
work_exchange.mode = shadow
independent_review.mode = off
minimum_reviews = 1
verification.mode = evidence_replay
different_provider_required = false
```
### Feasibility Boundary
**Confirmed**
- current Work Package already references `required_acceptance.policy_ref/revision`;
- PublicationReceipt binds task/head/review subject/verification evidence;
- ClaimActorReceipt binds executor Engineer/Binding/session;
- exact review subject rebuild already fails closed;
- git-common-dir lock/store patterns exist;
- current repair lifecycle already handles resume/takeover/no-progress.
**[UNVERIFIED]**
- whether every target repo has a distinct reviewer capability;
- whether clean-room rerun can be host-isolated;
- whether provider thread ID is always observable for diversity checks.
## Goals
1. Resolve Gate Policy from existing Work Package policy refs.
2. Project one deterministic Work Exchange.
3. Derive formal Review jobs from exact publications.
4. Enforce executor/reviewer independence.
5. Reserve Gate jobs without creating Lease.
6. Persist immutable Review and Verification receipts.
7. Convert blocking results into existing repair flow.
8. Produce pure current GateStatus for downstream MergeEligibility.
9. Add CLI/MCP read and bounded gate mutation.
10. Add read-only browser projection.
## Non-goals
- planning jobs;
- multiple reviewers in protocol 1;
- same-capability reviewer seats;
- merge mutation;
- replacement of AcceptanceReceipt;
- replacement of GitHub review/check facts;
- browser reserve/submit;
- free-form global Agent chat;
- automatic long-term memory.
## Users
### Module Engineer
- Publishes one candidate.
- Cannot satisfy formal Review for that candidate.
- Receives typed repair trigger when gates fail.
### Independent Reviewer
- Sees offers matching reviewer capability.
- Reserves one exact subject.
- Reads contract/diff/evidence.
- Submits pass, changes requested or blocked.
### Independent Verifier
- Verifies evidence replay or accepted integration matrix.
- Does not claim semantic code quality.
- Cannot turn unavailable execution into pass.
### Maintainer
- Sees queue, exclusions, actor identity and gate freshness.
- Can intervene through existing Human/operator channels.
## Data Model
### GatePolicyV1
Recommended path:
```text
plans/policies/gates/<policy-id>.gate-policy.v1.json
```
```ts
interface GatePolicyV1 {
  protocol: 1;
  kind: "repo-harness-gate-policy";
  policy_id: string;
  subject: "module_publication" | "integration_candidate";
  risk_tier: "low" | "medium" | "high" | "protected";
  review: {
    required: boolean;
    reviewer_capabilities: readonly string[];
    minimum_reviews: 1;
    executor_engineer_excluded: true;
    executor_binding_excluded: true;
    executor_child_lineage_excluded: true;
    different_provider_required: boolean;
    blocking_severities: readonly ("P0" | "P1")[];
  };
  verification: {
    required: boolean;
    verifier_capabilities: readonly string[];
    mode: "evidence_replay" | "clean_room_rerun" | "acceptance_matrix";
    executor_engineer_excluded: boolean;
  };
  checkpoints: {
    on_publication: true;
    on_interface_change: boolean;
    on_protected_surface_change: boolean;
    on_no_progress: boolean;
  };
  merge: {
    scope: "publication" | "integration_group";
    automation: "manual" | "eligible_only" | "auto_merge";
    user_waiver_auto_merge: false;
  };
  max_repair_cycles: number;
  policy_sha256: string;
}
```
Resolution:
- exact keys only;
- canonical digest equals Work Package `policy_revision`;
- ref is repository-relative, regular and symlink-safe;
- authority is exact target/canonical ref;
- candidate-only policy is ignored for its own gate;
- unsupported mode fails closed.
### WorkExchangeSnapshotV1
```ts
type WorkModeV1 = "execute" | "review" | "verify" | "integrate";
interface WorkExchangeSnapshotV1 {
  protocol: 1;
  kind: "repo-harness-work-exchange-snapshot";
  repository_id: string;
  observed_at: string;
  work_graph_revision: string | null;
  snapshot_consistency: "stable" | "changed_during_read" | "degraded";
  execution_offers: readonly ExecutionOfferProjectionV1[];
  review_offers: readonly ReviewOfferV1[];
  verification_offers: readonly VerificationOfferV1[];
  integration_offers: readonly IntegrationOfferProjectionV1[];
  exclusions: readonly WorkOfferExclusionV1[];
  source_revisions: WorkExchangeSourceRevisionsV1;
  snapshot_sha256: string;
}
```
`ExecutionOfferProjectionV1` contains the exact existing `EngineerOfferV1` and its digest; it does not reinterpret readiness.
Closed exclusions:
```ts
type WorkOfferExclusionCode =
  | "capability_mismatch"
  | "binding_inactive"
  | "dependency_not_ready"
  | "concurrency_unavailable"
  | "active_limit"
  | "gate_policy_unavailable"
  | "subject_unavailable"
  | "subject_stale"
  | "executor_independence_failed"
  | "existing_gate_satisfied"
  | "reservation_held"
  | "support_unavailable";
```
### ReviewOfferV1
```ts
interface ReviewOfferV1 {
  protocol: 1;
  kind: "repo-harness-review-offer";
  review_job_id: string;
  repository_id: string;
  work_package_id: string;
  work_package_revision: string;
  task_id: string;
  task_revision: string;
  publication_id: string;
  publication_receipt_sha256: string;
  review_subject_sha256: string;
  target_ref: string;
  target_revision: string;
  head_sha: string;
  gate_policy_id: string;
  gate_policy_revision: string;
  reviewer_capabilities: readonly string[];
  executor_claim_actor_receipt_sha256: string;
  executor_engineer_id: string;
  executor_binding_id: string;
  executor_binding_generation: number;
  executor_session_id: string | null;
  offer_revision: string;
}
```
Job identity:
```text
protocol
+ publication_id
+ review_subject_sha256
+ gate_policy_revision
+ review-slot-0
```
A new publication Head or Gate Policy creates a new job.
### GateReservationV1
```ts
interface GateReservationV1 {
  protocol: 1;
  kind: "repo-harness-gate-reservation";
  reservation_id: string;
  gate_job_id: string;
  gate_job_revision: string;
  mode: "review" | "verify";
  repository_id: string;
  engineer_id: string;
  binding_id: string;
  binding_generation: number;
  engineer_contract_revision: string;
  authorization_revision: number;
  state: "active" | "submitted" | "released" | "expired";
  reserved_at: string;
  expires_at: string;
  current_digest: string;
}
```
Reservation properties:
- separate per-job current pointer;
- immutable transition events;
- one active reservation;
- bounded lock and idempotency;
- no Task/Lease mutation;
- expiry only reopens offer;
- submit revalidates principal, offer, subject and policy;
- receipt persists before submitted transition.
### ReviewFindingV1
```ts
interface ReviewFindingV1 {
  finding_id: string;
  severity: "P0" | "P1" | "P2" | "P3";
  code: string;
  path: string | null;
  line: number | null;
  summary: string;
  evidence_refs: readonly {
    locator: string;
    sha256: string;
  }[];
}
```
### ReviewReceiptV1
```ts
type ReviewDisposition =
  | "pass"
  | "changes_requested"
  | "blocked";
interface ReviewReceiptV1 {
  protocol: 1;
  kind: "repo-harness-review-receipt";
  review_job_id: string;
  review_offer_revision: string;
  gate_policy_revision: string;
  publication_id: string;
  publication_receipt_sha256: string;
  review_subject_sha256: string;
  target_revision: string;
  head_sha: string;
  reservation_id: string;
  reviewer_engineer_id: string;
  reviewer_binding_id: string;
  reviewer_binding_generation: number;
  reviewer_engineer_contract_revision: string;
  reviewer_principal_ref: string;
  executor_claim_actor_receipt_sha256: string;
  independence_proof_sha256: string;
  disposition: ReviewDisposition;
  findings: readonly ReviewFindingV1[];
  issued_at: string;
  receipt_sha256: string;
}
```
Invariants:
- pass has no blocking findings;
- changes requested has at least one blocking finding;
- blocked is never pass;
- finding IDs are deterministic;
- receipt exact-binds subject/head/policy/actors;
- current-subject replay is mandatory before counting as current;
- immutable content-addressed storage;
- transcript only appears as evidence ref.
### VerificationOfferV1
```ts
interface VerificationOfferV1 {
  protocol: 1;
  kind: "repo-harness-verification-offer";
  verification_job_id: string;
  repository_id: string;
  subject_kind: "module_publication" | "integration_candidate";
  subject_id: string;
  subject_sha256: string;
  head_sha: string;
  gate_policy_revision: string;
  mode:
    | "evidence_replay"
    | "clean_room_rerun"
    | "acceptance_matrix";
  evidence_refs: readonly {
    locator: string;
    sha256: string;
  }[];
  verifier_capabilities: readonly string[];
  offer_revision: string;
}
```
### VerificationReceiptV1
```ts
interface VerificationReceiptV1 {
  protocol: 1;
  kind: "repo-harness-verification-receipt";
  verification_job_id: string;
  verification_offer_revision: string;
  reservation_id: string;
  subject_id: string;
  subject_sha256: string;
  head_sha: string;
  gate_policy_revision: string;
  verifier_engineer_id: string;
  verifier_binding_id: string;
  verifier_binding_generation: number;
  verifier_principal_ref: string;
  mode:
    | "evidence_replay"
    | "clean_room_rerun"
    | "acceptance_matrix";
  result: "pass" | "fail" | "blocked";
  evidence_refs: readonly {
    locator: string;
    sha256: string;
  }[];
  issued_at: string;
  receipt_sha256: string;
}
```
Mode semantics:
- `evidence_replay`: validates exact existing evidence; never claims rerun.
- `clean_room_rerun`: unsupported until Host capability is admitted.
- `acceptance_matrix`: consumes existing Integration Acceptance Matrix.
### RepairTriggerV1
```ts
interface RepairTriggerV1 {
  protocol: 1;
  kind: "repo-harness-repair-trigger";
  trigger_id: string;
  source:
    | "provider_feedback"
    | "review_receipt"
    | "verification_receipt";
  source_id: string;
  source_revision: string;
  task_id: string;
  task_revision: string;
  publication_id: string;
  head_sha: string;
  reaction_token: string;
  blocking_reasons: readonly string[];
  trigger_sha256: string;
}
```
Adapters:
```text
FeedbackEventV1 → RepairTriggerV1
ReviewReceipt(changes_requested) → RepairTriggerV1
VerificationReceipt(fail) → RepairTriggerV1
```
Existing RepairOffer, reopen, takeover, reaction receipts and no-progress stay authoritative.
### GateStatusV1
```ts
interface GateStatusV1 {
  protocol: 1;
  kind: "repo-harness-gate-status";
  subject_id: string;
  subject_sha256: string;
  gate_policy_revision: string;
  review:
    | { state: "not_required" }
    | { state: "missing" | "reserved" | "stale" }
    | { state: "pass" | "changes_requested" | "blocked"; receipt_sha256: string };
  verification:
    | { state: "not_required" }
    | { state: "missing" | "reserved" | "stale" }
    | { state: "pass" | "fail" | "blocked"; receipt_sha256: string };
  acceptance:
    | { state: "not_required" }
    | { state: "missing" | "stale" | "pass" | "waived"; receipt_sha256: string | null };
  satisfied: boolean;
  blockers: readonly string[];
  status_sha256: string;
}
```
## Independence Rules
P0 Review requires:
```text
reviewer.engineer_id != executor.engineer_id
reviewer.binding_id != executor.binding_id
reviewer authorization != executor authorization
reviewer not in executor delegated lineage
reviewer has no active writer claim on subject task
reviewer capability in GatePolicy reviewer_capabilities
reviewer binding current at reserve and submit
```
If `different_provider_required=true`:
```text
reviewer.provider != executor.provider
```
Unknown provider fails that optional rule.
Current one-Engineer-per-capability model means P0 must configure a separate reviewer capability. Same-capability multi-seat support is a later protocol, not a hidden exception.
## Reviewer Supply Admission Gate
Required Review 只有在每一个受管 capability 都存在至少一个独立于 executor 的 reviewer 来源时才能激活。没有 reviewer supply 就打开 required gate，会得到一条永远无法通过的流水线。
允许的 reviewer supply：
- 专门的 reviewer capability（独立 Module Engineer identity）；
- 未来的 collaboration-only 持久 principal；
- 未来的同 capability `EngineerSeatV2` 席位。
禁止的 reviewer supply：
- executor fallback（找不到 reviewer 就让 executor 自己过）；
- executor 派生的 child gatekeeper；
- 同一个 Binding；
- 同一个 principal。
当某个 capability 没有可用 reviewer 时，该 capability 的模式是 shadow review 或 manual review，绝不是一条永久阻塞的 required pipeline。模式降级必须显式记录 capability 与降级原因。
## Verification Honesty Boundary
`evidence_replay` 是证据完整性检查：它校验既有 evidence 的存在性、digest 与主题绑定。
`evidence_replay` != independent verification。它没有重新执行任何东西，也没有引入 executor 之外的第二个观察者。
未来的 Auto Merge 不能仅凭 `evidence_replay` 满足 independent Verification。它需要下列之一：
- clean-room rerun（独立 Host 上的完整重跑）；
- 独立 provider check（结果不由 executor 产生）；
- 另一个不完全受 executor 控制的 oracle。
这条边界是 Phase 3 的前置条件，不是 Phase 2 内部的可选优化。
## Revisit Trigger
本 PRD 从 Deferred 转为 Active 需要同时满足：
- 协作层已在至少 3 个真实 Work Package 上使用；
- 每个案例至少有 2 个独立 contributor；
- 观察到 self-review、相互矛盾的 signal，或质量归责问题；
- reviewer supply 已按上面的 admission gate 确定；
- review context 能从 signals 与 handoffs 自动组装，而不需要人工整理；
- 打开 required Review 不会产生无 reviewer 的死锁。
任一条不满足，本 PRD 保持 Deferred，设计资产原样保留。
## Module Behaviors
### Gate Policy Resolver
- **Purpose**: load exact requirements from existing Work Package policy refs.
- **Normal**: read target/canonical policy → validate digest → return policy.
- **Failures**: missing, unsafe path, malformed, stale revision, changed during read.
- **No fallback**: unavailable policy never disables gates.
### Work Exchange Collector
- **Purpose**: combine offers and exclusions.
- **Normal**: double-read graph, profiles, bindings, claims, publications, policies and gate stores.
- **Failure isolation**: component unreadable marks support/degraded.
- **No write**: zero filesystem mutation.
### Review Reservation Store
- **Purpose**: temporary exclusive reviewer liveness.
- **Normal**: reserve → submit/release/expire.
- **Failure**: stale principal/job/policy or lock timeout.
- **Crash**: active reservation remains until expiry or explicit recovery.
### Review Receipt Store
- **Purpose**: immutable formal result.
- **Normal**: validate subject/actor → persist → transition reservation.
- **Failure**: digest conflict, stale subject, independence failure.
- **No mutation**: does not update Task or Lease.
### Verification Plane
- **Purpose**: independent evidence claim.
- **Normal**: reserve → replay evidence → submit.
- **Failure**: evidence unreadable/stale, unsupported clean-room mode.
- **No synthetic pass**.
### Repair Adapter
- **Purpose**: normalize failure sources.
- **Normal**: derive one trigger → existing repair projection.
- **Failure**: inconsistent source/head/task fails closed.
- **No second repair state machine**.
### Gate Convergence
- **Purpose**: pure conjunction for downstream eligibility.
- **Normal**: current policy + current receipts + current acceptance.
- **Failure**: any unreadable/stale component blocks.
- **No task transition**.
## CLI
```text
repo-harness work exchange --format json
repo-harness work offers \
  --mode execute|review|verify|integrate \
  --authorization-id <id> --format json
repo-harness review reserve \
  --authorization-id <id> \
  --review-job-id <id> \
  --expected-offer-revision <digest> \
  --idempotency-key <key>
repo-harness review submit \
  --authorization-id <id> \
  --reservation-id <id> \
  --input <repo-relative-json>
repo-harness review release ...
repo-harness review status ...
repo-harness review read ...
repo-harness verification reserve ...
repo-harness verification submit ...
repo-harness verification release ...
repo-harness verification status ...
```
## MCP
Engineer profile:
```text
work_exchange
work_offers
review_reserve
review_submit
review_release
review_status
verification_reserve
verification_submit
verification_release
verification_status
```
Gate profile must not expose:
- arbitrary file write;
- generic shell;
- task acquire while active gate reservation conflicts;
- publication;
- acceptance;
- merge.
## Operator Board
Read-only P0 fields:
- Work Exchange counts by mode;
- Review/Verification offers;
- exclusion reason;
- current reservation actor;
- exact subject/head/policy;
- receipt freshness;
- gate blockers.
Existing task-message composer remains the only write.
## Persistence
```text
<git-common-dir>/repo-harness/work-exchange/v1/
  reservations/<gate-job-id>/
    events/<transition-id>.json
    current.json
  review-receipts/<sha256>.json
  verification-receipts/<sha256>.json
  repair-triggers/<sha256>.json
```
Every store:
- walks ancestors with lstat;
- rejects symlink/non-directory ancestors;
- uses canonical JSON;
- immutable create + fsync;
- per-job lock;
- exact protocol;
- idempotency conflict;
- no path escape;
- no healthy-empty fallback.
## Performance Targets
| Target | Number |
|---|---:|
| Exchange, 100 WPs / 10 Engineers | p95 ≤3 s |
| Gate reserve, uncontended | p95 ≤500 ms |
| Pure receipt validation | p95 ≤100 ms |
| Current subject replay | p95 ≤5 s |
| Snapshot payload | ≤2 MiB |
| Agent injected offers | top 5, ≤1,500 estimated tokens |
## Success Criteria
| Metric | Target |
|---|---:|
| Required publications with independent current Review | 100% |
| Executor/child formal Review success | 0 |
| Stale receipt accepted | 0 |
| Task/Lease bytes changed by gates | 0 |
| Reservation race winners | exactly 1 |
| Provider failure accepted as pass | 0 |
| Duplicate RepairTrigger | 0 |
| Exchange determinism drift | 0 |
## Acceptance Scenarios
### Scenario 1 — execution compatibility
- Given current ready EngineerOffer.
- When Exchange is collected.
- Then exact offer revision is preserved and no state is written.
### Scenario 2 — review offer derivation
- Given current publication and required policy.
- When Exchange is collected.
- Then one deterministic ReviewOffer appears.
### Scenario 3 — one reservation winner
- Given N eligible reviewer processes.
- When they reserve concurrently.
- Then exactly one active reservation exists.
### Scenario 4 — self-review forbidden
- Given executor or child principal.
- When it reserves/submits.
- Then typed independence failure and zero records.
### Scenario 5 — binding rotation
- Given active reservation.
- When reviewer Binding rotates.
- Then old principal cannot submit.
### Scenario 6 — head movement
- Given pass receipt for Head A.
- When Head B becomes current.
- Then receipt is stale and new job appears.
### Scenario 7 — changes requested
- Given blocking Review finding.
- When receipt is stored.
- Then one RepairTrigger enters existing repair flow.
### Scenario 8 — re-review
- Given repair produces new publication.
- When Exchange refreshes.
- Then old receipt stays audit-only and new ReviewOffer appears.
### Scenario 9 — verification separation
- Given Review pass and Verification fail.
- When GateStatus is built.
- Then satisfied is false.
### Scenario 10 — evidence replay honesty
- Given verifier only reads prior evidence.
- When it submits pass.
- Then mode is evidence_replay; no rerun claim appears.
### Scenario 11 — integration group
- Given module policies require integration scope.
- When individual module gates pass.
- Then module gate status cannot authorize module merge.
### Scenario 12 — Board boundary
- Given exchange enabled.
- When Operator routes are inventoried.
- Then no new browser write route exists.
## Failure Matrix
| Failure | Result |
|---|---|
| policy unavailable | offer blocked |
| publication unavailable | no job + typed exclusion |
| subject unknown | blocked |
| reviewer capability mismatch | excluded |
| reviewer equals executor | rejected |
| reservation held | excluded |
| reservation expired | offerable again, no pass |
| binding stale | submit rejected |
| pass with P1 | receipt invalid |
| changes without finding | receipt invalid |
| evidence missing | verification blocked |
| clean-room unsupported | blocked |
| duplicate trigger | idempotent same bytes |
| changed during read | snapshot degraded |
## Rollout
1. Gate Policy validator.
2. Shadow Exchange.
3. ReviewOffer shadow.
4. Reservation canary.
5. Receipt canary.
6. Required Review for one capability.
7. Repair adapter.
8. Verification evidence replay.
9. Gate convergence.
10. Read-only Board projection.
## Kill Gates
- any new Task/Lease authority;
- any source writer in gate profile;
- executor/child passes Review;
- stale receipt counted current;
- unavailable review becomes pass;
- Work Exchange writes state;
- repair adapter creates a second repair state machine;
- UI derives gate semantics client-side;
- same-capability identity workaround weakens independence.
## Proposed File Map
```text
src/core/work-exchange/
  gate-policy.ts
  work-exchange.ts
  review.ts
  verification.ts
  repair-trigger.ts
  gate-status.ts
src/effects/work-exchange/
  gate-policy.ts
  collect.ts
  gate-reservation-store.ts
  review-receipt-store.ts
  verification-receipt-store.ts
  repair-trigger-store.ts
src/cli/commands/
  work-exchange.ts
  review.ts
  verification.ts
src/cli/mcp/
  work-exchange-tools.ts
  gate-tools.ts
src/core/operator/
  work-exchange-snapshot.ts
```
## Test Map
```text
tests/unit/work-exchange-gate-policy.test.ts
tests/unit/work-exchange-projection.test.ts
tests/unit/review-protocol.test.ts
tests/unit/verification-protocol.test.ts
tests/unit/repair-trigger.test.ts
tests/unit/gate-status.test.ts
tests/effects/work-exchange-collector.test.ts
tests/effects/gate-reservation-store.test.ts
tests/effects/review-receipt-store.test.ts
tests/effects/verification-receipt-store.test.ts
tests/effects/repair-trigger-adapter.test.ts
tests/cli/work-exchange.test.ts
tests/cli/review.test.ts
tests/cli/verification.test.ts
tests/cli/mcp-work-exchange-tools.test.ts
tests/cli/mcp-gate-tools.test.ts
tests/operator-web/work-exchange.test.tsx
```
## Developer Handoff
- Build Gate Policy first.
- Keep `EngineerOfferV1` payload intact.
- Reuse ClaimActorReceipt and review subject builder.
- Reuse existing repair lifecycle through adapters.
- Do not implement clean-room rerun without a separate Host canary.
- Do not add merge code in this child PRD.
- Verify with schema tests, N-way races, staleness matrices, zero-mutation digests, full tests, typecheck, workflow checks and architecture projection.
## Known Unknowns
| Item | Impact | Resolution |
|---|---|---|
| reviewer capability coverage | some WPs may have no reviewer | explicit exclusions + profile creation |
| same-capability review | unavailable v1 | identity v2 PRD |
| provider diversity | thread/provider may be unknown | optional fail-closed policy |
| clean-room rerun | verification mode limited | Host canary |
| multiple reviewers | one reviewer v1 | protocol 2 after use |
