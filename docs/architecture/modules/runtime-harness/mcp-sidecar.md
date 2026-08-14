# runtime-harness/mcp-sidecar 架构文档
<!-- BEGIN ARCHCONTEXT:generated target="projection_target.entity.capability-runtime-harness-mcp-sidecar" sourceDigest="sha256:866de19faa98b32b0a17800367d168ff915e212eccb6831fa64a5908beaee79b" rendererVersion="archcontext.docs-renderer/v2" outputDigest="sha256:c99118a179f08af9688455ebce9cc306bcf4274974d71f4611bc06fa928b6d0f" verifiedAgainst="codex/contract-worktree-single-publication@6d62d3b2d0a635911037b66a3e3e8095fac74b28@2026-08-14T01:25:22+08:00" -->
> **狀態**:`active`
> **Verified against**:`codex/contract-worktree-single-publication@6d62d3b2d0a635911037b66a3e3e8095fac74b28`(2026-08-14)
> **Capability ID**:`capability.runtime-harness.mcp-sidecar`(kind `capability`)
> **Matched Prefixes**:`src/cli/mcp/**`、`src/cli/commands/mcp.ts`、`src/cli/chatgpt-browser/file-policy.ts`、`src/effects/repo-registry.ts`、`docs/repo-harness-chatgpt-mcp-setup.md`、`docs/reference-configs/chatgpt-coding-mcp.md`、`docs/researches/20260711-devspace-chatgpt-local-control.md`
> **Local Contracts**:`AGENTS.md`、`CLAUDE.md`
> **事實優先級**:倉庫當前狀態 > 本文檔機器區 > 本文檔人工區。機器區(引言、§1、§2)由 ArchContext 從架構模型與 Git 狀態投影生成,手改會在下次投影被覆蓋。

Provides the local MCP sidecar and its repository access policy boundary.

## 1. P1:能力架構地圖

### 1.1 架構圖

```mermaid
flowchart LR
  p1_capability_runtime_harness_mcp_sidecar_4e12aaf3["MCP Sidecar"]:::component
  p1_component_mcp_sidecar_primary_8f9b418c["MCP Tool Dispatcher"]:::component
  p1_capability_runtime_harness_mcp_sidecar_4e12aaf3 -->|"Dispatch an MCP tool call"| p1_component_mcp_sidecar_primary_8f9b418c
  classDef actor fill:#111827,color:#ffffff,stroke:#f9fafb,stroke-width:2px
  classDef component fill:#075985,color:#ffffff,stroke:#bae6fd,stroke-width:2px
  classDef datastore fill:#3f6212,color:#ffffff,stroke:#d9f99d,stroke-width:2px
  classDef external fill:#7c2d12,color:#ffffff,stroke:#fed7aa,stroke-width:2px
```

- Proof: `proven` (`sha256:b7f930f382d4eb7627cbcc6f0abad1c7022e4785f751fe3154f2a6f10677d197`).
- Semantic nodes: `2`; declared relations: `1`.

### 1.2 模組職責表

| 宣告入口 | 錨點 | 職責 |
| --- | --- | --- |
| `entrypoint.mcp-sidecar.primary` | `src/cli/mcp/server.ts#createRepoHarnessMcpServer` | `sink.mcp-sidecar.primary` → `src/cli/mcp/tools.ts#callMcpTool` |

### 1.3 規模信號

- 文件數:`31`
- 總行數:`13613`
- 匹配前綴:`src/cli/mcp/**`、`src/cli/commands/mcp.ts`、`src/cli/chatgpt-browser/file-policy.ts`、`src/effects/repo-registry.ts`、`docs/repo-harness-chatgpt-mcp-setup.md`、`docs/reference-configs/chatgpt-coding-mcp.md`、`docs/researches/20260711-devspace-chatgpt-local-control.md`
- 復算:`archctx docs plan --json`(掃描 `source.include` 減 `source.exclude`,跳過 `.git/` 與 `node_modules/`)

### 1.4 依賴邊界

出向關係:

- `calls` → `component.mcp-sidecar.primary` — Dispatch an MCP tool call

入向關係:

- 無。

## 2. P2:端到端數據流

> **Proof**: `proven` (`sha256:b7f930f382d4eb7627cbcc6f0abad1c7022e4785f751fe3154f2a6f10677d197`); selectors `1/1`.

