# PRD: Engineer Delegation and Writer Grants (ME-2A/ME-2B)

> **Status**: Draft
> **Slug**: `engineer-delegation-grants`
> **Created**: 2026-08-24T16:53:00+0800
> **Updated**: 2026-08-24T16:53:00+0800
> **Source Spec**: `docs/spec.md`
> **Parent PRD**: `plans/prds/20260824-1653-persistent-module-engineer-organization.prd.md`
> **Depends On**: ME-0B principal/ClaimActorReceipt; active task Contract/Lease/WorkEnvelope
> **Tier**: standard

## AI Quick-Read Card

- **Problem**: native Subagent calls lack a repo-level proof of parent Claim、role、mode、budget and return contract；writable child also needs mutation-time actor lock, not prompt-only `allowed_paths`。
- **Users**: Module Engineer、temporary Worker、Acceptance Plane、runtime maintainer。
- **Platform**: existing native fleet roles/SubagentStart、parent claimed worktree、delegation store、mutation guard、sandbox/command/network/git policy。
- **P0 surface**: ME-2A read-only `DelegationEnvelopeV1/WorkerResultV1`；ME-2B `DelegatedWorkerGrantV1`、exclusive `writer_actor`、parent freeze、host-observed diff、settlement/recovery。
- **Core metric**: no second Lease；zero writable actor overlap；zero path/policy escape；WorkerResult never mutates task/acceptance。
- **Hard constraint**: ME-2A ships and proves read-only first；ME-2B cannot enable writer until child identity reaches every mutation boundary。
- **Key risk**: same worktree permits Parent and Worker to edit concurrently unless runtime guard verifies current writer actor on every mutation。
- **Unknowns**: trusted native child identity propagation to shell/edit hooks；blocks ME-2B approval only。
- **Acceptance scenarios**: exact role mismatch fail closed、read-only no mutation、writer race one winner、parent frozen、crash reconciliation、actual Git diff beats Worker report。
- **Suggested next step**: approve/implement ME-2A independently；keep all writer modes disabled until ME-2B identity+sandbox canary。

## Problem

“最多一个 writable Subagent”仍允许 Parent Engineer 同时写。`allowed_paths` 也不能阻止 shell/network/global install/.git side effects。Writer authority must be one exclusive worktree actor plus a concrete sandbox policy.

### Product Direction

Effective child authority:

```text
registered repo authorization
∩ active Contract allowed_paths
∩ current WorkEnvelope/Lease subject
∩ DelegationEnvelope subset
∩ active DelegatedWorkerGrant
∩ sandbox + network + command + git policy
```

- Read-only delegation receives no mutation grant and no Claim token bearer.
- Writer state: `none | engineer:<binding-id> | worker:<worker-run-id>`.
- Transition Engineer→Worker atomically freezes Parent write authority before grant becomes active.
- Grant settlement/recovery is required before publication or writer transfer.
- Host independently records before/after HEAD/tree/status/untracked inventory; Worker self-report is untrusted.

### Feasibility Boundary

- **Confirmed**: Codex path requires exact installed `agent_type`, `fork_turns=none` and official SubagentStart observation.
- **[UNKNOWN]**: whether trusted child run identity is observable in every mutation/shell boundary.
- **[UNVERIFIED]**: provider-specific filesystem/process sandbox parity.

## Users

### Primary Users

- **Module Engineer**: delegates one bounded slice under a current Claim.
- **Temporary Worker**: receives one self-contained envelope and returns evidence only.

### Secondary Users

- **Acceptance Plane**: treats WorkerResult as untrusted input, never acceptance.

## Success Criteria

| Metric | Target | Measurement Method | Degradation Threshold |
|---|---:|---|---:|
| Additional canonical Lease | 0 | lease-store inspection | any lease |
| Read-only mutation | 0 | hook/sandbox tests | any write |
| Concurrent writer actors | 0 | N-way race | any overlap |
| Out-of-grant path/policy side effect | 0 | adversarial matrix | any success |
| Crash-stranded writer slot | 0 unrecoverable | recovery fixtures | unreconciled slot |

## Acceptance Scenarios

### Scenario 1: Read-only role admission

