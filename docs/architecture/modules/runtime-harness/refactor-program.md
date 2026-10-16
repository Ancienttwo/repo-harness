# Refactor Program
<!-- BEGIN ARCHCONTEXT:generated target="projection_target.entity.capability-runtime-harness-refactor-program" rendererVersion="archcontext.docs-renderer/v6" outputDigest="sha256:57705e9603649e178ab097b59cf2b86d2b6066ff73975323ebe2f50396622489" -->
> **狀態**:`active`
> **Capability ID**:`capability.runtime-harness.refactor-program`(kind `capability`)
> **Matched Prefixes**:`src/core/refactor/**`、`src/effects/refactor/**`、`src/cli/commands/refactor.ts`
> **Local Contracts**:`AGENTS.md`、`CLAUDE.md`
> **事實優先級**:倉庫當前狀態 > 本文檔機器區 > 本文檔人工區。機器區(引言、§1、§2)由 ArchContext 從架構模型與源碼度量投影生成,手改會在下次投影被覆蓋。本文檔不記錄出處;本次投影所驗證的 commit 見 `docs/architecture/.projection-manifest.json`。

Shows measured ArchContext refactor suggestions with their evidence and records the user decision; it never executes a refactor.

## 1. P1:能力架構地圖

### 1.1 架構圖

```mermaid
flowchart LR
  p1_capability_runtime_harness_refactor_program_75614af4["Refactor Recommendations"]:::component
  p1_component_refactor_program_archctx_provider_66030fac["Refactor ArchContext Provider Boundary"]:::component
  p1_capability_runtime_harness_refactor_program_75614af4 -->|"Scan for structural observations and record user decisions through the pinned package-local ArchContext CLI"| p1_component_refactor_program_archctx_provider_66030fac
  classDef actor fill:#111827,color:#ffffff,stroke:#f9fafb,stroke-width:2px
  classDef component fill:#075985,color:#ffffff,stroke:#bae6fd,stroke-width:2px
  classDef datastore fill:#3f6212,color:#ffffff,stroke:#d9f99d,stroke-width:2px
  classDef external fill:#7c2d12,color:#ffffff,stroke:#fed7aa,stroke-width:2px
```

- Proof: `proven` (`sha256:af8597794113e9dd3284c6f4a7f390912ac84a60dd44b32adf7c3aab8810ab9a`).
- Semantic nodes: `2`; declared relations: `1`.

### 1.2 模組職責表

| 宣告入口 | 錨點 | 職責 |
| --- | --- | --- |
| `entrypoint.refactor-program.observe` | `src/effects/refactor/recommendations.ts#discoverRefactorRecommendations` | `sink.refactor-program.provider-scan` → `src/effects/refactor/archctx-provider.ts#runRefactorScan` |
| `entrypoint.refactor-program.decide` | `src/cli/commands/refactor.ts#decideRefactorRecommendation` | `sink.refactor-program.decision` → `src/effects/refactor/archctx-provider.ts#decideRecommendation` |

組件入口:

- 組件均未宣告 `source.entrypoints`。

### 1.3 規模信號

- 規模量級:`2–5` 個文件 / `200–500` 行
- 匹配前綴:`src/core/refactor/**`、`src/effects/refactor/**`、`src/cli/commands/refactor.ts`
- 推導:掃描 `source.include` 減 `source.exclude`,跳過 `.git/` 與 `node_modules/`,再按 1–2–5 階梯分桶。精確計數不入本文檔:量級足以回答「這個能力有多大」,而逐行計數會讓覆蓋範圍內任何一次源碼改動都改寫本文檔。

### 1.4 依賴邊界

出向關係:

- `calls` → `component.refactor-program.archctx-provider` — Scan for structural observations and record user decisions through the pinned package-local ArchContext CLI
- `calls` → `capability.runtime-harness.mcp-sidecar` — Resolve the canonical repository path through the repo registry

入向關係:

- `calls` ← `component.global-runtime-reconciliation.cli-root` — Register the refactor command

組件出向關係:

- `component.refactor-program.archctx-provider`:
  - `calls` → `capability.runtime-harness.evidence-ledger` — Canonicalize refactor provider records
  - `calls` → `capability.runtime-harness.global-runtime-reconciliation` — Run the pinned package-local archctx CLI through the shared architecture provider

### 1.5 組件結構

| 組件 | 名稱 | 規模量級 | 宣告入口 |
| --- | --- | --- | --- |
| `component.refactor-program.archctx-provider` | Refactor ArchContext Provider Boundary | `1–2` 個文件 / `20–50` 行 | 未宣告 |

## 2. P2:端到端數據流

> **Proof**: `proven` (`sha256:af8597794113e9dd3284c6f4a7f390912ac84a60dd44b32adf7c3aab8810ab9a`); selectors `2/2`.

