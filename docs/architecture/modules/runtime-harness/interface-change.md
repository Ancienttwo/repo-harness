# runtime-harness/interface-change 架構文檔

<!-- BEGIN ARCHCONTEXT:generated target="projection_target.entity.capability-runtime-harness-interface-change" sourceDigest="sha256:75efb06638143eb3cefbe43209117391ab0cba8a352cf85bdbd760984c3770c1" rendererVersion="archcontext.docs-renderer/v4" outputDigest="sha256:60a77edc9d80143bba47f685fc5bbd20b4c096e2b732fe6401669c52f50dba3a" -->
> **狀態**:`active`
> **Capability ID**:`capability.runtime-harness.interface-change`(kind `capability`)
> **Matched Prefixes**:`src/core/engineers/interface-change.ts`、`src/effects/engineers/interface-change-store.ts`、`src/cli/commands/interface-change.ts`
> **Local Contracts**:`AGENTS.md`、`CLAUDE.md`
> **事實優先級**:倉庫當前狀態 > 本文檔機器區 > 本文檔人工區。機器區(引言、§1、§2)由 ArchContext 從架構模型與源碼度量投影生成,手改會在下次投影被覆蓋。本文檔不記錄出處;本次投影所驗證的 commit 見 `docs/architecture/.projection-manifest.json`。

Owns revision-fenced cross-capability interface decisions and exact planning materialization evidence without becoming scheduling, code, runtime or acceptance authority.

## 1. P1:能力架構地圖

### 1.1 架構圖

```mermaid
flowchart LR
  p1_capability_runtime_harness_engineer_bindings_34c00f72["Engineer Bindings"]:::component
  p1_capability_runtime_harness_engineer_scheduling_022bd8e0["Engineer Scheduling"]:::component
  p1_capability_runtime_harness_interface_change_cc228fe9["Interface Change Requests"]:::component
  p1_component_interface_change_primary_85a0e1ad["Interface Change Authority Store"]:::component
  p1_capability_runtime_harness_engineer_scheduling_022bd8e0 -->|"Revalidate the exact current Engineer contract and delegate the elected offer to the existing Engineer acquire authority"| p1_capability_runtime_harness_engineer_bindings_34c00f72
  p1_capability_runtime_harness_interface_change_cc228fe9 -->|"Revalidate the exact current Binding for every Engineer-owned transition"| p1_capability_runtime_harness_engineer_bindings_34c00f72
  p1_capability_runtime_harness_interface_change_cc228fe9 -->|"Verify target-Engineer materialization against the exact tracked ME-1A Work Graph projection at one Git commit"| p1_capability_runtime_harness_engineer_scheduling_022bd8e0
  p1_capability_runtime_harness_interface_change_cc228fe9 -->|"Persist immutable request and transition evidence plus one recoverable CAS current projection"| p1_component_interface_change_primary_85a0e1ad
  classDef actor fill:#111827,color:#ffffff,stroke:#f9fafb,stroke-width:2px
  classDef component fill:#075985,color:#ffffff,stroke:#bae6fd,stroke-width:2px
  classDef datastore fill:#3f6212,color:#ffffff,stroke:#d9f99d,stroke-width:2px
  classDef external fill:#7c2d12,color:#ffffff,stroke:#fed7aa,stroke-width:2px
```

- Proof: `proven` (`sha256:5fe08894ae4d2243fad3a24295426db63eebe8a664b995833390692a8bc17a58`).
- Semantic nodes: `4`; declared relations: `4`.

### 1.2 模組職責表

| 宣告入口 | 錨點 | 職責 |
| --- | --- | --- |
| `entrypoint.interface-change.binding-fence` | `src/effects/engineers/interface-change-store.ts#validateEngineerActor` | `sink.interface-change.binding` → `src/effects/engineers/binding-store.ts#readEngineerBindingStatus` |
| `entrypoint.interface-change.event-canonical` | `src/core/engineers/interface-change.ts#buildInterfaceChangeEvent` | `sink.interface-change.event-digest` → `src/core/messages/mechanics.ts#canonicalMessageDigest` |
| `entrypoint.interface-change.work-graph` | `src/effects/engineers/interface-change-store.ts#projectedGraphAt` | `sink.interface-change.work-graph` → `src/effects/engineers/scheduling.ts#readTrackedWorkGraphProjectionAt` |
| `entrypoint.interface-change.reverse-lookup` | `src/effects/engineers/interface-change-store.ts#findInterfaceChangesByWorkPackage` | `sink.interface-change.accepted-projection` → `src/core/engineers/interface-change.ts#validateInterfaceWorkPackageProjection` |

