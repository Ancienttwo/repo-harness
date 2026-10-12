# runtime-harness/mcp-sidecar 架构文档
<!-- BEGIN ARCHCONTEXT:generated target="projection_target.entity.capability-runtime-harness-mcp-sidecar" sourceDigest="sha256:97fadaa9423fb168feaa7bf134fa0fe6042c57c57eea9868e60afafd88c773ed" rendererVersion="archcontext.docs-renderer/v5" outputDigest="sha256:2082ccb81e7f1f106c237eadd878eafde4e37988b80b1ec34265fb9de5339dd1" -->
> **狀態**:`active`
> **Capability ID**:`capability.runtime-harness.mcp-sidecar`(kind `capability`)
> **Matched Prefixes**:`src/cli/mcp/**`、`src/cli/commands/mcp.ts`、`src/cli/chatgpt-browser/file-policy.ts`、`src/effects/repo-registry.ts`、`docs/repo-harness-chatgpt-mcp-setup.md`、`docs/reference-configs/chatgpt-coding-mcp.md`、`docs/researches/20260711-devspace-chatgpt-local-control.md`、`src/core/security/**`
> **Local Contracts**:`AGENTS.md`、`CLAUDE.md`
> **事實優先級**:倉庫當前狀態 > 本文檔機器區 > 本文檔人工區。機器區(引言、§1、§2)由 ArchContext 從架構模型與源碼度量投影生成,手改會在下次投影被覆蓋。本文檔不記錄出處;本次投影所驗證的 commit 見 `docs/architecture/.projection-manifest.json`。

Provides the local MCP sidecar and its repository access policy boundary.

## 1. P1:能力架構地圖

### 1.1 架構圖

```mermaid
flowchart LR
  p1_capability_runtime_harness_engineer_messages_f10d1d17["Engineer Messages"]:::component
  p1_capability_runtime_harness_engineer_scheduling_022bd8e0["Engineer Scheduling"]:::component
  p1_capability_runtime_harness_mcp_sidecar_4e12aaf3["MCP Sidecar"]:::component
  p1_component_mcp_sidecar_coding_profile_c04b21a1["Coding Profile Runtime"]:::component
  p1_component_mcp_sidecar_host_setup_a05a1958["CLI and Host Setup"]:::component
  p1_component_mcp_sidecar_primary_8f9b418c["Server and Tool Dispatch"]:::component
  p1_component_mcp_sidecar_repo_policy_registry_40f1ea26["Config Policy and Repository Registry"]:::component
  p1_component_mcp_sidecar_transport_auth_2511e63e["Transport and Authorization"]:::component
  p1_component_mcp_sidecar_coding_profile_c04b21a1 -->|"Contain workspace paths against registered roots then redact and audit coding results"| p1_component_mcp_sidecar_repo_policy_registry_40f1ea26
  p1_capability_runtime_harness_mcp_sidecar_4e12aaf3 -->|"Expose authenticated Engineer message send#44; list and acknowledgement without granting generic Fleet or Provider authority"| p1_capability_runtime_harness_engineer_messages_f10d1d17
  p1_capability_runtime_harness_mcp_sidecar_4e12aaf3 -->|"Project and acquire exact revision-fenced Engineer offers for a verified OAuth principal"| p1_capability_runtime_harness_engineer_scheduling_022bd8e0
  p1_component_mcp_sidecar_host_setup_a05a1958 -->|"List and clean up managed coding workspaces"| p1_component_mcp_sidecar_coding_profile_c04b21a1
  p1_component_mcp_sidecar_host_setup_a05a1958 -->|"Build the expected tool inventory for the live doctor and run prepare-goal through the tool dispatcher"| p1_component_mcp_sidecar_primary_8f9b418c
  p1_component_mcp_sidecar_host_setup_a05a1958 -->|"Write the user-level config and credentials and set repository access grants"| p1_component_mcp_sidecar_repo_policy_registry_40f1ea26
  p1_component_mcp_sidecar_host_setup_a05a1958 -->|"Start the stdio or HTTP transport for mcp serve"| p1_component_mcp_sidecar_transport_auth_2511e63e
  p1_capability_runtime_harness_mcp_sidecar_4e12aaf3 -->|"Dispatch an MCP tool call"| p1_component_mcp_sidecar_primary_8f9b418c
  p1_component_mcp_sidecar_primary_8f9b418c -->|"Build and dispatch the coding tool block and its process runtime"| p1_component_mcp_sidecar_coding_profile_c04b21a1
  p1_component_mcp_sidecar_primary_8f9b418c -->|"Resolve repositories and paths under the profile policy then redact and audit each result"| p1_component_mcp_sidecar_repo_policy_registry_40f1ea26
  p1_component_mcp_sidecar_transport_auth_2511e63e -->|"Create one MCP server per authorized session and dispatch its tool calls"| p1_component_mcp_sidecar_primary_8f9b418c
  p1_component_mcp_sidecar_transport_auth_2511e63e -->|"Load the local config and credentials at startup and recheck the profile on each new session"| p1_component_mcp_sidecar_repo_policy_registry_40f1ea26
  classDef actor fill:#111827,color:#ffffff,stroke:#f9fafb,stroke-width:2px
  classDef component fill:#075985,color:#ffffff,stroke:#bae6fd,stroke-width:2px
  classDef datastore fill:#3f6212,color:#ffffff,stroke:#d9f99d,stroke-width:2px
  classDef external fill:#7c2d12,color:#ffffff,stroke:#fed7aa,stroke-width:2px
```

