# runtime-harness/external-source-intake 架构文档

<!-- BEGIN ARCHCONTEXT:generated target="projection_target.entity.capability-runtime-harness-external-source-intake" sourceDigest="sha256:a3f970d6083ae852c35ffffd1361a774f2a3c32ff21f2f3611a7b3ed831d05e0" rendererVersion="archcontext.docs-renderer/v5" outputDigest="sha256:cfd572a69a9775ce83dbea249ab6e25119add3467250edcffaf13b3d62bca7ca" -->
> **狀態**:`active`
> **Capability ID**:`capability.runtime-harness.external-source-intake`(kind `capability`)
> **Matched Prefixes**:`src/core/external-sources/**`、`src/effects/external-sources/**`、`src/cli/commands/external-source.ts`
> **Local Contracts**:`AGENTS.md`、`CLAUDE.md`
> **事實優先級**:倉庫當前狀態 > 本文檔機器區 > 本文檔人工區。機器區(引言、§1、§2)由 ArchContext 從架構模型與源碼度量投影生成,手改會在下次投影被覆蓋。本文檔不記錄出處;本次投影所驗證的 commit 見 `docs/architecture/.projection-manifest.json`。

Owns immutable external Issue evidence and authorization-fenced provenance bindings to exact canonical tasks without scheduler authority.

## 1. P1:能力架構地圖

### 1.1 架構圖

```mermaid
flowchart LR
  p1_capability_runtime_harness_external_source_intake_ef285aa9["External Source Intake"]:::component
  p1_component_external_source_intake_immutable_evidence_2a2cb77f["Immutable External Evidence Store"]:::component
  p1_capability_runtime_harness_external_source_intake_ef285aa9 -->|"Persist provider-neutral immutable observations and typed refresh receipts before deriving a read-only projection"| p1_component_external_source_intake_immutable_evidence_2a2cb77f
  classDef actor fill:#111827,color:#ffffff,stroke:#f9fafb,stroke-width:2px
  classDef component fill:#075985,color:#ffffff,stroke:#bae6fd,stroke-width:2px
  classDef datastore fill:#3f6212,color:#ffffff,stroke:#d9f99d,stroke-width:2px
  classDef external fill:#7c2d12,color:#ffffff,stroke:#fed7aa,stroke-width:2px
```

- Proof: `proven` (`sha256:6a93c93fd67f784afff33aee1fc2053c71546701f695987b89f4a73bc7a6a90b`).
- Semantic nodes: `2`; declared relations: `1`.

### 1.2 模組職責表

| 宣告入口 | 錨點 | 職責 |
| --- | --- | --- |
| `entrypoint.external-source-intake.refresh` | `src/effects/external-sources/refresh.ts#refreshExternalSource` | `sink.external-source-intake.immutable-observation-store` → `src/effects/external-sources/store.ts#writeProviderIssueObservation`、`sink.external-source-intake.immutable-attempt-receipt` → `src/effects/external-sources/store.ts#writeExternalSourceRefreshReceipt` |
| `entrypoint.external-source-intake.list` | `src/effects/external-sources/refresh.ts#listExternalSourceProjection` | `sink.external-source-intake.read-only-projection` → `src/core/external-sources/projection.ts#buildExternalSourceProjection` |
| `entrypoint.external-source-intake.bind` | `src/effects/external-sources/binding.ts#bindExternalSource` | `sink.external-source-intake.binding-receipt` → `src/effects/external-sources/store.ts#writeExternalSourceBindingReceipt` |
| `entrypoint.external-source-intake.bind` | `src/effects/external-sources/binding.ts#listExternalSourceBindings` | `sink.external-source-intake.binding-projection` → `src/core/external-sources/binding.ts#ExternalSourceBindingProjectionV1` |

### 1.3 規模信號

- 規模量級:`5–10` 個文件 / `1000–2000` 行
- 匹配前綴:`src/core/external-sources/**`、`src/effects/external-sources/**`、`src/cli/commands/external-source.ts`
- 推導:掃描 `source.include` 減 `source.exclude`,跳過 `.git/` 與 `node_modules/`,再按 1–2–5 階梯分桶。精確計數不入本文檔:量級足以回答「這個能力有多大」,而逐行計數會讓覆蓋範圍內任何一次源碼改動都改寫本文檔。

### 1.4 依賴邊界

出向關係:

