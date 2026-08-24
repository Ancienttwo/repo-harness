# PRD: Engineer Binding Principal and Claim Actor (ME-0B)

> **Status**: Draft
> **Slug**: `engineer-binding-principal-claim-actor`
> **Created**: 2026-08-24T16:53:00+0800
> **Updated**: 2026-08-24T16:53:00+0800
> **Source Spec**: `docs/spec.md`
> **Parent PRD**: `plans/prds/20260824-1653-persistent-module-engineer-organization.prd.md`
> **Depends On**: `plans/prds/20260824-1653-engineer-profile-binding-projection.prd.md`
> **Tier**: compact

## AI Quick-Read Card

- **Problem**: shared Binding 只有在 command boundary 能证明 caller 就是该 Binding 时，才真正具备 old-Session fencing；现有 caller-supplied `session_id` 或命令参数不够可信。
- **Users**: bound Module Engineer、Maintainer、Fleet acquire/runtime owner。
- **Platform**: authenticated local MCP/Worker Host boundary、git-common-dir Binding authority、immutable ClaimActorReceipt。
- **P0 surface**: `EngineerPrincipalV1`、principal derivation、binding CAS revalidation、old-binding refusal、`ClaimActorReceiptV1`。
- **Core metric**: 旧 binding mutation 成功 0 次；每个 engineer-originated Claim 都有 exact actor receipt。
- **Hard constraint**: command payload 中的 engineer/binding fields 只能是 fences，不能成为 principal source。
- **Key risk**: 当前 MCP OAuth authorization ID 证明 client authorization，不证明 Provider Thread；不能把两者等同。
- **Unknowns**: per-binding authenticated carrier 尚未 canary，是本 PRD 保持 Draft 的唯一阻断决策。
- **Acceptance scenarios**: mismatched connection/payload 拒绝、retired principal 拒绝、Claim receipt 与 Lease exact match、receipt write failure 补偿 own Claim。
- **Suggested next step**: 对 Codex App Server、Claude local process 和 MCP OAuth 各做一个只读 identity canary，选择单一 principal carrier 后再批准。

## Problem

任何知道 `engineer_id + binding_generation` 的旧 Session 都能重放这些参数。只有 server-derived principal 才能把 Binding 从路由记录提升为 engineer-scoped authorization authority，同时又不污染 task Lease authority。

### Product Direction

- Authenticated connection/adapter identity 在 server side 映射到 one current Binding。
- Domain command 接收 `EngineerPrincipal + expected binding/profile fences + command body`。
- Claim acquire 成功后写 immutable ClaimActorReceipt；失败则释放本调用自己的 Claim。
- 选择独立 receipt，而不是再次扩展 Lease owner schema。

### Feasibility Boundary

- **Confirmed**: MCP coding profile 已有 authorization-scoped runtime，但 authorization ID 仍是 client credential scope。
- **[UNKNOWN]**: 手动 Codex/Claude Session 的安全 per-binding carrier：dedicated MCP authorization、Worker Host connection 或 Provider adapter identity。
- **[UNVERIFIED]**: Provider Thread ID 是否能在所有 mutation calls 被 server-side observation。

## Users

### Primary Users

- **Module Engineer**: 通过绑定的 authenticated channel 执行有限 engineer commands。
- **Maintainer**: bootstrap/revoke principal carrier，并审计 binding/claim provenance。

### Secondary Users

- **Fleet runtime**: 在 acquire transaction 内创建 ClaimActorReceipt。

## Success Criteria

| Metric | Target | Measurement Method | Degradation Threshold |
|---|---:|---|---:|
| Retired principal mutation | 0 | replay tests | any success |
| Payload identity override | 0 | mismatch matrix | any success |
| Engineer-originated claims with receipt | 100% | acquire fault injection | missing receipt |
| Receipt/Lease mismatch accepted | 0 | schema and live-read tests | any acceptance |

## Acceptance Scenarios

### Scenario 1: Server-derived identity wins

