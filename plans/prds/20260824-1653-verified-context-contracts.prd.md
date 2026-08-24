# PRD: Verified Context Contracts (ME-2C)

> **Status**: Draft
> **Slug**: `verified-context-contracts`
> **Created**: 2026-08-24T16:53:00+0800
> **Updated**: 2026-08-24T18:30:00+0800
> **Source Spec**: `docs/spec.md`
> **Parent PRD**: `plans/prds/20260824-1653-persistent-module-engineer-organization.prd.md`
> **Depends On**: ME-2A read-only delegation and canonical Contract/check/verification evidence
> **Tier**: compact

## AI Quick-Read Card

- **Problem**: long-running Engineers may promote Worker prose or stale transcript into next-round truth without an exact evidence chain.
- **Users**: Module Engineer, read-only Worker, semantic verifier and Human decision owner.
- **Platform**: canonical Contract or exact-source projection, content-addressed context compiler and independent verifier receipts.
- **P0 surface**: `EngineerStepProposalV1`, `WorkerRoundReceiptV1`, `SemanticVerificationAssertionV1`, `DecisionRequestV1`, runtime failure/budget and context selection.
- **Core metric**: unverified claims in trusted next context 0; ambiguous latest assertion selection 0.
- **Hard constraint**: semantic assertion cannot mark Task done, modify Lease, sign Acceptance or enter Publication readiness.
- **Key risk**: selecting “latest” by timestamp/file order or trusting mutable evidence refs.
- **Unknowns**: semantic verifier cost/profile policy remains Draft but does not change authority.
- **Acceptance scenarios**: continuous evidence chain, broken-chain refusal, decision stop, mutable-ref rejection and Acceptance independence.
- **Suggested next step**: freeze one read-only two-round fixture with an answered DecisionRequest.

## Problem

The next round needs canonical task intent plus verified candidate evidence, not the full trajectory. Every assertion must bind exact candidate, checks and verifier receipts and form a continuous chain.

### Product Direction

Prefer adding semantic fields to the existing canonical Contract. If that schema is not yet changed, `SemanticContractProjectionV1` may only project an exact Contract path/revision/digest and never override it. The context compiler selects the highest continuous, subject-matching assertion chain; no timestamp heuristic exists.

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

## Module Behaviors (P0)

### Module 1: Evidence Contracts

Canonicalize round/proposal/assertion/decision records under exact task, claim, candidate and previous-chain fences.

### Module 2: Context Compiler

Select canonical Contract plus the latest unique continuous assertion chain and answered decisions. Preserve Worker claims only in an explicitly untrusted section.

## Data Model

```yaml
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
  satisfied_constraints: [string]
  unsatisfied_constraints: [string]
  blocked_constraints: [string]
  integrity_findings: [string]
  untrusted_claims: [string]
  evidence_refs: [{ref: string, sha256: sha256}]
  assertion_sha256: sha256

DecisionRequestV1:
  protocol: 1
  decision_id: uuid
  revision: integer
  task_fence: {task_id: sha256, task_revision: sha256, claim_id: uuid, lease_generation: integer}
  binding_fence: {engineer_id: string, binding_generation: integer}
  question: bounded-utf8
  state: open|answered|cancelled|superseded
  answer: bounded-utf8|null
  answered_by: human-principal|null
  answer_revision: integer|null
  record_sha256: sha256
```

## Known Unknowns

| Item | Impact | Resolution Path | Owner |
|---|---|---|---|
| Canonical Contract extension vs projection | Blocks approval | choose one migration boundary | Contract owner |
| Verifier profile/cost policy | Runtime quality | measured canary | Verification owner |

## Developer Handoff

Implement pure schemas/compiler only after Contract carrier decision. Do not introduce Worker Host effects here.

### Acceptance Scripts

1. Build three continuous assertions and select the third.
2. Fork/gap the chain and assert ambiguity refusal.
3. Change evidence bytes behind a ref and assert digest failure.
4. Open a DecisionRequest and prove no next round until fenced Human answer.
5. Assert no semantic record can invoke Task/Lease/Publication/Acceptance transitions.
