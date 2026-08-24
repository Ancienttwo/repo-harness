# ME-0B Principal Carrier Canary and Authority Decision

> **Date**: 2026-08-25
> **Status**: Decision complete
> **Scope**: Codex App Server、Claude local process、MCP OAuth 三条 identity path；不实现 Claim、Lease 或 Provider lifecycle。
> **Related PRD**: `plans/prds/20260824-1653-engineer-binding-principal-claim-actor.prd.md`

## 结论

ME-0B 选择 **restricted MCP OAuth Engineer authorization** 作为唯一 P0 principal carrier。它复用现有 OAuth `authorizationId` 的 server-side mint/verify/refresh/revoke 与 HTTP transport binding，但必须增加独立的 `engineer` MCP profile 和 `repo-harness.engineer` scope；该 profile 不开放 `exec_command`、workspace coder、agent runner、任意文件写入或通用 Fleet mutation。

Codex App Server Thread ID 与 Claude hook `session_id` 只保留为 nullable observation。二者当前都不能在 repo-harness mutation boundary 被 server-side authentication，因此不得成为 `EngineerPrincipalV1.auth_subject`。

## 可观察与可控制条件

- 可观察：OAuth token verification 返回 server-minted `authorizationId`；MCP HTTP transport 把 session 绑定到该 ID；refresh 保留 ID；新 grant 产生新 ID；revocation 能关闭该 authorization runtime。
- 可观察：Codex Desktop 的 Thread 工具只存在于 Agent tool plane，repo-harness CLI/MCP request context 没有经过认证的 Thread ID。
- 可观察：Claude/Codex hook `session_id` 来自 hook payload 或环境变量；现有 resolution contract 明确优先接受 payload 值。
- 可控制：新增最小 `engineer` profile/scope、受限工具面、server-owned principal mapping、每次 mutation 的 Binding CAS revalidation、token revocation cleanup。
- 不可控制：Provider 是否暴露稳定 Thread ID、Provider Session 是否仍在线、同一 OS user 下的人工文件操作。这些都不进入 task/claim authority。

## P1 · Architecture Map

<div style="border:1px solid #cbd5e1;border-radius:10px;padding:12px;background:#f8fafc"><div style="font-weight:700;color:#1e3a8a;margin-bottom:10px">ME-0B authenticated authority path</div><div style="display:grid;grid-template-columns:1fr 1fr 1fr;gap:10px"><div style="border:1px solid #93c5fd;border-radius:8px;padding:10px;background:#eff6ff"><strong>Provider observation</strong><br><small>Codex Thread / Claude session<br>nullable, non-authoritative</small></div><div style="border:2px solid #2563eb;border-radius:8px;padding:10px;background:#dbeafe"><strong>Restricted Engineer MCP</strong><br><small>OAuth verification → authorizationId<br>sole authenticated carrier</small></div><div style="border:1px solid #86efac;border-radius:8px;padding:10px;background:#f0fdf4"><strong>repo-harness authority</strong><br><small>principal mapping → Binding CAS<br>→ Fleet Claim + actor receipt</small></div></div><div style="margin-top:10px;border:1px dashed #94a3b8;border-radius:8px;padding:8px;background:#fff"><small>Task execution authority remains Lease claim_id + generation. ClaimActorReceipt records provenance only; Provider identity never changes task identity.</small></div></div>

Real components:

- `src/cli/mcp/oauth.ts`: token/grant authority；coding grants already mint one UUID `authorizationId` and preserve it across refresh。
- `src/cli/mcp/transports/http.ts`: verified request auth → transport/session ownership；cross-authorization transport reuse returns not found。
- `src/cli/mcp/server.ts` and `src/cli/mcp/tools.ts`: profile/tool projection boundary；ME-0B must add a restricted profile rather than reuse coding shell authority。
- `src/cli/hook/run-identity.ts`: hook telemetry identity；payload/env-derived and explicitly non-authenticated。
- `src/core/engineers/profile-binding.ts` and `src/effects/engineers/binding-store.ts`: current Binding authority shared by linked worktrees。
- Existing Fleet acquire/Lease/WorkEnvelope effects remain the only task execution authority；ME-0B wraps them but does not replace their schemas。

Out of scope: Codex App Server lifecycle adapter、Claude Provider adapter、Worker Host、delegation、messaging、writer grant、Publication/Acceptance/Human Board。

## P2 · Three Read-only Canaries

### Canary A — Codex App Server / Desktop Thread

Result: **rejected as P0 principal carrier**。

The Desktop runtime can create/read/send/wait on persistent tasks, and Provider transport work can later observe a Thread ID. The current repo process does not receive that value through an authenticated request context. ME-0A's `provider_thread_id` is operator input, so equality with a command payload would only compare two caller-controlled values.