- Proof: `proven` (`sha256:50577a08a65896807e215f8afaf84e683c4977f6e730ec19827f717b2a943657`).
- Semantic nodes: `8`; declared relations: `12`.

### 1.2 模組職責表

| 宣告入口 | 錨點 | 職責 |
| --- | --- | --- |
| `entrypoint.mcp-sidecar.primary` | `src/cli/mcp/server.ts#createRepoHarnessMcpServer` | `sink.mcp-sidecar.primary` → `src/cli/mcp/tools.ts#callMcpTool` |
| `entrypoint.mcp-sidecar.engineer-tools` | `src/cli/mcp/engineer-tools.ts#callEngineerTool` | `sink.mcp-sidecar.engineer-principal` → `src/effects/engineers/principal.ts#resolveEngineerPrincipal`、`sink.mcp-sidecar.engineer-offers` → `src/effects/engineers/scheduling.ts#collectEngineerOffers` |
| `entrypoint.mcp-sidecar.engineer-tools` | `src/cli/mcp/engineer-tools.ts#messageSendAsEngineer` | `sink.mcp-sidecar.engineer-messages` → `src/effects/engineers/module-inbox.ts#sendModuleMessage` |
| `entrypoint.mcp-sidecar.engineer-tools` | `src/cli/mcp/engineer-tools.ts#acquireAsEngineer` | `sink.mcp-sidecar.engineer-acquire` → `src/effects/engineers/scheduling-acquire-next.ts#acquireSelectedEngineerTask` |
| `entrypoint.mcp-sidecar.engineer-tools` | `src/cli/mcp/engineer-tools.ts#callEngineerTool` | `sink.mcp-sidecar.agent-runtime-effect-status` → `src/effects/engineers/agent-runtime-effect-store.ts#observeAgentRuntimeEffectStatus`、`sink.mcp-sidecar.interface-change` → `src/effects/engineers/interface-change-store.ts#transitionInterfaceChangeRequest` |
| `entrypoint.mcp-sidecar.collaboration-tools` | `src/cli/mcp/collaboration-tools.ts#callCollaborationTool` | `sink.mcp-sidecar.collaboration-exchange` → `src/effects/collaboration/agent-surface.ts#collaborationExchangeView`、`sink.mcp-sidecar.collaboration-signal-post` → `src/effects/collaboration/agent-surface.ts#collaborationSignalPost`、`sink.mcp-sidecar.collaboration-handoff-adopt` → `src/effects/collaboration/agent-surface.ts#collaborationHandoffAdopt` |

組件入口:

| 組件 | 宣告入口 | 錨點 | 職責 |
| --- | --- | --- | --- |
| `component.mcp-sidecar.host-setup` | `entrypoint.mcp-sidecar.cli` | `src/cli/commands/mcp.ts#buildMcpCommand` | `sink.mcp-sidecar.http-start` → `src/cli/mcp/transports/http.ts#startMcpHttp` |
| `component.mcp-sidecar.primary` | `entrypoint.mcp-sidecar.tool-dispatch` | `src/cli/mcp/tools.ts#callMcpTool` | `sink.mcp-sidecar.path-policy` → `src/cli/mcp/paths.ts#resolveMcpPath` |
| `component.mcp-sidecar.transport-auth` | `entrypoint.mcp-sidecar.http-transport` | `src/cli/mcp/transports/http.ts#startMcpHttp` | `sink.mcp-sidecar.startup-config` → `src/cli/mcp/auth.ts#loadMcpLocalConfig` |
| `component.mcp-sidecar.transport-auth` | `entrypoint.mcp-sidecar.http-transport` | `src/cli/mcp/transports/http.ts#handleMcpPost` | `sink.mcp-sidecar.session-server` → `src/cli/mcp/server.ts#createRepoHarnessMcpServer`、`sink.mcp-sidecar.request-config` → `src/cli/mcp/auth.ts#loadMcpLocalConfig` |