```mermaid
%%{init: {"theme":"base","themeVariables":{"background":"#0d1117","actorBkg":"#312e81","actorBorder":"#c4b5fd","actorTextColor":"#ffffff","signalColor":"#e5e7eb","signalTextColor":"#e5e7eb","labelBoxBkgColor":"#4c1d95","labelBoxBorderColor":"#c4b5fd","labelTextColor":"#ffffff","noteBkgColor":"#78350f","noteBorderColor":"#fcd34d","noteTextColor":"#ffffff","sequenceNumberColor":"#ffffff"}}}%%
sequenceDiagram
  autonumber
  participant p2_refactor_program_a8b792d5 as Refactor Recommendations
  participant p2_archctx_provider_3b536550 as Refactor ArchContext Provider Boundary
  p2_refactor_program_a8b792d5->>p2_archctx_provider_3b536550: Record the scan when needed#44; then send accept#44; defer or reject with the user reason
  alt ArchContext stores the decision and later scans hide the suggestion
  p2_refactor_program_a8b792d5->>p2_archctx_provider_3b536550: Return the new lifecycle status
    Note over p2_refactor_program_a8b792d5: Report the recorded status
  else An unknown suggestion or a provider error records nothing
  p2_refactor_program_a8b792d5->>p2_archctx_provider_3b536550: Return the provider error code
    Note over p2_refactor_program_a8b792d5: Exit with the error
  end
```

```mermaid
%%{init: {"theme":"base","themeVariables":{"background":"#0d1117","actorBkg":"#312e81","actorBorder":"#c4b5fd","actorTextColor":"#ffffff","signalColor":"#e5e7eb","signalTextColor":"#e5e7eb","labelBoxBkgColor":"#4c1d95","labelBoxBorderColor":"#c4b5fd","labelTextColor":"#ffffff","noteBkgColor":"#78350f","noteBorderColor":"#fcd34d","noteTextColor":"#ffffff","sequenceNumberColor":"#ffffff"}}}%%
sequenceDiagram
  autonumber
  participant p2_refactor_program_a8b792d5 as Refactor Recommendations
  participant p2_archctx_provider_3b536550 as Refactor ArchContext Provider Boundary
  p2_refactor_program_a8b792d5->>p2_archctx_provider_3b536550: Scan the repository for structural observations and read their lifecycle records
  alt Open suggestions are shown with their metrics and module statistics
  p2_refactor_program_a8b792d5->>p2_archctx_provider_3b536550: Keep observations without a recorded user decision
    Note over p2_refactor_program_a8b792d5: Return evidence-backed suggestions for the user to decide
  else A missing model#44; provider or complete code facts produces no suggestion
  p2_refactor_program_a8b792d5->>p2_archctx_provider_3b536550: Report the provider failure or the incomplete code facts
    Note over p2_refactor_program_a8b792d5: Return an unavailable or proof_required status
  end
```
<!-- END ARCHCONTEXT:generated target="projection_target.entity.capability-runtime-harness-refactor-program" -->
## 3. P3:設計決策與不變量

### 3.1 必须保持的不变量

1. **ArchContext 是结构观测的唯一权威。** repo-harness 不计算模块统计、依赖、环、重构评分或规模。建议的 id、生命周期状态和度量都来自 `archctx refactor scan` 和 `book recommendations`（`src/effects/refactor/archctx-provider.ts:28-37`）。
2. **只展示同一次扫描的证据。** 每条建议带上产生它的观测度量和受影响模块的统计（`recommendations.ts:70-91`）。repo-harness 不合成其他内容。
3. **有决定的建议不再显示。** 状态为 accepted、rejected、deferred、waived、resolved、superseded、expired 的建议被过滤（`recommendations.ts:52`、`:63`）。repo-harness 不保存投递账本、冷却时间或本地建议状态。
4. **证据不完整时不给建议。** code facts 不完整或被截断时返回 `proof_required`（`recommendations.ts:103-105`）。任何文件有多个归属 capability 时也返回 `proof_required`，因为模块统计会重复计数这些文件（`recommendations.ts:106-110`）。模型未初始化时返回 `unavailable`（`:100`）。
5. **只记录用户决定，从不执行重构。** `refactor decide` 在建议尚未记录时先记录扫描，再把 accept、defer 或 reject 连同理由交给 ArchContext（`src/cli/commands/refactor.ts:33-40`）。接受的建议走普通的 plan 和 PR 流程。
6. **建议是按需证据，不是推送。** 没有 hook 扫描建议。Bot 调用 `repo-harness refactor recommendations --json` 读取证据，再决定是否调度工作（PR #617；`assets/skill-commands/repo-harness-check/references/architecture-evidence.md`）。
7. **包内 archctx 先过版本检查。** 每个仓库根第一次调用时检查 `capabilities --json` 的精确版本（`archctx-provider.ts:17-20`）。provider 错误统一转成 `refactor_provider_unavailable`（`:24`）。

