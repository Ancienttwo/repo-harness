# runtime-harness/work-demand 架构文档
<!-- BEGIN ARCHCONTEXT:generated target="projection_target.entity.capability-runtime-harness-work-demand" sourceDigest="sha256:192e17844f0c2df68cffa64821e48ec677a357bd1989480ef3954a76f687c4ea" rendererVersion="archcontext.docs-renderer/v4" outputDigest="sha256:ff7b43266866c78e6b4e488acd21a1484ce086bdace242e3415ab5bf39de2726" -->
> **狀態**:`active`
> **Capability ID**:`capability.runtime-harness.work-demand`(kind `capability`)
> **Matched Prefixes**:`src/core/engineers/work-demand.ts`、`src/effects/engineers/work-demand-store.ts`、`src/effects/engineers/work-demand-materialization.ts`
> **Local Contracts**:`AGENTS.md`、`CLAUDE.md`
> **事實優先級**:倉庫當前狀態 > 本文檔機器區 > 本文檔人工區。機器區(引言、§1、§2)由 ArchContext 從架構模型與源碼度量投影生成,手改會在下次投影被覆蓋。本文檔不記錄出處;本次投影所驗證的 commit 見 `docs/architecture/.projection-manifest.json`。

Owns durable Agent-originated work requests, Human-frozen backlog projections and atomic Sprint plus Work Graph materialization without creating execution authority.

## 1. P1:能力架構地圖

### 1.1 架構圖

```mermaid
flowchart LR
  p1_capability_runtime_harness_engineer_bindings_34c00f72["Engineer Bindings"]:::component
  p1_capability_runtime_harness_engineer_scheduling_022bd8e0["Engineer Scheduling"]:::component
  p1_capability_runtime_harness_work_demand_0d9576b2["Work Demand Intake"]:::component
  p1_component_work_demand_primary_7a7ddd3b["Work Demand Authority Store"]:::component
  p1_capability_runtime_harness_engineer_scheduling_022bd8e0 -->|"Revalidate the exact current Engineer contract and delegate the elected offer to the existing Engineer acquire authority"| p1_capability_runtime_harness_engineer_bindings_34c00f72
  p1_capability_runtime_harness_work_demand_0d9576b2 -->|"Revalidate the exact current requester Binding for Engineer-owned transitions"| p1_capability_runtime_harness_engineer_bindings_34c00f72
  p1_capability_runtime_harness_work_demand_0d9576b2 -->|"Validate the accepted Work Package against the same-commit canonical Sprint and Work Graph"| p1_capability_runtime_harness_engineer_scheduling_022bd8e0
  p1_capability_runtime_harness_work_demand_0d9576b2 -->|"Persist immutable lifecycle evidence and one recoverable current projection"| p1_component_work_demand_primary_7a7ddd3b
  classDef actor fill:#111827,color:#ffffff,stroke:#f9fafb,stroke-width:2px
  classDef component fill:#075985,color:#ffffff,stroke:#bae6fd,stroke-width:2px
  classDef datastore fill:#3f6212,color:#ffffff,stroke:#d9f99d,stroke-width:2px
  classDef external fill:#7c2d12,color:#ffffff,stroke:#fed7aa,stroke-width:2px
```

- Proof: `proven` (`sha256:7f26c078e32e16ba967f44fbef6b1fde73fce7388d7a7c92f7fcbf2a025951fe`).
- Semantic nodes: `4`; declared relations: `4`.

### 1.2 模組職責表

| 宣告入口 | 錨點 | 職責 |
| --- | --- | --- |
| `entrypoint.work-demand.event` | `src/core/engineers/work-demand.ts#buildWorkDemandEvent` | `sink.work-demand.digest` → `src/core/messages/mechanics.ts#canonicalMessageDigest` |
| `entrypoint.work-demand.binding` | `src/effects/engineers/work-demand-store.ts#validateEngineer` | `sink.work-demand.binding` → `src/effects/engineers/binding-store.ts#readEngineerBindingStatus` |
| `entrypoint.work-demand.materialize` | `src/effects/engineers/work-demand-materialization.ts#materializeWorkDemand` | `sink.work-demand.graph` → `src/core/engineers/scheduling.ts#projectWorkGraph` |

