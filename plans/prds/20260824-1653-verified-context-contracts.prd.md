# PRD: Verified Evidence Context Projection (ME-2C)

> **Status**: Approved
> **Slug**: `verified-context-contracts`
> **Created**: 2026-08-24T16:53:00+0800
> **Updated**: 2026-08-26T11:46:41+0800
> **Source Spec**: `docs/spec.md`
> **Parent PRD**: `plans/prds/20260824-1653-persistent-module-engineer-organization.prd.md`
> **Depends On**: ME-2A read-only delegation and canonical Contract/check/verification evidence
> **Tier**: compact
> **Architecture Acceptance**: `changeset.docs-projection-90539fd46a3eccb5` / `event.user-approval-20260826-me2c-architecture`; accepted reasons `entrypoint-changed,relation-changed,verified-flow-proof-changed`; affected nodes `capability.runtime-harness.engineer-bindings` and `capability.runtime-harness.verified-context`. Final non-major fixed-point projection: `sha256:a7bbda7efaf7c127b60b9638352bb9c4089541842eed7a74859e51bdd310ec7b`.

## AI Quick-Read Card

- **Problem**: Provider compaction/transcript 与 Worker prose 可能被误当成跨轮可信事实；repo-harness 需要在候选、验证和 Human decision 边界投影 exact evidence，而不是接管 Provider 的每轮对话循环。
- **Users**: Module Engineer, read-only Worker, semantic verifier and Human decision owner.
- **Platform**: canonical Contract or exact-source projection, content-addressed context compiler and independent verifier receipts.
- **P0 surface**: candidate-bound `WorkerRoundReceiptV1`、checkpoint `SemanticVerificationAssertionV1`、`DecisionRequestV1` 和 content-addressed trusted/untrusted context projection；`EngineerStepProposalV1` 只在显式 bounded worker checkpoint 使用，不映射每个 Provider turn。
- **Core metric**: unverified claims in trusted next context 0; ambiguous latest assertion selection 0.
- **Hard constraint**: semantic assertion cannot mark Task done, modify Lease, sign Acceptance or enter Publication readiness.
- **Key risk**: selecting “latest” by timestamp/file order or trusting mutable evidence refs.
- **Unknowns**: semantic verifier cost/profile policy remains deployment policy only and does not change the frozen evidence authority.
- **Acceptance scenarios**: checkpoint evidence chain、broken-chain refusal、decision stop、mutable-ref rejection、Provider compaction independence and Acceptance independence。
- **Suggested next step**: freeze one candidate → verifier checkpoint → answered DecisionRequest fixture；证明 Provider transcript/compaction bytes 改变不会改变 trusted projection。

## Problem

The next bounded execution checkpoint needs canonical task intent plus verified candidate evidence, not the full trajectory. Every assertion binds exact candidate, checks and verifier receipts and forms a continuous checkpoint chain；ordinary Provider turns remain Provider-owned runtime history。

### Product Direction

The canonical Contract carries one optional strict `Semantic Constraint Catalog` JSON block. ME-2C requires that block and projects its exact tracked Git commit、blob OID、Contract SHA-256 and sorted constraint IDs into `SemanticContractProjectionV1`; it never accepts a sidecar、heading-derived ID、label or free-prose replacement. Ordinary Contract execution remains unchanged when the block is absent, while ME-2C fails closed. The context projection selects the only continuous, subject-matching checkpoint chain; no timestamp or file-order heuristic exists. Provider transcript、history、compaction summary 与 turn state 永不进入 trusted authority，也不要求 repo-harness 为每个 turn 生成记录。

### Feasibility Boundary

- **Confirmed**: exact digests and immutable receipts can be validated deterministically.
- **Confirmed**: Contract carrier is the exact tracked Contract itself; no second semantic constraint authority exists.
- **[UNKNOWN]**: verifier profile/cost policy and Human UI transport. The wire actor remains a typed Human principal and the unknown does not block the store/CLI authority boundary.
- **Fail closed**: missing/broken/mutable evidence remains untrusted and is excluded.

## Users

### Primary Users

- Module Engineer planning the next bounded round.
- Independent verifier asserting evidence about one exact candidate.