### 1.3 規模信號

- 規模量級:`20–50` 個文件 / `10k–20k` 行
- 匹配前綴:`src/cli/mcp/**`、`src/cli/commands/mcp.ts`、`src/cli/chatgpt-browser/file-policy.ts`、`src/effects/repo-registry.ts`、`docs/repo-harness-chatgpt-mcp-setup.md`、`docs/reference-configs/chatgpt-coding-mcp.md`、`docs/researches/20260711-devspace-chatgpt-local-control.md`、`src/core/security/**`
- 排除前綴:`src/cli/mcp/codegraph-adapter.ts`、`src/cli/mcp/general-repo-access.ts`、`src/cli/mcp/general-repo-access/**`
- 推導:掃描 `source.include` 減 `source.exclude`,跳過 `.git/` 與 `node_modules/`,再按 1–2–5 階梯分桶。精確計數不入本文檔:量級足以回答「這個能力有多大」,而逐行計數會讓覆蓋範圍內任何一次源碼改動都改寫本文檔。

### 1.4 依賴邊界

出向關係:

- `calls` → `capability.runtime-harness.agent-runtime-effects` — Expose read-only runtime capability and current-effect projections to the authenticated Engineer without Host mutation authority
- `calls` → `capability.runtime-harness.collaboration` — Serve the bounded Engineer collaboration tool set from the shared agent surface, deriving the author from the authenticated authorization and taking no actor, destination or recorded time from a caller
- `calls` → `capability.runtime-harness.engineer-messages` — Expose authenticated Engineer message send, list and acknowledgement without granting generic Fleet or Provider authority
- `calls` → `capability.runtime-harness.engineer-bindings` — Resolve a verified OAuth authorization to the current Engineer Binding before acquiring a Fleet Claim
- `calls` → `capability.runtime-harness.engineer-scheduling` — Project and acquire exact revision-fenced Engineer offers for a verified OAuth principal
- `calls` → `capability.runtime-harness.interface-change` — Expose only authenticated Engineer propose, submit, cancel, materialize and implemented mutations through the server-derived OAuth principal
- `calls` → `component.mcp-sidecar.primary` — Dispatch an MCP tool call

入向關係:

- `calls` ← `capability.runtime-harness.agent-runtime-effects` — Read the strict repo registry and the authorization revision for the wake fence
- `calls` ← `capability.runtime-harness.external-source-intake` — Read the strict repo registry snapshot for repository identity and authorization
- `calls` ← `component.global-runtime-reconciliation.archctx-closure` — Resolve registered repositories for the model reader
- `calls` ← `component.global-runtime-reconciliation.cli-root` — Register the mcp command
- `reads` ← `component.operator.primary` — Resolve a registered repository root from the strict repo-harness registry snapshot
- `calls` ← `capability.runtime-harness.refactor-program` — Resolve the canonical repository path through the repo registry

組件出向關係:

- `component.mcp-sidecar.coding-profile`:
  - `calls` → `capability.verification.codegraph-readiness` — Refresh the CodeGraph index after coding mutations
  - `calls` → `capability.workflow-engine.execution-primitives` — Use the configured Git binary for coding workspaces
  - `calls` → `component.mcp-sidecar.repo-policy-registry` — Contain workspace paths against registered roots then redact and audit coding results
  - `calls` → `capability.runtime-harness.task-agent-host` — Clean up task worktrees for coding workspaces
  - `calls` → `capability.workflow-engine.workflow-state` — Clean up exact worktrees under the system worktree root
- `component.mcp-sidecar.host-setup`:
  - `calls` → `capability.runtime-mcp.chatgpt-browser` — Read the canonical ChatGPT bridge reference from the packaged skill source
  - `calls` → `component.mcp-sidecar.coding-profile` — List and clean up managed coding workspaces
  - `calls` → `capability.workflow-engine.execution-primitives` — Hold the MCP setup ownership lock
  - `calls` → `capability.runtime-harness.hook-adapters` — Reuse installer configuration ownership receipts and the runtime host lock
  - `calls` → `component.mcp-sidecar.primary` — Build the expected tool inventory for the live doctor and run prepare-goal through the tool dispatcher
  - `writes` → `component.mcp-sidecar.repo-policy-registry` — Write the user-level config and credentials and set repository access grants
  - `calls` → `component.mcp-sidecar.transport-auth` — Start the stdio or HTTP transport for mcp serve