Thread ID remains useful for delivery/readback and audit after a Provider adapter exists, but it cannot fence mutations in ME-0B.

### Canary B — Claude local process / hooks

Result: **rejected as principal carrier**。

`resolveRunIdentity` accepts `payload.session_id`/`payload.run_id` before environment and persisted state. The focused canary proves caller-provided upstream values are adopted verbatim and can overwrite the same Session's stored run ID. This is correct telemetry behavior, but not authentication.

Therefore `CLAUDE_SESSION_ID`、`CODEX_SESSION_ID`、hook `session_id` and transcript paths are observations only。

### Canary C — MCP OAuth authorization

Result: **accepted as the carrier primitive, with a restricted profile requirement**。

Verified behavior:

- authorization code is bound to client, redirect URI, scope, expiry and single use;
- coding OAuth currently mints a UUID `authorizationId` server-side;
- refresh rotation preserves the same authorization identity;
- a second grant produces a distinct identity;
- HTTP MCP sessions and background process runtimes are keyed by authorization identity;
- one authorization cannot hijack another authorization's MCP session/workspace/process;
- authorization revision or revocation invalidates the token and closes its runtime.

Focused evidence command:

`bun test tests/cli/mcp-oauth.test.ts tests/cli/mcp-http.test.ts tests/run-identity.test.ts --timeout 60000`

Result: **32 pass, 0 fail, 236 assertions**。

The current `coding` profile is not an acceptable Engineer boundary because it deliberately exposes arbitrary shell access under the local OS user. ME-0B therefore reuses the proven OAuth carrier mechanics but introduces a no-shell/no-generic-write Engineer profile.

## P3 · Frozen Design Decision

### Selected carrier

`EngineerPrincipalV1.auth_subject = authorizationId` derived only from verified request auth. It never appears as a required command argument. A stable hash may be used for filenames/logs, but principal comparison uses the exact verified opaque value.

### Restricted Engineer MCP profile

- Profile name: `engineer`.
- Required OAuth scope: `repo-harness.engineer`.
- Allowed public mutation surface: ME-0B engineer principal/status/acquire operations only.
- Forbidden: coding shell、workspace coder、agent runner、generic `fleet_acquire`、arbitrary file write、operator bind/retire、Publication/Acceptance mutation。
- MCP `session_id` is transport lifecycle state, not principal identity。

### Principal mapping authority

One server-owned user-level store maps:

```yaml
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
```

The store lives under trusted repo-harness user state, uses mode `0600`, closed canonical JSON, atomic rename and explicit lock. It is not placed in the worktree and is not exposed through Engineer tools. Local operator enrollment selects an unbound OAuth authorization and the exact current Binding fences; bearer tokens are never CLI arguments or output。

Every engineer mutation performs two checks in order:

1. verified token → exact active principal mapping;
2. principal binding/generation/contract revision → exact current Git-common-dir Binding。

Token revocation fails closed before mapping cleanup. Binding rotation immediately fences the old mapping even if cleanup is delayed, because step 2 no longer matches current Binding。

### Claim actor receipt boundary

Engineer acquire calls the existing Fleet acquire effect and receives the exact Lease + WorkEnvelope. It then persists immutable `ClaimActorReceiptV1` bytes binding task revision、claim ID/generation、repository/authorization revision、worktree/branch/unit and both WorkEnvelope/Engineer contract digests。

If receipt persistence fails, compensation releases only the Claim created by this call using the exact claim ID and generation. It never releases a pre-existing or replaced Claim. A created worktree may remain as a typed recoverable residual; no best-effort deletion is added。

Generic Fleet acquire remains unchanged and does not require an actor receipt. Only the restricted Engineer route requires it。

## Scale and Failure Analysis

At 10× P0 scale, user-level mapping-store lock contention and linear lookup fail before cryptographic or Binding correctness. The expected canary scale is two Engineers and one active Claim each, so a single locked canonical store is sufficient. Do not introduce a database, background reconciler or credential broker until measured contention or multi-host deployment exists。

The first security failure would be accidentally exposing coding/open-shell tools on the Engineer profile. Tool inventory and end-to-end cross-authorization tests are therefore mandatory acceptance gates, not documentation checks。

## Approval Consequence

The two blocking unknowns in the Draft PRD are closed:

- per-binding authenticated carrier: restricted MCP OAuth `authorizationId`;
- principal mapping/revocation: server-owned user-level mapping plus token-first revocation and mandatory current-Binding revalidation。

`provider_thread_id` remains nullable audit detail and is never inferred. ME-0B may now move to Approved and implementation planning without claiming Codex/Claude Thread authentication。