### Secondary Users

- Human answering a typed DecisionRequest.

## Success Criteria

| Metric | Target | Measurement Method | Degradation Threshold |
|---|---:|---|---:|
| Unverified claims in trusted context | 0 | context fixture | any |
| Broken chain selected | 0 | fork/gap fixtures | any |
| Mutable evidence ref accepted | 0 | digest mismatch fixture | any |
| Assertion moving Task/Acceptance | 0 | transition matrix | any |

## Acceptance Scenarios

### Scenario 1: Continuous assertion chain

Round N assertion binds the previous assertion and exact Worker/check/verifier receipts. Round N+1 receives it as verified evidence.

### Scenario 2: Broken or forked chain

Two assertions claim the same round or omit the previous digest. Compiler refuses ambiguous latest selection.

### Scenario 3: Human decision

Open DecisionRequest stops execution. Only an authorized, revision-fenced answer closes it and becomes an explicit next-round input.

## Non-goals

- Worker process lifecycle, retry or cancellation.
- Writable grants, task completion, Publication or Acceptance.
- Full transcript ingestion or autonomous guessing.
- Provider query loop、tool-call parser、streaming、history persistence 或 context compaction。
- Requiring one repo-harness round/assertion for every Provider turn。

## Module Behaviors (P0)

### Module 1: Evidence Contracts

Canonicalize round/proposal/assertion/decision records under exact task, claim, candidate and previous-chain fences.

### Module 2: Evidence Context Projection

Select canonical Contract plus the latest unique continuous checkpoint chain and answered decisions. Emit content-addressed references split into trusted evidence and explicitly untrusted claims；leave prompt assembly、history and compaction to the selected Provider runtime。

## Data Model

```yaml
SemanticContractProjectionV1:
  protocol: 1
  kind: repo-harness-semantic-contract-projection
  contract_ref: repository-relative-contract-path
  contract_revision: exact-git-commit
  contract_blob_oid: exact-git-blob
  contract_sha256: sha256
  constraints: [{constraint_id: stable-id, statement: bounded-utf8}]
  projection_sha256: sha256

EngineerStepProposalV1:
  protocol: 1
  kind: repo-harness-engineer-step-proposal
  proposal_id: uuid
  task: {task_id: sha256, task_revision: sha256, claim_id: uuid, lease_generation: integer}
  binding: {engineer_id: string, binding_id: uuid, binding_generation: integer, engineer_contract_revision: sha256}
  round_index: integer
  previous_assertion_sha256: sha256|null
  contract_sha256: sha256
  context_packet_sha256: sha256
  action_kind: analyze|diagnose|implement|verify|request_decision
  target_constraint_ids: [contract-constraint-id]
  input_evidence_refs: [{ref: string, sha256: sha256}]
  proposal_sha256: sha256

WorkerRoundReceiptV1:
  protocol: 1
  kind: repo-harness-worker-round-receipt
  worker_run_id: uuid
  worker_run_ref_sha256: sha256
  worker_runtime_receipt_sha256: sha256
  delegation_id: uuid
  round_index: integer
  proposal_sha256: sha256
  result_sha256: sha256
  candidate: null|{commit_sha: sha, tree_sha: sha, subject_sha256: sha256}
  before_state_sha256: sha256
  after_state_sha256: sha256
  evidence_refs: [{ref: string, sha256: sha256}]
  round_receipt_sha256: sha256

SemanticVerificationAssertionV1:
  protocol: 1
  assertion_id: uuid
  worker_run_id: uuid
  round_index: integer
  previous_assertion_sha256: sha256|null
  task: {task_id: sha256, task_revision: sha256, claim_id: uuid, lease_generation: integer}
  candidate: {commit_sha: sha, tree_sha: sha, subject_sha256: sha256}
  contract_sha256: sha256
  worker_round_receipt_sha256: sha256
  check_receipt_sha256: sha256
  verifier_receipt_sha256: sha256
  verifier_profile_revision: sha256
  satisfied_constraints: [contract-constraint-id]
  unsatisfied_constraints: [contract-constraint-id]
  blocked_constraints: [contract-constraint-id]
  integrity_findings: [string]
  untrusted_claims: [string]
  evidence_refs: [{ref: string, sha256: sha256}]
  assertion_sha256: sha256

DecisionRequestV1:
  protocol: 1
  kind: repo-harness-decision-request
  decision_id: uuid
  task_fence: {task_id: sha256, task_revision: sha256, claim_id: uuid, lease_generation: integer}
  binding_fence: {engineer_id: string, binding_id: uuid, binding_generation: integer, engineer_contract_revision: sha256}
  previous_assertion_sha256: sha256|null
  question: bounded-utf8
  request_sha256: sha256

DecisionRequestEventV1:
  protocol: 1
  kind: repo-harness-decision-request-event
  transition_id: sha256(decision_id + idempotency_key)
  idempotency_key: bounded-opaque
  operation_fingerprint: sha256(canonical transition request)
  decision_id: uuid
  request_sha256: sha256
  transition: open|answer|cancel|supersede
  expected_current_digest: sha256|null
  actor: {kind: engineer|human, principal_ref: opaque, binding_generation: integer|null}
  next_state: open|answered|cancelled|superseded
  answer: bounded-utf8|null
  event_sha256: sha256

DecisionRequestCurrentV1:
  protocol: 1
  kind: repo-harness-decision-request-current
  decision_id: uuid
  request_sha256: sha256
  current_event_sha256: sha256
  state: open|answered|cancelled|superseded
  answer: bounded-utf8|null
  answered_by: human-principal|null
  previous_current_digest: sha256|null
  current_digest: sha256

VerifiedEvidenceContextV1:
  protocol: 1
  kind: repo-harness-verified-evidence-context
  task: exact-task-fence
  binding: exact-binding-fence
  contract_projection_sha256: sha256
  contract_sha256: sha256
  selected_assertion_sha256: sha256|null
  assertion_chain: [sha256]
  checkpoints: [candidate-bound-checkpoint]
  trusted_evidence_refs: [{ref: closed-scheme, sha256: sha256}]
  untrusted_claims: [bounded-utf8]
  answered_decisions: [human-fenced-answer]
  context_packet_sha256: sha256
```