- `component.mcp-sidecar.primary`:
  - `calls` → `capability.runtime-mcp.chatgpt-browser` — Run the opt-in browser consult tools through the ChatGPT browser engine
  - `calls` → `capability.verification.codegraph-readiness` — Construct the CodeGraph index adapter with repo-local binaries refused
  - `calls` → `component.mcp-sidecar.coding-profile` — Build and dispatch the coding tool block and its process runtime
  - `calls` → `capability.workflow-engine.execution-primitives` — Read the worktree topology for the PM server scope
  - `calls` → `capability.runtime-mcp.general-repo-access` — Dispatch the general repository reader and writer tools
  - `calls` → `capability.runtime-harness.pm-dispatch` — Serve the PM MCP binding over the PM host protocol
  - `calls` → `capability.organization.publication` — Reopen and take over publications and read merge readiness
  - `calls` → `component.mcp-sidecar.repo-policy-registry` — Resolve repositories and paths under the profile policy then redact and audit each result
  - `calls` → `capability.runtime-harness.task-agent-host` — Start task agents and send task requests through Herdr
  - `calls` → `capability.organization.task-fleet` — Acquire fleet tasks and handle task steers from the MCP tools
  - `calls` → `capability.runtime-harness.work-demand` — Propose and transition work demands from the engineer MCP tools
  - `reads` → `capability.workflow-engine.workflow-state` — Resolve effective state for the state MCP tools
- `component.mcp-sidecar.repo-policy-registry`:
  - `calls` → `capability.workflow-engine.execution-primitives` — Run Git for repository roots and lock guarded writes
- `component.mcp-sidecar.transport-auth`:
  - `calls` → `component.mcp-sidecar.primary` — Create one MCP server per authorized session and dispatch its tool calls
  - `reads` → `component.mcp-sidecar.repo-policy-registry` — Load the local config and credentials at startup and recheck the profile on each new session

### 1.5 組件結構

| 組件 | 名稱 | 規模量級 | 宣告入口 |
| --- | --- | --- | --- |
| `component.mcp-sidecar.coding-profile` | Coding Profile Runtime | `2–5` 個文件 / `2000–5000` 行 | 未宣告 |
| `component.mcp-sidecar.host-setup` | CLI and Host Setup | `5–10` 個文件 / `2000–5000` 行 | `entrypoint.mcp-sidecar.cli` |
| `component.mcp-sidecar.primary` | Server and Tool Dispatch | `5–10` 個文件 / `2000–5000` 行 | `entrypoint.mcp-sidecar.tool-dispatch` |
| `component.mcp-sidecar.repo-policy-registry` | Config Policy and Repository Registry | `10–20` 個文件 / `2000–5000` 行 | 未宣告 |
| `component.mcp-sidecar.transport-auth` | Transport and Authorization | `2–5` 個文件 / `1000–2000` 行 | `entrypoint.mcp-sidecar.http-transport` |

## 2. P2:端到端數據流

> **Proof**: `proven` (`sha256:50577a08a65896807e215f8afaf84e683c4977f6e730ec19827f717b2a943657`); selectors `8/8`.

```mermaid
%%{init: {"theme":"base","themeVariables":{"background":"#0d1117","actorBkg":"#312e81","actorBorder":"#c4b5fd","actorTextColor":"#ffffff","signalColor":"#e5e7eb","signalTextColor":"#e5e7eb","labelBoxBkgColor":"#4c1d95","labelBoxBorderColor":"#c4b5fd","labelTextColor":"#ffffff","noteBkgColor":"#78350f","noteBorderColor":"#fcd34d","noteTextColor":"#ffffff","sequenceNumberColor":"#ffffff"}}}%%
sequenceDiagram
  autonumber
  participant p2_engineer_mcp_97bc42c0 as MCP Sidecar
  participant p2_scheduling_authority_0fce7315 as Engineer Scheduling
  p2_engineer_mcp_97bc42c0->>p2_scheduling_authority_0fce7315: Acquire one exact offer from a trusted observation before delegated Fleet acquisition
  alt Exact WorkEnvelope and ClaimActorReceipt are returned
  p2_engineer_mcp_97bc42c0->>p2_scheduling_authority_0fce7315: Return the live-validated envelope and immutable receipt
    Note over p2_engineer_mcp_97bc42c0: Return authenticated acquire result
  else Authorization#44; graph#44; dependency#44; concurrency#44; Binding#44; offer#44; receipt#44; or compensation validation fails
  p2_engineer_mcp_97bc42c0->>p2_scheduling_authority_0fce7315: Return typed refusal and never release a foreign Claim
    Note over p2_engineer_mcp_97bc42c0: Return typed fail-closed error
  end
```