- **Given**: root-cause-prover delegation under current Claim.
- **When**: native child role observation mismatches or is unavailable.
- **Then**: dispatch fails closed; no alternate App Thread/main runner is selected.
- **Machine-checkable evidence**: SubagentStart evidence/refusal.

### Scenario 2: Writer race includes Parent

- **Given**: Parent is current writer and two Workers race.
- **When**: grant transition executes.
- **Then**: exactly one Worker can replace Parent as writer; Parent and loser become non-writers before any Worker mutation.
- **Machine-checkable evidence**: actor transition log and mutation rejections.

### Scenario 3: Worker crashes after modifying files

- **Given**: active worker grant and changed worktree.
- **When**: runtime exits without settlement.
- **Then**: writer state becomes `recovery_required`; publication and new writer are blocked until host-observed diff is reconciled.
- **Machine-checkable evidence**: crash receipt, Git inventory and explicit recovery transition.

## Non-goals

- Nested delegation, child Lease, child PR/push/merge or formal Gatekeeper as subordinate writer.
- Writable mode without trusted child identity and sandbox policy.
- Child worktrees in V1.
- Treating WorkerResult.changed_paths as authoritative.

## Module Behaviors (P0)

### Module 1: Read-only Delegation (ME-2A)

- closed roles: explorer, deep-reasoner, root-cause-prover and advisory read-only reviewer;
- parent task/revision/claim/lease generation, WorkEnvelope digest, engineer/binding, goal, paths, acceptance, budget and return contract required;
- no writable sandbox and no mutation credential.

### Module 2: Writer Grant (ME-2B)

- non-transferable grant binds delegation, worker run, exact worktree/branch/unit, parent Claim, allowed-path digest and all policy revisions;
- mutation boundary re-reads Lease, ClaimActor, Binding and current writer actor;
- `active → settling → settled` or `active → recovery_required → settled|cancelled`.

## Data Model

```yaml
DelegatedWorkerGrantV1:
  protocol: 1
  kind: repo-harness-delegated-worker-grant
  grant_id: uuid
  delegation_id: uuid
  worker_run_id: uuid
  parent: {task_id: sha256, task_revision: sha256, claim_id: uuid, lease_generation: 4}
  binding: {engineer_id: string, binding_id: uuid, binding_generation: 7}
  worktree: {path_digest: sha256, branch: string, unit_ref: string}
  allowed_paths_digest: sha256
  sandbox_policy_ref: string
  network_policy_ref: string
  command_policy_ref: string
  git_policy_ref: string
  state: active|settling|recovery_required|settled|cancelled
  expires_at: datetime
```

## Performance Targets

| Target | Number | Measurement Method | Degradation Threshold |
|---|---:|---|---:|
| Read-only admission | ≤2 s local | native canary | 10 s |
| Writer actor CAS | ≤250 ms local | race benchmark | 2 s |
| Crash detection to recovery_required | ≤5 s after runtime exit | integration fixture | 30 s |

## Known Unknowns

| Item | Impact | Resolution Path | Owner |
|---|---|---|---|
| Trusted child identity at all mutation boundaries | Blocks ME-2B approval | hook/provider canary | Runtime owner |
| Sandbox policy parity | Blocks production writer | adversarial provider matrix | Security owner |

## Developer Handoff

ME-2A may become Approved independently. ME-2B remains disabled until both unknowns close.

- **Build first after approval**: read-only core/store/native adapter; writer schema/state only after identity proof; mutation guard and sandbox before any writer CLI.
- **Do not reinterpret**: one writer includes Parent; Worker report is a claim; no fallback runner/role.
- **Verify with**: native role evidence, read-only adversarial writes, writer races, policy escapes and crash recovery.

### Acceptance Scripts

1. Spawn each allowed read-only role and reject mismatch/unavailable routing.
2. Attempt file/shell mutation from read-only Worker and prove no side effect.
3. Race Parent and two Workers for writer actor; prove exactly one active writer.
4. Crash the writer and recover from host-observed Git state.
5. Assert no new Lease, Publication or Acceptance record is created by delegation.

## Backend Perspective

Persistent Thread transport is out of scope. Delegation runtime uses native Worker adapters only. Core owns closed contracts/transitions; effects own locks, runtime observation, sandbox and Git inventories; mutation guards are the enforcement point.
