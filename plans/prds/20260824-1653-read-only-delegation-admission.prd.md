# PRD: Read-only Delegation Admission (ME-2A)

> **Status**: Approved
> **Slug**: `read-only-delegation-admission`
> **Created**: 2026-08-24T16:53:00+0800
> **Updated**: 2026-08-26T02:57:00+0800
> **Source Spec**: `docs/spec.md`
> **Parent PRD**: `plans/prds/20260824-1653-persistent-module-engineer-organization.prd.md`
> **Depends On**: ME-0B Principal/ClaimActorReceipt and active canonical Contract/Lease/WorkEnvelope
> **Tier**: compact

## AI Quick-Read Card

- **Problem**: native Subagent calls lack a repo-level proof of parent Claim, admitted role, read-only mode, budget and return contract.
- **Users**: Module Engineer, temporary Worker, runtime maintainer and independent verifier.
- **Platform**: exact logical Role Profile bytes, parent WorkEnvelope, frozen Codex CLI capability receipt and effective read-only sandbox evidence; native SubagentStart remains an unsupported observation-only path for P0.
- **P0 surface**: `DelegationEnvelopeV1`, admission decision, `WorkerRunRefV1`, `WorkerResultV1`, runtime observation and no-mutation proof.
- **Core metric**: second Lease 0; workspace mutation 0; unobserved role substitution 0.
- **Hard constraint**: exact role/runtime mismatch fails closed; no fallback to another role, runner, App Thread or main Session.
- **Key risk**: calling a Worker “read-only” without observing its effective filesystem/process permissions.
- **Closed decisions**: the first supported carrier is one-shot Codex CLI `--sandbox read-only`; native child is rejected because its configured sandbox declaration did not prevent a real repository write.
- **Acceptance scenarios**: exact parent fences, unavailable role refusal, read-only mutation denial, observed runtime identity and untrusted WorkerResult.
- **Suggested next step**: implement the exact admission and conditional one-shot adapter frozen by the 2026-08-26 canaries.

## Problem

A Parent Claim may delegate analysis, diagnosis or verification without transferring task ownership. Prompt text alone cannot prove which installed role ran or that the child lacked write authority.

### Product Direction

Admission validates the exact parent Claim/WorkEnvelope, current Engineer Principal, logical Role Profile, read-only runtime capability, protected snapshot scope and closed return contract before spawn. Runtime observation must match the admitted profile/capability bytes. A logical Role Profile is not represented as Provider-native `agent_type`. WorkerResult is untrusted evidence and cannot mutate Task, Lease, Publication or Acceptance.

### Feasibility Boundary

- **Confirmed**: exact installed fleet profile bytes and SubagentStart role/model observations already exist, but `sandbox_mode` in that observation is scanned configuration rather than effective permission proof.
- **Confirmed**: the initial `codex-cli 0.147.0` probe denied the sentinel mutation. The current `codex-cli 0.149.0` contract removes the model from capability proof: it resolves the Host PATH executable, freezes real path/version/bytes, and runs exact `codex sandbox --permission-profile :read-only --include-managed-config --cd <repo> /usr/bin/touch -- <worktree-sentinel> <git-common-sentinel>`. Admission requires exit `1`, the exact two `Operation not permitted` paths, absent sentinels, identical protected snapshots, and a durable process receipt even when capability publication fails.
- **Fail closed**: native child and any Provider/runtime without the frozen effective proof are not admitted by this product surface.

### Canary Decision (2026-08-26)

- Main subject: `03db824da319ece33155fcca1e08303da5751d36`.
- Native `explorer`: exact `touch .me2a-native-readonly-canary` exited `0` and created the sentinel despite its TOML declaring `sandbox_mode = "read-only"`; the controlled sentinel was removed immediately afterward.
- Codex CLI: the historical `0.147.0` model turn established feasibility. The production `0.149.0` capability evidence is model-free: the built-in `:read-only` permission profile directly wraps `/usr/bin/touch`, bounded/redacted captured stderr names exactly the two denied sentinels, and both worktree/Git-common snapshots remain byte-identical. The later ME-3B `codex exec` output is separate untrusted run evidence, not capability proof.
- Decision: native `agent_type` observation cannot supply P0 read-only proof. Admit an exact logical Role Profile plus a frozen Codex CLI capability receipt; conditional ME-3B owns the one-shot effect.

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