```mermaid
%%{init: {"theme":"base","themeVariables":{"background":"#0d1117","actorBkg":"#312e81","actorBorder":"#c4b5fd","actorTextColor":"#ffffff","signalColor":"#e5e7eb","signalTextColor":"#e5e7eb","labelBoxBkgColor":"#4c1d95","labelBoxBorderColor":"#c4b5fd","labelTextColor":"#ffffff","noteBkgColor":"#78350f","noteBorderColor":"#fcd34d","noteTextColor":"#ffffff","sequenceNumberColor":"#ffffff"}}}%%
sequenceDiagram
  autonumber
  participant p2_engineer_mcp_97bc42c0 as MCP Sidecar
  participant p2_message_authority_43d726e6 as Engineer Messages
  p2_engineer_mcp_97bc42c0->>p2_message_authority_43d726e6: Derive sender or recipient from the verified Engineer principal and revalidate message fences
  alt Return canonical message or acknowledgement state
  p2_engineer_mcp_97bc42c0->>p2_message_authority_43d726e6: Return the persisted event and receipt projection
    Note over p2_engineer_mcp_97bc42c0: Return authenticated message result
  else Principal#44; Binding#44; resource or transition validation fails closed
  p2_engineer_mcp_97bc42c0->>p2_message_authority_43d726e6: Return a typed refusal without acknowledging or mutating another authority
    Note over p2_engineer_mcp_97bc42c0: Return typed refusal
  end
```

```mermaid
%%{init: {"theme":"base","themeVariables":{"background":"#0d1117","actorBkg":"#312e81","actorBorder":"#c4b5fd","actorTextColor":"#ffffff","signalColor":"#e5e7eb","signalTextColor":"#e5e7eb","labelBoxBkgColor":"#4c1d95","labelBoxBorderColor":"#c4b5fd","labelTextColor":"#ffffff","noteBkgColor":"#78350f","noteBorderColor":"#fcd34d","noteTextColor":"#ffffff","sequenceNumberColor":"#ffffff"}}}%%
sequenceDiagram
  autonumber
  participant p2_cli_a1122746 as CLI and Host Setup
  participant p2_transport_b44b7535 as Transport and Authorization
  participant p2_dispatch_8a0cbd63 as Server and Tool Dispatch
  participant p2_policy_17ad92e6 as Config Policy and Repository Registry
  p2_cli_a1122746->>p2_transport_b44b7535: mcp serve starts the HTTP transport
  p2_transport_b44b7535->>p2_policy_17ad92e6: Load the user-level config and credentials and fix the startup profile
  p2_transport_b44b7535->>p2_dispatch_8a0cbd63: Create one MCP server for the new authorized session
  alt Tool call runs under the profile path policy
  p2_dispatch_8a0cbd63->>p2_policy_17ad92e6: Resolve each tool path under the profile policy before any read or write
    Note over p2_dispatch_8a0cbd63: Return the redacted tool result
  else Local profile changed after startup
  p2_transport_b44b7535->>p2_policy_17ad92e6: Reload the config for a new session and refuse a profile that differs from the startup profile
    Note over p2_transport_b44b7535: Return 503 PROFILE_CHANGED without creating a session
  end
```

```mermaid
%%{init: {"theme":"base","themeVariables":{"background":"#0d1117","actorBkg":"#312e81","actorBorder":"#c4b5fd","actorTextColor":"#ffffff","signalColor":"#e5e7eb","signalTextColor":"#e5e7eb","labelBoxBkgColor":"#4c1d95","labelBoxBorderColor":"#c4b5fd","labelTextColor":"#ffffff","noteBkgColor":"#78350f","noteBorderColor":"#fcd34d","noteTextColor":"#ffffff","sequenceNumberColor":"#ffffff"}}}%%
sequenceDiagram
  autonumber
  participant p2_capability_4262990f as MCP Sidecar
  participant p2_component_7b8d80ff as Server and Tool Dispatch
  p2_capability_4262990f->>p2_component_7b8d80ff: Dispatch MCP Tool Dispatcher
  alt Dispatch an MCP tool call completes
  p2_capability_4262990f->>p2_component_7b8d80ff: Invoke MCP Tool Dispatcher
    Note over p2_capability_4262990f: Return success receipt
  else Dispatch an MCP tool call is rejected or fails
  p2_capability_4262990f->>p2_component_7b8d80ff: Propagate MCP Tool Dispatcher failure
    Note over p2_capability_4262990f: Return typed failure
  end
```
<!-- END ARCHCONTEXT:generated target="projection_target.entity.capability-runtime-harness-mcp-sidecar" -->
## 3. P3：设计决策与不变量

### 3.1 必须保持的不变量

