# PRD: Writable Worker Grant (ME-2B)

> **Status**: Draft
> **Slug**: `writable-worker-grant`
> **Created**: 2026-08-24T16:53:00+0800
> **Updated**: 2026-08-24T18:30:00+0800
> **Source Spec**: `docs/spec.md`
> **Parent PRD**: `plans/prds/20260824-1653-persistent-module-engineer-organization.prd.md`
> **Depends On**: ME-0B, ME-2A and ME-3 Worker Host; current Contract/Lease/WorkEnvelope
> **Tier**: compact

## AI Quick-Read Card

- **Problem**: a writable Worker needs mutation-time authority while Parent Engineer and every other child are provably unable to write the same worktree.
- **Users**: managed Module Engineer, writable Worker, Worker Host operator and Acceptance Plane.
- **Platform**: Worker Host-controlled Parent/child processes, exclusive writer actor, OS sandbox and host-observed Git state.
- **P0 surface**: `DelegatedMutationGrantV1`, host-enforced Parent freeze, writer actor CAS, mutation guard, settlement and crash recovery.
- **Core metric**: writer overlap 0; path/policy escape 0; publication before settlement 0.
- **Hard constraint**: unmanaged Provider Sessions remain read-only; prompt text or a store flag cannot freeze their filesystem permissions.
- **Key risk**: Parent retains shell/edit authority after the store says Worker owns the slot.
- **Unknowns**: dynamic Parent permission revocation and child runtime principal require Worker Host canary.
- **Acceptance scenarios**: Parent-to-Worker handoff, second writer refusal, mutation-time revalidation, crash recovery and observed diff.
- **Suggested next step**: approve only after ME-3 demonstrates managed Parent freeze and sandbox receipts.

## Problem

`max_parallel_writers: 1` is meaningless if it counts only Workers. The exclusive writer domain includes the Parent Engineer. Every mutation path, including shell children and formatters, must be constrained by the Host and sandbox.

### Product Direction

Writable delegation is enabled only for an Engineer Session managed by ME-3 Worker Host. The Host freezes Parent write capability before activating the Worker grant, revalidates grant epoch and parent Lease at mutation boundaries, observes actual Git state, and blocks publication/new writers until settlement.

### Feasibility Boundary

- **Confirmed**: store CAS and Git diff observation are available locally.
- **[UNKNOWN]**: provider process/sandbox controls that revoke Parent writes without terminating useful read/observe/cancel capability.
- **Fail closed**: unmanaged/manual Session, unverifiable runtime principal or missing sandbox means read-only only.

## Users

### Primary Users

- Managed Module Engineer delegating one bounded mutation unit.
- Worker Host enforcing the writer domain.

### Secondary Users

- Gatekeeper reading settled evidence; it never inherits the grant.

## Success Criteria

| Metric | Target | Measurement Method | Degradation Threshold |
|---|---:|---|---:|
| Concurrent writer actors | ≤1 | race/fault fixtures | >1 |
| Mutation outside grant | 0 | sandbox matrix | any |
| Parent writes while Worker active | 0 | process/filesystem fixture | any |
| Publication before settlement | 0 | transition fixture | any |

## Acceptance Scenarios

### Scenario 1: Parent freeze precedes grant

Parent begins as writer. Host revokes Parent mutation capability, records the freeze receipt, then CAS-activates Worker actor. Reversed or partial order fails closed.

### Scenario 2: Worker crash

After observed mutation, runtime disappears. Grant enters `recovery_required`; Parent remains read-only and publication/new writer admission is blocked until Human-directed settlement.

### Scenario 3: Mutation-time stale grant

Grant is revoked between command admission and effect. The effect boundary revalidates epoch/state and denies mutation.

## Non-goals

- Manual Provider Session write delegation.
- Second Lease, automatic merge, publication or Acceptance.
- Prompt-only allowed paths or hook-only filesystem security.

## Module Behaviors (P0)

### Module 1: Writer Election

Under one lock, validate Parent Claim/Host principal, freeze Parent, CAS `writer_actor`, then issue an immutable grant.

### Module 2: Mutation and Settlement

Every effect revalidates Lease, grant epoch/state, runtime principal, actor and sandbox policy. Host captures before/after Git state and settles or enters recovery.

## Data Model

```yaml
DelegatedMutationGrantV1:
  protocol: 1
  grant_id: uuid
  grant_epoch: integer
  parent: {task_id: sha256, task_revision: sha256, claim_id: uuid, lease_generation: integer}
  delegation_id: uuid
  worker_run_id: uuid
  runtime_principal_id: opaque
  worktree: string
  branch: string
  unit_ref: string
  allowed_paths_digest: sha256
  sandbox_policy_digest: sha256
  network_policy_digest: sha256
  command_policy_digest: sha256
  parent_freeze_receipt_sha256: sha256
  writer_actor: worker:<worker-run-id>
  state: active|revoking|revoked|settled|expired|recovery_required
  issued_at: datetime
  expires_at: datetime
  settled_at: datetime|null
  grant_sha256: sha256
```

## Known Unknowns

| Item | Impact | Resolution Path | Owner |
|---|---|---|---|
| Managed Parent permission revocation | Blocks approval | ME-3 process/sandbox canary | Host owner |
| Child principal at every effect | Blocks approval | runtime identity matrix | Security owner |

## Developer Handoff

Do not implement before ME-3 is Approved. No unmanaged Session compatibility mode is allowed.

### Acceptance Scripts

1. Race Parent and two Workers; assert one active writer actor.
2. Attempt Parent shell/edit while Worker is active; assert OS/effect denial.
3. Revoke between admission/effect and assert no mutation.
4. Crash after dirtying files; assert recovery lock and host-observed diff.
5. Attempt publication before settlement; assert typed refusal.