- **Given**: current parent fences, an installed read-only logical Role Profile and the current frozen Codex CLI capability receipt.
- **When**: the read-only delegation is admitted and observed.
- **Then**: observed logical profile, parent Claim, execution packet, runtime capability and sandbox proof match the admission bytes without claiming a native `agent_type`.

### Scenario 2: No fallback

- **Given**: requested role is unavailable.
- **When**: admission runs.
- **Then**: it returns typed `role_unavailable`; no alternate runner starts.

### Scenario 3: Mutation attempt

- **Given**: admitted read-only Worker and the closed Host-derived protected snapshot scope containing the exact worktree and Git-common sentinels. Callers cannot widen, narrow or replace this capability scope.
- **When**: it attempts the mutation matrix for that scope.
- **Then**: the sandbox denies it, protected before/after snapshot digests remain identical, and the result records the denial as evidence only. No broader system-wide non-mutation claim is made.

## Non-goals

- Writable Worker, writer slot, Parent freeze or grant settlement.
- Provider query loop, daemon or generic Worker Host; the one-shot ME-3B effect is a separate dependency.
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
  logical_role: closed-read-only-role
  role_profile_sha256: sha256
  runtime_capability_sha256: sha256
  execution_packet_sha256: sha256
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
  rejection_reason: null|parent_stale|binding_stale|role_profile_unavailable|role_profile_stale|runtime_capability_stale|sandbox_capability_unverified
  admitted_role_profile_sha256: sha256|null
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
  runtime_kind: codex_exec
  logical_role: closed-read-only-role
  role_profile_sha256: sha256
  runtime_principal_ref: opaque
  launch_claim_sha256: sha256
  execution_receipt_sha256: sha256
  read_only_sandbox_receipt_sha256: sha256
  run_ref_sha256: sha256

WorkerResultV1:
  protocol: 1
  delegation_id: uuid
  worker_run_id: uuid
  worker_run_ref_sha256: sha256
  logical_role: closed-read-only-role
  runtime_observation_sha256: sha256
  read_only_sandbox_receipt_sha256: sha256
  evidence_refs: [{ref: string, sha256: sha256}]
  untrusted_claims: [bounded-utf8]
  result_sha256: sha256
```

Only an `admitted` receipt can produce a `WorkerRunRefV1`. Its Role Profile、execution packet、runtime capability、mode、launch claim、sandbox and protected-snapshot digests must match before result collection. A rejected admission is terminal and cannot be translated to a different role or adapter. Native `SubagentStart` evidence remains available for diagnostics but cannot satisfy this P0 sandbox gate.

`allowed_read_paths` is bounded context metadata rendered into the immutable execution packet; Codex read-only sandbox does not expose a filesystem read allowlist, so this field grants no access and must not be described as runtime enforcement. Process evidence is the process runner's bounded/redacted capture persisted as immutable blobs, not an unbounded byte-for-byte audit transcript.

## Known Unknowns

| Item | Impact | Resolution Path | Owner |
|---|---|---|---|
| Provider-native child effective sandbox receipt | Native path stays unsupported | wait for Provider-issued runtime evidence and rerun the same mutation matrix | Runtime owner |

## Developer Handoff

ME-0B and the first Codex CLI adapter proof are frozen. Implement only the admitted logical-profile/read-only path with conditional ME-3B. No write mode or compatibility fallback belongs in this PRD.

### Acceptance Scripts

1. Admit exact role and compare admission/runtime observation digests.
2. Request missing role and assert no child starts.
3. Attempt write/shell side effect and assert sandbox denial plus byte-identical repo state.
4. Return `completed` prose and assert no Task/Acceptance transition.
5. Change admitted role, sandbox digest or observed run identity after admission; assert no `WorkerRunRefV1` or result is accepted.
