# PRD: Read-only Delegation Admission (ME-2A)

> **Status**: Draft
> **Slug**: `read-only-delegation-admission`
> **Created**: 2026-08-24T16:53:00+0800
> **Updated**: 2026-08-25T15:51:15+0800
> **Source Spec**: `docs/spec.md`
> **Parent PRD**: `plans/prds/20260824-1653-persistent-module-engineer-organization.prd.md`
> **Depends On**: ME-0B Principal/ClaimActorReceipt and active canonical Contract/Lease/WorkEnvelope
> **Tier**: compact

## AI Quick-Read Card

- **Problem**: native Subagent calls lack a repo-level proof of parent Claim, admitted role, read-only mode, budget and return contract.
- **Users**: Module Engineer, temporary Worker, runtime maintainer and independent verifier.
- **Platform**: exact installed fleet roles, native SubagentStart observation, parent WorkEnvelope and read-only sandbox evidence.
- **P0 surface**: `DelegationEnvelopeV1`, admission decision, `WorkerRunRefV1`, `WorkerResultV1`, runtime observation and no-mutation proof.
- **Core metric**: second Lease 0; workspace mutation 0; unobserved role substitution 0.
- **Hard constraint**: exact role/runtime mismatch fails closed; no fallback to another role, runner, App Thread or main Session.
- **Key risk**: calling a Worker “read-only” without observing its effective filesystem/process permissions.
- **Unknowns**: provider-specific read-only proof carrier must pass canary before approval.
- **Acceptance scenarios**: exact parent fences, unavailable role refusal, read-only mutation denial, observed runtime identity and untrusted WorkerResult.
- **Suggested next step**: freeze one Codex native-child fixture and one provider-unavailable fixture before approval.

## Problem

A Parent Claim may delegate analysis, diagnosis or verification without transferring task ownership. Prompt text alone cannot prove which installed role ran or that the child lacked write authority.

### Product Direction

Admission validates the exact parent Claim/WorkEnvelope, current Engineer Principal, installed `agent_type`, read-only sandbox proof and closed return contract before spawn. Runtime observation must match the admitted decision. WorkerResult is untrusted evidence and cannot mutate Task, Lease, Publication or Acceptance.

### Feasibility Boundary

- **Confirmed**: exact installed fleet roles and SubagentStart runtime observations already exist.
- **[UNKNOWN]**: which Provider adapters expose a verifiable read-only sandbox receipt.
- **Fail closed**: a Provider without that proof is not admitted by this product surface.

## Users

### Primary Users

- Module Engineer delegating one bounded read-only slice.
- Runtime maintainer validating adapter observations.

### Secondary Users

- Verifier consuming evidence without trusting Worker prose.

## Success Criteria

| Metric | Target | Measurement Method | Degradation Threshold |
|---|---:|---|---:|
| Second canonical Lease | 0 | Lease store inspection | any |
| Workspace mutation | 0 | before/after Git and filesystem receipt | any |
| Role/runtime mismatch admitted | 0 | adapter matrix | any |
| Result affecting task/acceptance | 0 | transition fixtures | any |

## Acceptance Scenarios

### Scenario 1: Exact role admission

- **Given**: current parent fences and installed `root-cause-prover`.
- **When**: the read-only delegation is admitted and observed.
- **Then**: observed role, parent Claim and sandbox proof match the admission bytes.

### Scenario 2: No fallback

- **Given**: requested role is unavailable.
- **When**: admission runs.
- **Then**: it returns typed `role_unavailable`; no alternate runner starts.

### Scenario 3: Mutation attempt

- **Given**: admitted read-only Worker.
- **When**: it attempts any filesystem/process mutation.
- **Then**: sandbox denies it and the result records the denial as evidence only.

## Non-goals

- Writable Worker, writer slot, Parent freeze or grant settlement.
- Provider/delegated-run process lifecycle.
- Recursive delegation, second Lease, publication or acceptance.

## Module Behaviors (P0)

### Module 1: Admission

Validate exact parent/Engineer fences, installed role, mode, budget and read-only proof; persist immutable admission bytes before spawn.

### Module 2: Runtime Observation

Observe actual role/runtime/run identity and reject mismatch. Collect result and before/after state receipts without trusting self-report.

## Data Model

```yaml
DelegationEnvelopeV1:
  protocol: 1
  delegation_id: uuid
  parent: {task_id: sha256, task_revision: sha256, claim_id: uuid, lease_generation: integer, work_envelope_sha256: sha256}
  engineer: {engineer_id: string, binding_id: uuid, binding_generation: integer, claim_actor_receipt_sha256: sha256}
  role: closed-installed-agent-type
  mode: read_only
  goal: bounded-utf8
  allowed_read_paths: [string]
  budget: {max_turns: integer, max_depth: 0}
  return_contract: WorkerResultV1
  envelope_sha256: sha256

DelegationAdmissionReceiptV1:
  protocol: 1
  kind: repo-harness-delegation-admission-receipt
  delegation_id: uuid
  envelope_sha256: sha256
  decision: admitted|rejected
  rejection_reason: null|parent_stale|binding_stale|role_unavailable|mode_unsupported|budget_invalid|sandbox_unverified
  admitted_role: closed-installed-agent-type|null
  admitted_mode: read_only|null
  admitted_sandbox_policy_sha256: sha256|null
  expected_runtime_observation_sha256: sha256|null
  decided_at: datetime
  admission_receipt_sha256: sha256

WorkerRunRefV1:
  protocol: 1
  kind: repo-harness-worker-run-ref
  worker_run_id: uuid
  delegation_id: uuid
  admission_receipt_sha256: sha256
  observed_role: closed-installed-agent-type
  runtime_principal_ref: opaque
  subagent_start_observation_sha256: sha256
  read_only_sandbox_receipt_sha256: sha256
  run_ref_sha256: sha256

WorkerResultV1:
  protocol: 1
  delegation_id: uuid
  worker_run_id: uuid
  worker_run_ref_sha256: sha256
  observed_role: string
  runtime_observation_sha256: sha256
  read_only_sandbox_receipt_sha256: sha256
  evidence_refs: [{ref: string, sha256: sha256}]
  untrusted_claims: [bounded-utf8]
  result_sha256: sha256
```

Only an `admitted` receipt can produce a `WorkerRunRefV1`. Its admitted role/mode/sandbox digest must match the exact `SubagentStart` observation and runtime sandbox receipt before result collection. A rejected admission is terminal and cannot be translated to a different role or adapter.

## Known Unknowns

| Item | Impact | Resolution Path | Owner |
|---|---|---|---|
| Provider read-only proof | Blocks approval per Provider | adapter canary | Runtime owner |

## Developer Handoff

Do not implement until ME-0B is Approved and one adapter proof is frozen. No write mode or compatibility fallback belongs in this PRD.

### Acceptance Scripts

1. Admit exact role and compare admission/runtime observation digests.
2. Request missing role and assert no child starts.
3. Attempt write/shell side effect and assert sandbox denial plus byte-identical repo state.
4. Return `completed` prose and assert no Task/Acceptance transition.
5. Change admitted role, sandbox digest or observed run identity after admission; assert no `WorkerRunRefV1` or result is accepted.