### 1.3 規模信號

- 規模量級:`2–5` 個文件 / `1000–2000` 行
- 匹配前綴:`src/core/engineers/interface-change.ts`、`src/effects/engineers/interface-change-store.ts`、`src/cli/commands/interface-change.ts`
- 推導:掃描 `source.include` 減 `source.exclude`,跳過 `.git/` 與 `node_modules/`,再按 1–2–5 階梯分桶。精確計數不入本文檔:量級足以回答「這個能力有多大」,而逐行計數會讓覆蓋範圍內任何一次源碼改動都改寫本文檔。

### 1.4 依賴邊界

出向關係:

- `calls` → `capability.runtime-harness.engineer-bindings` — Revalidate the exact current Binding for every Engineer-owned transition
- `calls` → `capability.runtime-harness.engineer-scheduling` — Verify target-Engineer materialization against the exact tracked ME-1A Work Graph projection at one Git commit
- `calls` → `component.interface-change.primary` — Persist immutable request and transition evidence plus one recoverable CAS current projection

入向關係:

- `calls` ← `capability.runtime-harness.mcp-sidecar` — Expose only authenticated Engineer propose, submit, cancel, materialize and implemented mutations through the server-derived OAuth principal

## 2. P2:端到端數據流

> **Proof**: `proven` (`sha256:5fe08894ae4d2243fad3a24295426db63eebe8a664b995833390692a8bc17a58`); selectors `3/3`.

```mermaid
%%{init: {"theme":"base","themeVariables":{"background":"#0d1117","actorBkg":"#312e81","actorBorder":"#c4b5fd","actorTextColor":"#ffffff","signalColor":"#e5e7eb","signalTextColor":"#e5e7eb","labelBoxBkgColor":"#4c1d95","labelBoxBorderColor":"#c4b5fd","labelTextColor":"#ffffff","noteBkgColor":"#78350f","noteBorderColor":"#fcd34d","noteTextColor":"#ffffff","sequenceNumberColor":"#ffffff"}}}%%
sequenceDiagram
  autonumber
  participant p2_interface_change_07dfc7ca as Interface Change Requests
  participant p2_engineer_bindings_4e9749d0 as Engineer Bindings
  participant p2_engineer_scheduling_873d6e50 as Engineer Scheduling
  participant p2_interface_store_f8f9b407 as Interface Change Authority Store
  p2_interface_change_07dfc7ca->>p2_engineer_bindings_4e9749d0: Revalidate the source or target Engineer against the exact current Binding before an Engineer-owned transition
  p2_interface_change_07dfc7ca->>p2_interface_store_f8f9b407: Build immutable event bytes under per-request CAS while keeping Human and Engineer transition sets disjoint
  alt The target Engineer proves the accepted Work Package exists at one exact Git commit
  p2_interface_change_07dfc7ca->>p2_engineer_scheduling_873d6e50: Read the tracked Sprint and Work Graph through the complete ME-1A authority projection and compare exact Work Package revision and target capability
    Note over p2_interface_change_07dfc7ca: Return immutable materialization evidence without changing Sprint， Work Graph， Task or Lease state
  else Stale CAS， actor mismatch， invalid transition or inexact materialization fails closed
  p2_interface_change_07dfc7ca->>p2_engineer_bindings_4e9749d0: Preserve existing request and control-plane state without fallback mutation
    Note over p2_interface_change_07dfc7ca: Return one typed refusal and perform no downstream control-plane mutation
  end
```
<!-- END ARCHCONTEXT:generated target="projection_target.entity.capability-runtime-harness-interface-change" -->

## 3. P3:設計決策與不變量

## 4. 歷史決策記錄(append-only)

## Optimization Backlog