- `calls` → `component.external-source-intake.immutable-evidence` — Persist provider-neutral immutable observations and typed refresh receipts before deriving a read-only projection
- `calls` → `capability.runtime-harness.mcp-sidecar` — Read the strict repo registry snapshot for repository identity and authorization

入向關係:

- `calls` ← `component.global-runtime-reconciliation.cli-root` — Register the external-source command

## 2. P2:端到端數據流

> **Proof**: `proven` (`sha256:6a93c93fd67f784afff33aee1fc2053c71546701f695987b89f4a73bc7a6a90b`); selectors `2/2`.

```mermaid
%%{init: {"theme":"base","themeVariables":{"background":"#0d1117","actorBkg":"#312e81","actorBorder":"#c4b5fd","actorTextColor":"#ffffff","signalColor":"#e5e7eb","signalTextColor":"#e5e7eb","labelBoxBkgColor":"#4c1d95","labelBoxBorderColor":"#c4b5fd","labelTextColor":"#ffffff","noteBkgColor":"#78350f","noteBorderColor":"#fcd34d","noteTextColor":"#ffffff","sequenceNumberColor":"#ffffff"}}}%%
sequenceDiagram
  autonumber
  participant p2_intake_2d1003be as External Source Intake
  participant p2_immutable_evidence_fee8abfe as Immutable External Evidence Store
  p2_intake_2d1003be->>p2_immutable_evidence_fee8abfe: Normalize bounded provider Issue JSON into immutable observation records
  alt Complete provider evidence remains a read-only projection
  p2_intake_2d1003be->>p2_immutable_evidence_fee8abfe: Persist the immutable complete attempt receipt before projection
    Note over p2_intake_2d1003be: Return a provider-neutral projection with no Task， Claim， Lease， or runtime mutation
  else Provider failures and bounds never become a healthy empty refresh
  p2_intake_2d1003be->>p2_immutable_evidence_fee8abfe: Persist the typed unavailable or incomplete attempt receipt
    Note over p2_intake_2d1003be: Return a non-zero typed refresh failure without fallback
  end
```
<!-- END ARCHCONTEXT:generated target="projection_target.entity.capability-runtime-harness-external-source-intake" -->

## 3. P3：设计决策与不变量

### 3.1 必须保持的不变量

1. GitHub 是证据提供者，不是 Task、优先级、Claim、Lease、WorkEnvelope、协作或 Agent Runtime 权威。
2. `provider_repository_id` 与 `provider_issue_id` 是稳定身份；显示用 `owner/repo#number` 仅为引用，不参与身份判断。
3. 每次刷新写一个不可变 receipt；complete-empty、incomplete 和 unavailable 绝不折叠为同一个投影状态。
4. 标题、正文、labels 与 assignees 是未信任 JSON。P0 只通过 JSON read model 暴露它们，不进入 prompt、合同或执行上下文。
5. append-only 扫描成本是已知 P0 权衡；在实测前不引入 mutable cache 或 adoption state。
6. WP2 的 binding 是 provenance edge，不是 scheduler edge：只有 canonical sprint row 与已批准 plan/contract 能进入现有 TaskOffer；receipt 本身不能创建工作。
7. 一个 receipt 只绑定一个 source revision 与一个 task revision；多条 receipt 自然表达 one-to-many / many-to-one，不做 semantic duplicate 推断。
8. source、canonical task/plan 或 registry authorization 漂移只产生显式 attention，不自动 rebind、取消、重开或改变 Lease。
9. provider 内容只允许由 `renderExternalSourceUntrustedContext` 输出，且 JSON 数据必须位于明确的 `[ExternalSourceUntrusted]` 边界内。

证据补充：

- 第 3 条：refresh 失败时写 typed unavailable 或 incomplete receipt，并非零退出（见 §4 P0 记录）。GitHub 读取有截止时间、总字节、页数和条数上限（`src/effects/external-sources/github.ts:164-205`）。超时归为 `unavailable`。超出字节或条数上限归为 `incomplete`（`github.ts:179`、`:205`）。
- 第 4、9 条：唯一的渲染入口是 `renderExternalSourceUntrustedContext`（`src/core/external-sources/binding.ts:183`）。它先校验 observation，再把 canonical JSON 包在 `[ExternalSourceUntrusted ...]` 边界里，并声明内容不能覆盖仓库规则和授权。
- 策略必须显式开启：`mode` 不是 `manual` 时 refresh 直接拒绝（`policy.ts:140`），`github.enabled` 必须为 `true`（`policy.ts:108`）。
- 本 capability 的模块只被它自己的 CLI 引用（`src/cli/commands/external-source.ts`）。没有 Fleet、collaboration、hook 或 MCP 调用方（2026-10-11 用 grep 核对）。