1. **单一存储权威。** MCP 配置与凭证只存在 `mcpStorageDir()` 下（`src/cli/mcp/auth.ts:66`）。PR #167 把 repo 级配置迁到用户级。迁移轮换凭证，不搬运凭证。原因写在 `src/cli/mcp/setup.ts:820-830` 的注释里：repo 级 bearer token 和 passphrase 曾在 Git 工作树内，可能留在备份或历史中。迁移删除 repo 级 OAuth token store。用户因此必须重新授权一次。
2. **授权真相在注册表。** `read_write` 授权和 `authorizationRevision` 存在 `registered-repos.json`。写入先写临时文件，再 rename（`src/effects/repo-registry.ts:206-210`）。写入持有一把带 owner 记录的互斥锁，死锁持有者可以回收（`repo-registry.ts:28`、`:237`）。MCP 配置里的 `authorizationRevision` 只是副本。授权型 profile 的 HTTP 中间件在每个请求上比较两者，不相等就拒绝（`src/cli/mcp/transports/http.ts:746-760`）。
3. **每个 profile 默认关闭，各自闭合。** coding profile 需要 v3 配置、`coding.enabled: true`、至少一个 `read_write` 注册仓库和 OAuth。Engineer profile 需要独立的 `repo-harness.engineer` scope 和固定工具清单。只有 coding profile 建立 shell runtime（`src/cli/mcp/server.ts:174`）。
4. **HTTP session 绑定启动时的 profile。** 新 session 初始化时重读配置。profile 与启动时不同，服务返回 503 `PROFILE_CHANGED`，并且不占用 session 名额（`transports/http.ts:484-499`，PR #210）。服务不做热升级，也不静默降级。
5. **HTTP session 绑定一个已验证的 authorization ID。** 另一个 authorization 复用该 session 会失败（见 §4 的 2026-08-25 条目）。payload 里的 Engineer、Binding 和 thread 字段只做 fence 或观测。它们不选择 principal。
6. **worktree 优先。** `open_workspace` 默认新建独立 worktree，`checkout` 模式必须显式指定（`src/cli/mcp/coding-tools.ts:242-247`）。远端代理的失败只影响一个可丢弃的分支。
7. **仓库授权选择工作区，不提供 shell 沙箱。** 授权页文案写明：shell 命令能访问本地 OS 用户能访问的一切（`transports/http.ts:222`）。文档和 UI 不得声称 allowed roots 限制了 shell。
8. **MCP 只投影状态，不解释状态。** `summarize_repo_harness_state`（`src/cli/mcp/state-tools.ts:9`）使用与 CLI、Stop hook 相同的解析器。`current` 预览字段标注为非权威。
9. **CodeGraph 是可选适配器。** 文件系统与注册表是内容和授权的真相。索引刷新失败只返回 `dead_letter` 信息（`coding-tools.ts:174`），不回滚已成功的变更。coding runtime 构造适配器时传 `allowRepoLocalBin: false`（`server.ts:138-141`）。被索引的仓库因此不能提供 codegraph 可执行文件。

### 3.2 关键权衡

| 决策 | 权衡 |
| --- | --- |
| 每个请求同步重读 `mcp.local.json` 和 `registered-repos.json`（`transports/http.ts:746-760`） | 授权撤销和 revision 变化立即生效。代价是每个请求都做同步文件 IO。QPS 上升时这里先成为热点。 |
| session 名额满时回收最久未用的空闲 session（PR #175） | ChatGPT Connector 重连时不发 DELETE。只按 TTL 清理会占满 `max_sessions`，之后所有新 initialize 都失败。代价是空闲但有效的客户端可能被回收，必须重新初始化。 |
| coding runtime 与 session 共用 `maxSessions`（`transports/http.ts:671-673`；默认 64，最大 256） | 一个配置项控制两种资源。代价是授权数与 transport 数的增长曲线不同，先到者可能占满后到者的名额。 |
| mutation 后串行刷新 CodeGraph 索引（`coding-tools.ts:157-158`） | 变更与索引不竞争。代价是仓库变大后端到端延迟增加。 |
| 每个 authorization 的进程上限：并发 4、单进程最长 30 分钟、输出环 4 MiB、完成后保留 15 分钟（`process-sessions.ts:6-9`） | 不可信一侧的并发面有硬上限。代价是这些上限不解决吞吐问题（见 §3.4）。 |

### 3.3 组件拆分（2026-10-11）

数据来源：`archctx refactor scan --json`（archctx 0.7.0）和一次相对 import 扫描。组件 footprint 写在各 component 节点的 `source.include` 里。

