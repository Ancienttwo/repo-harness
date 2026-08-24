# PRD: Engineer Binding Principal and Claim Actor (ME-0B)

> **Status**: Approved
> **Slug**: `engineer-binding-principal-claim-actor`
> **Created**: 2026-08-24T16:53:00+0800
> **Updated**: 2026-08-25T00:20:00+0800
> **Human Approval**: User approved ME-0B execution on 2026-08-25 after carrier canary closure
> **Source Spec**: `docs/spec.md`
> **Parent PRD**: `plans/prds/20260824-1653-persistent-module-engineer-organization.prd.md`
> **Depends On**: `plans/prds/20260824-1653-engineer-profile-binding-projection.prd.md`
> **Related Research**: `docs/researches/20260825-me0b-principal-carrier-canary.md`
> **Tier**: compact
> **Target Baseline**: `main@0e4aa6a6a75ccfaae95a87ed706370dbb2e5549a`

## AI Quick-Read Card

- **Problem**: shared Binding 只有在 command boundary 能证明 caller 就是该 Binding 时，才真正具备 old-Session fencing；现有 caller-supplied `session_id` 或命令参数不够可信。
- **Users**: bound Module Engineer、Maintainer、Fleet acquire/runtime owner。
- **Platform**: restricted MCP OAuth Engineer profile、server-owned principal mapping、git-common-dir Binding authority、immutable ClaimActorReceipt。
- **P0 surface**: `EngineerPrincipalV1`、`EngineerPrincipalMappingV1`、principal derivation、binding CAS revalidation、old-binding refusal、`ClaimActorReceiptV1`、engineer-scoped acquire。
- **Core metric**: 旧 binding mutation 成功 0 次；每个 engineer-originated Claim 都有 exact actor receipt。
- **Hard constraint**: command payload 中的 engineer/binding fields 只能是 fences，不能成为 principal source。
- **Key risk**: 当前 MCP OAuth authorization ID 证明 client authorization，不证明 Provider Thread；不能把两者等同。
- **Unknowns**: blocking unknowns closed；Provider Thread ID 仍为 nullable observation，不影响 principal authority。
- **Acceptance scenarios**: mismatched connection/payload 拒绝、retired principal 拒绝、Claim receipt 与 Lease exact match、receipt write failure 补偿 own Claim。
- **Suggested next step**: 按冻结的 restricted MCP OAuth carrier 捕获 work-package contract；先实现 profile/scope、mapping 和 principal revalidation，再接 ClaimActorReceipt/acquire compensation。

## Problem

任何知道 `engineer_id + binding_generation` 的旧 Session 都能重放这些参数。只有 server-derived principal 才能把 Binding 从路由记录提升为 engineer-scoped authorization authority，同时又不污染 task Lease authority。

### Product Direction

- Restricted Engineer MCP OAuth authorization 在 server side 映射到 one current Binding。
- Domain command 接收 `EngineerPrincipal + expected binding/profile fences + command body`。
- Claim acquire 成功后写 immutable ClaimActorReceipt；失败则释放本调用自己的 Claim。
- 选择独立 receipt，而不是再次扩展 Lease owner schema。

### Feasibility Boundary

- **Confirmed**: OAuth `authorizationId` 由 server mint/verify，跨 refresh 保持稳定；HTTP transport、workspace 和 process runtime 已按 authorization 隔离，cross-authorization transport hijack 失败；token revision/revocation 可关闭 runtime。Canary evidence: `docs/researches/20260825-me0b-principal-carrier-canary.md`，32 focused tests pass。
- **Frozen carrier**: 新增独立 `engineer` MCP profile 与 `repo-harness.engineer` scope，只暴露 ME-0B engineer tools；不复用开放 shell 的 coding profile。
- **Rejected carriers**: Codex App Server Thread ID 当前不进入 repo-harness authenticated request context；Claude/Codex hook `session_id` 来自 payload/env。二者只作 nullable observation。
- **[UNVERIFIED]**: Provider Thread ID 是否能在所有 mutation calls 被 server-side observation；不阻塞 P0，也不得被推断。

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
- **Frozen carrier**: verified `authorizationId` from restricted Engineer MCP OAuth；MCP session ID and Provider Thread ID are never principal sources.

### Module 1A: Principal Mapping