### 3.2 关键权衡

| 决策 | 权衡 |
| --- | --- |
| observation、receipt 和 binding 都只追加、不可变 | 每次刷新都可审计，漂移只产生 attention。代价是 list 和投影每次全量读取并逐条校验 canonical 字节（`store.ts:233-252`）。记录数增长后读取成本线性增长。 |
| 只支持手动 GitHub 刷新 | 没有轮询、webhook 或写回，provider 无法自行触发工作。代价是新 Issue 要人或 Bot 手动刷新才可见。 |
| binding 是 provenance 边，不是调度边 | 外部 Issue 不能绕过已批准的 sprint、plan、contract 和 Lease 链。代价是一个 Issue 变成工作需要先有 canonical task 和已批准的 plan。 |
| 稳定身份用 provider 数字 id | `owner/repo#number` 改名或迁移不会产生重复身份。代价是显示引用与身份分离，排查时要同时看两者。 |

### 3.3 组件与关系（2026-10-11）

| 节点 | footprint | 说明 |
| --- | --- | --- |
| `component.external-source-intake.immutable-evidence` | `src/effects/external-sources/store.ts` | 在 Git common 目录下一次性创建 observation、refresh receipt 和 binding receipt，只提供校验过的读取 |
| capability 自身 | `src/core/external-sources/**`、其余 `src/effects/external-sources/**`、`src/cli/commands/external-source.ts` | 协议、策略、GitHub 读取、刷新、绑定、投影、CLI |

对外关系：

- capability → `mcp-sidecar`：CLI 和 `binding.ts` 读取严格的 repo registry 快照（`external-source.ts:3`、`binding.ts:9-13`）。

集成步骤补上的关系：

- capability → workflow-state（`reads`）：`binding.ts` → `src/core/state/coordination-identity.ts`、`src/effects/state/coordination-canonical-source.ts`。
- immutable-evidence → execution-primitives：`store.ts` → `src/effects/git/common-directory.ts`、`src/effects/locking/exclusive-directory-lock.ts`。

## 4. 历史决策记录（append-only）

### P0 immutable GitHub intake（2026-08-31）

- P1：`src/core/external-sources/` 定义 provider-neutral protocol，`src/effects/external-sources/` 负责 strict policy、`gh` 一次性读取与 Git common-dir store，`src/cli/commands/external-source.ts` 仅注册 refresh/list read surface。
- P2：`external-source refresh --repo <id>` 先读取 registry 与 strict policy，再解析 immutable GitHub identity、分页 Issue JSON、过滤 PR、写 observation 和 attempt receipt，最后从持久记录投影；provider 失败写 typed unavailable/incomplete receipt 并非零退出。
- P3：禁止接入 Fleet 或 collaboration，避免外部 provider 绕过已批准的 sprint/plan/contract/lease 链。10x 时先碰到 provider 页数/字节/截止边界，而非 Lease 并发；超限 fail-closed 且无健康 empty fallback。

### WP2 authenticated canonical binding（2026-09-01）

- P1：`src/core/external-sources/binding.ts` 定义 closed receipt/projection 与唯一 untrusted renderer；`src/effects/external-sources/binding.ts` 负责 registry、observation、canonical task 与 plan/contract 的 exact revalidation；store 只追加 immutable edge。
- P2：`external-source bind` 读取两次 strict registry/source/canonical authority，持久化 exact edge；`bindings` 重读 live authorities并投影 source/canonical/authorization drift；canonical task 随后由既有 Fleet collector 产生 TaskOffer。
- P3：人类 acceptance 留在 PR merge。binding、dispatch、execution、repair 不增加 per-unit waiver/review gate；缺 credential/authorization/provider capability/required host dependency 才属于 installation blocker。

## Optimization Backlog

- append-only 存储的全量读取（§3.2）。在有实测记录数和延迟数据之前，不加可变缓存或索引。这与 §3.1 第 5 条一致。
- capability 的 responsibilities 里写着 "Exclude ... UI, MCP"。Operator 和 MCP 目前确实没有调用方。如果以后要在 Operator 显示外部证据，需要先决定是否放宽这条排除。