| 组件 | footprint | 文件 / 行 | 职责 |
| --- | --- | --- | --- |
| `component.mcp-sidecar.primary`（Server and Tool Dispatch） | `server.ts`、`tools.ts`、`state-tools.ts`、`engineer-tools.ts`、`collaboration-tools.ts`、`fleet-tools.ts`、`pm-server.ts`、`instructions.ts`、`version.ts` | 9 / 3905 | 按 profile 建工具清单，把调用分派到各工具块，挂载 PM binding |
| `component.mcp-sidecar.transport-auth` | `transports/**`、`oauth.ts`、`session-store.ts` | 4 / 1648 | stdio 与 HTTP transport、OAuth、session 准入与回收 |
| `component.mcp-sidecar.repo-policy-registry` | `auth.ts`、`types.ts`、`policy.ts`、`paths.ts`、`repo.ts`、`redaction.ts`、`guarded-write.ts`、`workspaces.ts`、`audit.ts`、`src/effects/repo-registry.ts`、`src/core/security/**` | 11 / 2151 | 用户级配置与凭证、路径策略、脱敏、审计、注册仓库授权 |
| `component.mcp-sidecar.coding-profile` | `coding-tools.ts`、`coding-workspaces.ts`、`process-sessions.ts` | 3 / 2143 | 受管 worktree、文件编辑、受限 shell 进程 |
| `component.mcp-sidecar.host-setup` | `src/cli/commands/mcp.ts`、`setup.ts`、`setup-ownership.ts`、`uninstall.ts`、`docs/repo-harness-chatgpt-mcp-setup.md` | 5 / 2452 | mcp CLI、ChatGPT 与 Codex 的 host 设置、doctor、受管卸载 |

依赖方向：host-setup 调用另外四个组件。transport-auth 调用 primary 和 repo-policy-registry。primary 调用 repo-policy-registry 和 coding-profile。coding-profile 调用 repo-policy-registry。组件之间没有反向边。

与归属提议 §5 的三处差异，原因都来自 import 扫描：

- `auth.ts` 放进 repo-policy-registry。它是配置与凭证存储。`server.ts`、`tools.ts`、`pm-server.ts`、`setup.ts`、`uninstall.ts` 和两个 transport 都读它。放进 transport-auth 会形成 primary 与 transport-auth 的环。
- `types.ts` 和 `audit.ts` 放进 repo-policy-registry。`types.ts` 只定义 `McpPolicy`、`McpPathDecision`、`McpAuditEntry` 等策略类型。`audit.ts` 只被工具处理器调用，transport 不调用它。
- `src/cli/commands/mcp.ts` 放进 host-setup。这个命令启动 transport。放进 primary 会形成 primary → transport-auth → primary 的环。

以下文件留在 capability include 上，不进任何组件：`reader-tools.ts`（general-repo-access 的声明入口）、`general-repo-access.ts` 与 `general-repo-access/**`（与 general-repo-access 重复归属）、`codegraph-adapter.ts`（与 codegraph-readiness 重复归属）、`src/cli/chatgpt-browser/file-policy.ts`、`docs/reference-configs/chatgpt-coding-mcp.md`（与 contract-assets 重复归属）和一份 research 文档。

组件到其他 capability 的关系不出现在 §1.4（渲染器缺口），这里列出：

- primary → chatgpt-browser：`tools.ts` 在 `--enable-chatgpt-browser` 时暴露 5 个 browser 工具（`tools.ts:1128-1159`）。
- primary → general-repo-access：`tools.ts` 分派 reader 与 writer 工具。
- primary → codegraph-readiness、coding-profile → codegraph-readiness：构造并刷新 CodeGraph 适配器。
- primary → pm-dispatch：`pm-server.ts` 使用 PM host 协议。
- host-setup → hook-adapters：复用 installer 的配置归属回执和 runtime host 锁。
- host-setup → chatgpt-browser：`mcp install-skill` 读取打包的 bridge 参考（`setup.ts:69-80`）。

### 3.4 10x 规模下先垮的点

按当前实现，压力顺序是：

1. **mutation 后的串行 CodeGraph 全仓刷新。** 仓库变大或并发授权变多时，这一步先吃掉端到端延迟。MCP 路由不是瓶颈。
2. **`general-repo-access.ts` 的进程内快照缓存。** 上限是 `SNAPSHOT_TTL_MS = 5min`、`MAX_SNAPSHOT_CACHE_ENTRIES = 16`、`MAX_ENTRY_METADATA_CACHE_ENTRIES = 200_000`（`general-repo-access.ts:184-186`）。多个大仓交替访问时，快照命中率接近零，每次都全量 walk。
3. **session 与 coding runtime 共用一个上限**（见 §3.2）。
4. **每请求同步复核**（见 §3.2）。

### 3.5 已知张力