### 3.2 关键权衡

| 决策 | 权衡 |
| --- | --- |
| 删除 Refactor Program 执行栈（PR #617） | 没有 skill 或 MCP 工具使用它，Stop 也只打印 `recommended: undefined`。删除后本 capability 只剩 4 个文件、约 285 行。代价是接受的建议要由 Bot 或人重新写成 plan。 |
| 多归属文件存在时一律 `proof_required` | 不会给出基于重复计数的建议。代价是本仓库目前有 45 个多归属文件，所以 `refactor recommendations` 在本仓库总是返回 `proof_required`，直到 arch-context#296 和 resolver 改动完成。 |
| `decide` 每次重新扫描 | 决定总是针对当前扫描里存在的建议，未知 id 直接报错（`refactor.ts:36`）。代价是每次决定都付一次完整扫描（provider 超时 120 秒，`archctx-provider.ts:21`）。 |
| CLI 退出码区分证据状态 | `unavailable` 和 `proof_required` 退出码为 1（`refactor.ts:56`），Bot 可以不解析 JSON 就知道证据不可用。代价是"没有建议"与"无法给建议"在退出码层面不同，调用方必须区分。 |

### 3.3 组件与关系（2026-10-11）

| 节点 | footprint | 说明 |
| --- | --- | --- |
| `component.refactor-program.archctx-provider` | `src/effects/refactor/archctx-provider.ts` | 运行 scan、读取建议记录、记录扫描、提交决定 |
| capability 自身 | `src/core/refactor/**`、`src/effects/refactor/recommendations.ts`、`src/cli/commands/refactor.ts` | 证据整理、proof 判定、CLI |

对外关系：

- archctx-provider → `global-runtime-reconciliation`：调用 `runPackageLocalArchctxJson`（`archctx-provider.ts:9`、`:21`），并使用 `assertArchctxVersion`（`:2`）。
- capability → `mcp-sidecar`：`refactor.ts` 用 `canonicalRepoPath` 解析仓库根（`refactor.ts:2`）。

### 3.4 开放问题

- `archctx-provider.ts:4` 引用 `src/core/evidence/canonical-json.ts`。该文件归 `evidence-ledger`。集成步骤声明了 archctx-provider → evidence-ledger。

## Verification

Run the root required checks and the focused tests recorded in the capability node.

## 4. 历史决策记录（append-only）

### 执行栈退役，只保留证据和决定（2026-10-11，PR #617）

- 删除事件链状态机、授权 grant、Sprint 与 Work Package 物化、激活 canary、Codex shadow author、候选验证、执行绑定和合并后解决，以及 81 个测试。
- `refactor recommendations` 显示建议和同一次扫描的度量。`refactor decide <id> accept|defer|reject --reason` 记录决定。
- Stop 不再扫描建议，全局 `refactor_recommendations` 设置被删除。证据由 Bot 按需读取。
- 恢复多归属文件的 proof 门：`multiplyOwnedFileCount > 0` 时返回 `proof_required`。

### 旧版 P3 原文（2026-10-11 之前，逐字保留）

旧版最后一条与 PR #617 的最终状态冲突：Stop 已不再扫描建议，所以"Stop 时静默"不再适用。

> - repo-harness has no local module statistics, dependency analysis, cycle detection, refactor scoring or scale inference. ArchContext owns structural observations, recommendation identity and lifecycle status.
> - A suggestion is shown with the evidence of the scan that produced it: the observation metrics and the statistics of each affected module. Nothing else is synthesized.
> - repo-harness keeps no delivery ledger, cooldown or local recommendation state. A suggestion with a recorded decision (accepted, rejected, deferred, waived, resolved, superseded, expired) is not shown again.
> - `decide` records the scan in ArchContext only when the suggestion is not yet recorded, then sends the decision with the user's reason.
> - repo-harness never executes a refactor. An accepted suggestion goes through the normal plan and pull request workflow. The previous Refactor Program (state machine, materialization, activation canaries, execution binding, post-merge resolution) was deleted on 2026-10-10.
> - An unavailable provider is silent at Stop, so repositories without an architecture model see no noise. Incomplete code facts print `proof_required` with the `codegraph init` remedy.

## Optimization Backlog

- capability 名称仍是 "Refactor Recommendations"，id 仍是 `refactor-program`。id 是持久数据键，按用户决定不改名。文档和 Bot 引用时需要说明两者对应。
- `refactor recommendations` 在本仓库被多归属文件阻塞（§3.2）。arch-context#296 完成并收窄 umbrella include 后，用本命令验证 proof 门是否放开。