- **Given**: connection belongs to B1 but request claims B2.
- **When**: command boundary derives principal and revalidates current Binding.
- **Then**: request is rejected before domain mutation.
- **Machine-checkable evidence**: typed principal mismatch and unchanged stores.

### Scenario 2: Claim actor receipt is transactional

- **Given**: current principal acquires task claim C/G.
- **When**: ClaimActorReceipt persistence succeeds.
- **Then**: receipt binds exact task revision, C/G, engineer, binding and session observation without changing task identity.
- **Machine-checkable evidence**: canonical receipt/live Lease equality.

### Scenario 3: Receipt persistence fails

- **Given**: acquire wins but receipt storage faults.
- **When**: transaction compensates.
- **Then**: only this caller's Claim is released; no un-attributed bound task remains.
- **Machine-checkable evidence**: injected fault, release token equality and no current receipt.

## Non-goals

- Transparent bound-task transfer.
- Provider liveness authority.
- Delegation, writer grant, messaging or Human Board.
- Reusing a shared bearer token across multiple Engineer bindings.

## Module Behaviors (P0)

### Module 1: Principal Boundary

- **Purpose**: derive trusted actor from authenticated runtime context.
- **Failure paths**: no mapping, retired/stale binding, profile mismatch, authorization revoked and claimed payload mismatch all fail closed.
- **Open decision**: exact carrier; approval blocked until one canary is selected.

### Module 2: Claim Actor Receipt

- **Purpose**: record provenance without modifying Lease semantics.
- **Normal path**: revalidate principal → acquire/bind Claim → persist receipt → return WorkEnvelope plus receipt ref.
- **Failure path**: persistence failure compensates only own Claim.

## Data Model

```yaml
EngineerPrincipalV1:
  engineer_id: string
  binding_id: uuid
  binding_generation: integer
  profile_revision: sha256
  auth_subject: opaque-server-derived
  provider: codex|claude|worker_host
  provider_thread_id: opaque|null

ClaimActorReceiptV1:
  protocol: 1
  kind: repo-harness-claim-actor-receipt
  task_id: sha256
  task_revision: sha256
  claim_id: uuid
  lease_generation: integer
  engineer_id: string
  binding_id: uuid
  binding_generation: integer
  session_id: opaque|null
  bound_at: datetime
```

## Performance Targets

| Target | Number | Measurement Method | Degradation Threshold |
|---|---:|---|---:|
| Principal lookup + binding revalidation | ≤100 ms local | request benchmark | 1 s |
| Claim receipt persistence | ≤100 ms local | fault-injected acquire benchmark | 1 s |

## Known Unknowns

| Item | Impact | Resolution Path | Owner |
|---|---|---|---|
| Per-binding authenticated carrier | Blocks approval | Provider/MCP identity canary and security review | Runtime maintainer |
| Provider Thread ID availability | Affects audit detail only if carrier is independent | keep nullable; never infer | Adapter owner |

## Developer Handoff

Do not implement until the principal carrier decision is frozen and this PRD becomes Approved.

- **Build first after approval**: pure principal validation and Binding revalidation, then authenticated adapter, then ClaimActorReceipt/acquire compensation.
- **Do not reinterpret**: caller parameters are never identity; OAuth authorization ID is not automatically a Thread ID; receipt is not a Lease.
- **Verify with**: auth mismatch matrix, retired-generation replay, acquire fault injection and Lease digest/ownership checks.

### Acceptance Scripts

1. Prove the selected carrier uniquely maps one live connection to one current Binding.
2. Replay retired credentials and spoof payload fields; assert typed refusal.
3. Acquire one task and validate ClaimActorReceipt against live Lease/WorkEnvelope.
4. Inject receipt write failure and prove own-claim compensation.

## Backend Perspective

The authenticated transport derives principal before MCP/CLI domain dispatch. Core commands never accept an unauthenticated `engineer_id` as authority. ClaimActorReceipt uses immutable canonical bytes in git-common-dir and is read alongside, never instead of, the current Lease.