Constraint lists accept only IDs present in the exact `contract_sha256`; labels or free prose are invalid. A current Engineer Principal may open a request under the exact task/binding fences. Only a Human principal may answer. The opening Engineer or Human may cancel while open; only a current Engineer may supersede an open request after a fenced task/binding/contract change. All transitions use a per-decision lock, immutable create-if-absent event, same-key fingerprint conflict, event fsync, expected-current CAS and current-directory fsync. Crash after event but before current leaves an unpublished event; same-key retry resumes it, while a different/stale actor cannot promote it.

## Known Unknowns

| Item | Impact | Resolution Path | Owner |
|---|---|---|---|
| Verifier profile/cost policy | Runtime quality only | measured checkpoint canary; never changes schema or authority | Verification owner |
| Human UI transport | Operator experience only | later adapter over the frozen DecisionRequest event/current protocol | Control-board owner |

## Developer Handoff

The Contract carrier decision is frozen: the exact tracked Contract owns a strict JSON semantic constraint catalog and `SemanticContractProjectionV1` is a read-only content-addressed projection. Implement schemas/projection、immutable checkpoint/decision storage and bounded CLI only. Reading existing delegated-run receipts is allowed; dispatching or mutating a delegated run is not. Do not introduce Provider effects、runtime loops or authority transitions.

### Acceptance Scripts

1. Build three continuous assertions and select the third.
2. Fork/gap the chain and assert ambiguity refusal.
3. Change evidence bytes behind a ref and assert digest failure.
4. Open a DecisionRequest and prove no next round until fenced Human answer.
5. Assert no semantic record can invoke Task/Lease/Publication/Acceptance transitions.
6. Validate proposal → Worker round → assertion digests end to end and reject a result whose observed run, candidate or Contract constraint IDs differ.
7. Inject Decision open/answer crashes before event, between event/current and after current; assert idempotent retry, actor matrix enforcement and no timestamp-based recovery.