- 配置的 `repo` 字段仍被写入（`setup.ts:735`、`:879`）。runtime 的 repoRoot 只来自 `--repo` 或 cwd（`server.ts:185`）。这个字段已实现但保留不用：doctor 和迁移输出显示它，没有解析路径消费它。
- `McpLocalConfig.version` 仍接受 `1 | 2 | 3`（`auth.ts:7`）。coding 面要求 `version === 3`。v1 和 v2 只对非 coding profile 有效。
- `capabilities.reader` 是标注为 deprecated 的键（`auth.ts:30-31`）。只有 `workspaceReader` 未定义时它才参与判断。

### 3.6 开放问题

- `coding-tools.ts:79` 的 `DEFAULT_CODEGRAPH_ADAPTER` 用默认参数构造，`allowRepoLocalBin` 默认为 true（`codegraph-adapter.ts:224`）。它只在 `ctx.codeGraphAdapter` 未设置时使用（`coding-tools.ts:157`）。是否有生产路径走到这个默认值？没有验证。如果有，§3.1 第 9 条在这条路径上不成立。
- `src/core/security/secret-patterns.ts` 由 MCP 脱敏和 operator 的 architecture 读取共用（`src/effects/operator/architecture.ts:5`）。它归入本 capability 的置信度是 MEDIUM（归属提议 §1b）。它是否应该成为独立的共享安全模块？没有记录。

## 4. 历史决策记录（append-only）

重写前的 `docs/architecture/modules/runtime-harness/mcp-sidecar.md` 全文为无日期的 P1/P2/P3 叙述段落，**不含任何带日期的章节**，因此本节当前没有需要逐字保留的条目。

后续带日期的决策请在此追加，只增不改。

### 2026-08-25 ME-0B restricted Engineer carrier

- Engineer 与 coding 复用 OAuth 的授权生命周期机制，但使用不同 scope、不同 exact tool inventory 与不同 runtime policy；coding grant 不蕴含 Engineer authority，Engineer grant 也不创建 coding runtime。
- HTTP transport 将 MCP session 绑定到 verified `authorizationId`。payload 里的 Engineer/Binding/session/thread 字段只能作为 fence 或 observation，不能选择 principal；另一 authorization 复用 session 会得到 404。
- Engineer profile 必须在 generic tool builders 之前按 exact profile 分派，避免 broad capability flag 将 reader/writer/shell/Fleet mutation 扩散进 restricted surface。

### 2026-10-11 组件拆分

- 本 capability 拆成五个组件：primary（Server and Tool Dispatch）、transport-auth、repo-policy-registry、coding-profile、host-setup。拆分依据是相对 import 扫描。组件之间只有单向依赖（见 §3.3）。
- `src/core/security/**` 原本没有归属，现在加入本 capability 的 include。capability include 没有删除任何条目。
- 新增 flow `flow.mcp-sidecar.http-session`。它证明 CLI → HTTP transport → 配置读取 → session server → 路径策略这条路径，并证明配置变更后的 503 拒绝路径。

## Optimization Backlog

- 在 arch-context#296 和 include 收窄之后：把 `src/cli/mcp/reader-tools.ts` 和 `src/cli/mcp/general-repo-access*` 移给 general-repo-access，把 `src/cli/mcp/codegraph-adapter.ts` 移给 codegraph-readiness，把 `src/cli/chatgpt-browser/file-policy.ts` 移给 chatgpt-browser，把 `docs/reference-configs/chatgpt-coding-mcp.md` 交给 contract-assets（归属提议 §2）。
- 重构证据：`src/cli/chatgpt-browser/file-policy.ts` 只被 chatgpt-browser 的三个文件调用，但它 import 本 capability 的 `paths.ts` 和 `types.ts`。文件移走后，chatgpt-browser → mcp-sidecar 会变成一条反向边。路径包含检查可以抽成共享 helper。没有声明为 intended relation。
- primary 组件可展开：`tools.ts` 1558 行。它可以按工具块（state、Engineer、collaboration、Fleet、coding、reader、browser）继续拆。
- 集成步骤添加了到新 capability 的关系：primary → task-fleet、publication、task-agent-host、work-demand、workflow-state（`reads`）与 execution-primitives；coding-profile → workflow-state、execution-primitives 与 task-agent-host；repo-policy-registry 与 host-setup → execution-primitives。没有声明 transport-auth → pm-dispatch：`src/cli/mcp/transports/http.ts:36` 只导入 `PmError` 类。
- **repo registry 造成 capability 级的环。** task-fleet、pm-dispatch 与 work-demand 导入 `src/effects/repo-registry.ts`。集成把 `relation.task-fleet.repo-registry` 与 `relation.pm-dispatch.repo-registry` 的目标改为 `component.mcp-sidecar.repo-policy-registry`。节点级因此没有环。capability 级仍然双向。候选：把 repo registry 移出 mcp-sidecar。