```mermaid
%%{init: {"theme":"base","themeVariables":{"background":"#0d1117","actorBkg":"#312e81","actorBorder":"#c4b5fd","actorTextColor":"#ffffff","signalColor":"#e5e7eb","signalTextColor":"#e5e7eb","labelBoxBkgColor":"#4c1d95","labelBoxBorderColor":"#c4b5fd","labelTextColor":"#ffffff","noteBkgColor":"#78350f","noteBorderColor":"#fcd34d","noteTextColor":"#ffffff","sequenceNumberColor":"#ffffff"}}}%%
sequenceDiagram
  autonumber
  participant p2_capability_4262990f as MCP Sidecar
  participant p2_component_7b8d80ff as MCP Tool Dispatcher
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

1. **单一存储权威。** MCP 的配置与凭证只有 `mcpStorageDir()` 一个来源。#167 之所以选择「迁移时轮换凭证而非搬运凭证」，是因为 repo-scope 的 bearer token 与 passphrase 曾经躺在 git 工作树里，可能已进入备份或历史；搬运会把一个已经泄露风险未知的秘密延寿（`setup.ts:765` 的注释即此判断）。删除 repo-scope OAuth token store 强制恰好一次重新授权，是这条决策的可观测代价。
2. **授权真相在注册表，不在 MCP 配置。** `read_write` 授权与 `authorizationRevision` 都由 `registered-repos.json` 持有，写入走文件锁 + 原子 rename（`repo-registry.ts:183`、`:149`）。MCP 配置里的 `authorizationRevision` 只是一份必须与注册表相等的副本，不相等就整体拒绝服务。
3. **coding 面默认关闭且需要三重显式条件**：v3 配置里 `profile: coding` + `coding.enabled: true`、至少一个 `read_write` 注册 repo、OAuth 认证。任意一条随时失效都立即拆掉运行时。
4. **worktree-first。** `open_workspace` 默认建独立 worktree，`checkout` 必须显式指定。这让远端代理的失败落在一根可丢弃的分支上，而不是用户的工作树。
5. **grant 选工作区，不等于 shell 沙箱。** 授权页文案直说 `exec_command` 能触达本地用户能触达的一切（`http.ts:220`）。文档与 UI 都不得反向承诺「allowed roots 沙箱化了 Bash」。
6. **MCP 只投影状态，不解释状态。** `summarize_repo_harness_state` 复用与 CLI、Stop hook 相同的解析器；保留的 `current` 预览被两处字段显式标注为非权威。
7. **CodeGraph 是可选适配器。** 文件系统与 repo 注册表是内容与授权真相；索引失败只写 dead-letter，不能反过来阻断已成功的变更。

### 3.2 已知张力

- `mcp.local.json` 的 `repo` 字段仍被写入（`setup.ts:821`），但 runtime 的 repoRoot 只来自 `--repo` 或 cwd（`server.ts:180`）。它属于**已实现、保留字段**：doctor 与迁移输出会显示它，没有解析路径消费它。
- `McpLocalConfig.version` 仍接受 `1 | 2 | 3`（`auth.ts:128`），但 coding 面硬性要求 `version === 3`。v1/v2 只对非 coding profile 有效，属于窄口径的历史宽容，不是双权威。
- `capabilities.reader` 是显式标注的 deprecated 键（`auth.ts:30`），仅在 `workspaceReader` 未定义时参与判断。

### 3.3 10x 规模下先垮的点

按当前实现，压力顺序是：

1. **mutation 后的串行 CodeGraph 全仓刷新**（`coding-tools.ts` 的 refresh 链）。它被刻意串行化以避免 mutation/index 竞态；仓库变大或并发授权变多时，这是第一个吃掉端到端延迟的环节，而不是 MCP 路由。
2. **`general-repo-access.ts` 的进程内快照缓存**：`MAX_ENTRY_METADATA_CACHE_ENTRIES = 200_000`、`MAX_SNAPSHOT_CACHE_ENTRIES = 16`、`SNAPSHOT_TTL_MS = 5min`（`general-repo-access.ts:184`–`:186`）。多个大仓交替访问会让快照命中率塌到接近零，退化为反复全量 walk。
3. **`CodingAuthorizationRuntimeStore` 的容量与 session 上限共用一个数**：两者都取 `maxSessions`（默认 64，上限 256，`http.ts:567`–`:569`）。授权数与 transport 数的增长曲线并不相同，共用上限会让先到者挤掉后到者。
4. **每请求同步复核**：`http.ts:616` 的中间件在每个请求上重读 `mcp.local.json` 与 `registered-repos.json`。这是 fail-closed 的代价，也是 QPS 上升时第一个变成同步 IO 热点的地方。

单授权维度已有的硬上限——并发进程 4、单进程最长 30 分钟、输出环 4 MiB、完成后保留 15 分钟、runtime idle 复用 `sessionTtlMs`（默认 30 分钟）——限制的是不可信侧的并发面，不解决上面四点的吞吐问题。

## 4. 历史决策记录（append-only）

重写前的 `docs/architecture/modules/runtime-harness/mcp-sidecar.md` 全文为无日期的 P1/P2/P3 叙述段落，**不含任何带日期的章节**，因此本节当前没有需要逐字保留的条目。

后续带日期的决策请在此追加，只增不改。
