# PRD: Verified Evidence Context Projection (ME-2C)

> **Status**: Draft
> **Slug**: `verified-context-contracts`
> **Created**: 2026-08-24T16:53:00+0800
> **Updated**: 2026-08-25T15:51:15+0800
> **Source Spec**: `docs/spec.md`
> **Parent PRD**: `plans/prds/20260824-1653-persistent-module-engineer-organization.prd.md`
> **Depends On**: ME-2A read-only delegation and canonical Contract/check/verification evidence
> **Tier**: compact

## AI Quick-Read Card

- **Problem**: Provider compaction/transcript 与 Worker prose 可能被误当成跨轮可信事实；repo-harness 需要在候选、验证和 Human decision 边界投影 exact evidence，而不是接管 Provider 的每轮对话循环。
- **Users**: Module Engineer, read-only Worker, semantic verifier and Human decision owner.
- **Platform**: canonical Contract or exact-source projection, content-addressed context compiler and independent verifier receipts.
- **P0 surface**: candidate-bound `WorkerRoundReceiptV1`、checkpoint `SemanticVerificationAssertionV1`、`DecisionRequestV1` 和 content-addressed trusted/untrusted context projection；`EngineerStepProposalV1` 只在显式 bounded worker checkpoint 使用，不映射每个 Provider turn。
- **Core metric**: unverified claims in trusted next context 0; ambiguous latest assertion selection 0.
- **Hard constraint**: semantic assertion cannot mark Task done, modify Lease, sign Acceptance or enter Publication readiness.
- **Key risk**: selecting “latest” by timestamp/file order or trusting mutable evidence refs.
- **Unknowns**: semantic verifier cost/profile policy remains Draft but does not change authority.
- **Acceptance scenarios**: checkpoint evidence chain、broken-chain refusal、decision stop、mutable-ref rejection、Provider compaction independence and Acceptance independence。
- **Suggested next step**: freeze one candidate → verifier checkpoint → answered DecisionRequest fixture；证明 Provider transcript/compaction bytes 改变不会改变 trusted projection。

## Problem

The next bounded execution checkpoint needs canonical task intent plus verified candidate evidence, not the full trajectory. Every assertion binds exact candidate, checks and verifier receipts and forms a continuous checkpoint chain；ordinary Provider turns remain Provider-owned runtime history。

### Product Direction

Prefer adding semantic fields to the existing canonical Contract. If that schema is not yet changed, `SemanticContractProjectionV1` may only project an exact Contract path/revision/digest and never override it. The projection selects the highest continuous, subject-matching checkpoint chain; no timestamp heuristic exists. Provider transcript、history、compaction summary 与 turn state 永不进入 trusted authority，也不要求 repo-harness 为每个 turn 生成记录。

### Feasibility Boundary

- **Confirmed**: exact digests and immutable receipts can be validated deterministically.
- **[UNKNOWN]**: verifier profile/cost policy and Human answer adapter.
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
```

Constraint lists accept only IDs present in the exact `contract_sha256`; labels or free prose are invalid. A current Engineer Principal may open a request under the exact task/binding fences. Only a Human principal may answer. The opening Engineer or Human may cancel while open; only a current Engineer may supersede an open request after a fenced task/binding/contract change. All transitions use a per-decision lock, immutable create-if-absent event, same-key fingerprint conflict, event fsync, expected-current CAS and current-directory fsync. Crash after event but before current leaves an unpublished event; same-key retry resumes it, while a different/stale actor cannot promote it.

## Known Unknowns

| Item | Impact | Resolution Path | Owner |
|---|---|---|---|
| Canonical Contract extension vs projection | Blocks approval | choose one migration boundary | Contract owner |
| Verifier profile/cost policy | Runtime quality | measured canary | Verification owner |

## Developer Handoff

Implement pure schemas/projection only after Contract carrier decision. Do not introduce Provider or delegated-run effects here.

### Acceptance Scripts

1. Build three continuous assertions and select the third.
2. Fork/gap the chain and assert ambiguity refusal.
3. Change evidence bytes behind a ref and assert digest failure.
4. Open a DecisionRequest and prove no next round until fenced Human answer.
5. Assert no semantic record can invoke Task/Lease/Publication/Acceptance transitions.
6. Validate proposal → Worker round → assertion digests end to end and reject a result whose observed run, candidate or Contract constraint IDs differ.
7. Inject Decision open/answer crashes before event, between event/current and after current; assert idempotent retry, actor matrix enforcement and no timestamp-based recovery.