- **Purpose**: map one server-minted authorization to one exact current Binding without exposing bearer credentials to CLI or tool payloads.
- **Store**: user-level repo-harness state, mode `0600`, closed canonical JSON, explicit lock and atomic rename；never worktree-local and never exposed through Engineer tools.
- **Enrollment**: local operator selects an unbound authorization plus exact current Binding fences；the bearer token is neither input nor output.
- **Revocation**: token verification/revocation fails first；mapping cleanup may follow idempotently。Every command still revalidates the live Binding, so delayed cleanup cannot authorize a rotated Binding.

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
  engineer_contract_revision: sha256
  carrier: mcp_oauth
  auth_subject: opaque-server-derived
  provider: codex|claude|worker_host|unknown
  provider_thread_id: opaque|null

EngineerPrincipalMappingV1:
  protocol: 1
  kind: repo-harness-engineer-principal-mapping
  repository_id: string
  authorization_id: uuid
  engineer_id: string
  binding_id: uuid
  binding_generation: integer
  engineer_contract_revision: sha256
  state: active|revoked
  created_at: datetime
  revoked_at: datetime|null
  mapping_digest: sha256

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
  repository_id: string # exact WorkEnvelopeV1.repo_id
  authorization_revision: integer # exact WorkEnvelopeV1.authorization_revision
  work_envelope_sha256: sha256
  worktree_path: string # exact WorkEnvelopeV1.worktree_path
  branch: string
  unit_ref: string
  engineer_contract_revision: sha256
  session_id: opaque|null
  bound_at: datetime
  receipt_sha256: sha256
```

## Performance Targets

| Target | Number | Measurement Method | Degradation Threshold |
|---|---:|---|---:|
| Principal lookup + binding revalidation | ≤100 ms local | request benchmark | 1 s |
| Claim receipt persistence | ≤100 ms local | fault-injected acquire benchmark | 1 s |

## Known Unknowns

| Item | Impact | Resolution Path | Owner |
|---|---|---|---|
| Per-binding authenticated carrier | Closed | restricted MCP OAuth authorization ID；see carrier canary research | Runtime maintainer |
| Principal mapping store and revocation transaction | Closed for P0 | server-owned user-level store；token-first revocation plus mandatory live Binding revalidation | Runtime maintainer |
| Provider Thread ID availability | Affects audit detail only if carrier is independent | keep nullable; never infer | Adapter owner |

## Developer Handoff

This PRD is Approved. Implement only the frozen restricted MCP OAuth carrier；do not substitute coding profile、hook identity、MCP session ID or Provider Thread ID。

- **Build first**: Engineer MCP profile/scope and exact tool inventory；pure principal/mapping validation and live Binding revalidation；then ClaimActorReceipt/acquire compensation。
- **Do not reinterpret**: caller parameters are never identity；OAuth authorization ID is deliberately the credential carrier and is not a Thread ID；receipt is not a Lease；direct CLI remains local operator enrollment/readback only and cannot impersonate an Engineer mutation。
- **Verify with**: profile/tool inventory, cross-authorization mismatch matrix, retired-generation replay, token revocation, acquire fault injection and Lease digest/ownership checks.

### Acceptance Scripts

1. Prove one restricted OAuth authorization maps to one current Binding；refresh preserves its subject, a second grant differs, and cross-authorization session/tool reuse fails.
2. Bind ClaimActorReceipt `repository_id`, `authorization_revision`, `worktree_path`, branch and unit byte-for-byte to the exact WorkEnvelope fields, plus WorkEnvelope and engineer contract digests.
3. Allow generic/non-engineer Fleet acquire without ClaimActorReceipt; require it for every engineer-originated acquire.
4. Fault receipt persistence after acquire; release only the Claim created by this transaction and retain any created worktree as a typed recoverable residual.
5. Replay retired credentials and spoof payload fields; assert typed refusal.
6. Acquire one task and validate ClaimActorReceipt against live Lease/WorkEnvelope.
7. Inventory the `engineer` profile and assert it exposes no shell、workspace coder、agent runner、generic Fleet mutation、operator Binding mutation、Publication or Acceptance tool.

## Backend Perspective

The restricted Engineer MCP transport derives principal before domain dispatch. Core commands never accept an unauthenticated `engineer_id` as authority. Local CLI may enroll/revoke mappings as an operator but cannot execute engineer-scoped acquire. ClaimActorReceipt uses immutable canonical bytes in git-common-dir and is read alongside, never instead of, the current Lease.