### 1.3 規模信號

- 規模量級:`2–5` 個文件 / `500–1000` 行
- 匹配前綴:`src/core/engineers/work-demand.ts`、`src/effects/engineers/work-demand-store.ts`、`src/effects/engineers/work-demand-materialization.ts`
- 推導:掃描 `source.include` 減 `source.exclude`,跳過 `.git/` 與 `node_modules/`,再按 1–2–5 階梯分桶。精確計數不入本文檔:量級足以回答「這個能力有多大」,而逐行計數會讓覆蓋範圍內任何一次源碼改動都改寫本文檔。

### 1.4 依賴邊界

出向關係:

- `calls` → `capability.runtime-harness.engineer-bindings` — Revalidate the exact current requester Binding for Engineer-owned transitions
- `calls` → `capability.runtime-harness.engineer-scheduling` — Validate the accepted Work Package against the same-commit canonical Sprint and Work Graph
- `calls` → `component.work-demand.primary` — Persist immutable lifecycle evidence and one recoverable current projection

入向關係:

- 無。

## 2. P2:端到端數據流

> **Proof**: `proven` (`sha256:7f26c078e32e16ba967f44fbef6b1fde73fce7388d7a7c92f7fcbf2a025951fe`); selectors `3/3`.

```mermaid
%%{init: {"theme":"base","themeVariables":{"background":"#0d1117","actorBkg":"#312e81","actorBorder":"#c4b5fd","actorTextColor":"#ffffff","signalColor":"#e5e7eb","signalTextColor":"#e5e7eb","labelBoxBkgColor":"#4c1d95","labelBoxBorderColor":"#c4b5fd","labelTextColor":"#ffffff","noteBkgColor":"#78350f","noteBorderColor":"#fcd34d","noteTextColor":"#ffffff","sequenceNumberColor":"#ffffff"}}}%%
sequenceDiagram
  autonumber
  participant p2_work_demand_869df62d as Work Demand Intake
  participant p2_engineer_bindings_4e9749d0 as Engineer Bindings
  participant p2_engineer_scheduling_873d6e50 as Engineer Scheduling
  participant p2_demand_store_99389b2e as Work Demand Authority Store
  p2_work_demand_869df62d->>p2_engineer_bindings_4e9749d0: Revalidate the exact requester Binding before Agent-owned transitions
  p2_work_demand_869df62d->>p2_demand_store_99389b2e: Persist the exact request， event and Human-accepted projection under per-demand CAS
  alt The accepted task becomes canonical in one Git commit
  p2_work_demand_869df62d->>p2_engineer_scheduling_873d6e50: Validate both new authorities， write one Git tree and update the canonical ref by compare-and-swap
    Note over p2_work_demand_869df62d: Return a materialization receipt that creates no Claim or Lease
  else Actor， digest or canonical revision mismatch fails closed
  p2_work_demand_869df62d->>p2_demand_store_99389b2e: Leave the current demand， Sprint and Work Graph authorities unchanged
    Note over p2_work_demand_869df62d: Return one typed refusal without fallback materialization
  end
```
<!-- END ARCHCONTEXT:generated target="projection_target.entity.capability-runtime-harness-work-demand" -->
## 3. P3: 设计决策与不变量

请求文本和 advisory urgency/dependency hints 始终是未信任输入。Human acceptance 冻结真正的 Task 与 Work Package 字节；materialization receipt 只证明创建工作，不创建 Claim、Lease 或 WorkEnvelope。10x 规模下首先受压的是 Git-common-dir 的逐 demand 文件枚举，单 demand 锁与原子 ref 更新仍保持正确；届时可增加可重建索引，不改变权威文件。
