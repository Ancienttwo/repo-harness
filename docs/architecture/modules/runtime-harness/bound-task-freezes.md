# runtime-harness/bound-task-freezes 架構文檔

<!-- BEGIN ARCHCONTEXT:generated target="projection_target.entity.capability-runtime-harness-bound-task-freezes" sourceDigest="sha256:52dc355be03ca5be963c88decdd22789e4ff6262ae5c92e1bc74ea8e829fd3e1" rendererVersion="archcontext.docs-renderer/v4" outputDigest="sha256:b59714880f64e65b500e598885766c72d77264c55f62d0d13d393e5ed4dcfd85" -->
> **狀態**:`active`
> **Capability ID**:`capability.runtime-harness.bound-task-freezes`(kind `capability`)
> **Matched Prefixes**:`src/core/engineers/task-freeze.ts`、`src/effects/engineers/task-freeze-store.ts`、`src/effects/engineers/bound-task-rotation.ts`
> **Local Contracts**:`AGENTS.md`、`CLAUDE.md`
> **事實優先級**:倉庫當前狀態 > 本文檔機器區 > 本文檔人工區。機器區(引言、§1、§2)由 ArchContext 從架構模型與源碼度量投影生成,手改會在下次投影被覆蓋。本文檔不記錄出處;本次投影所驗證的 commit 見 `docs/architecture/.projection-manifest.json`。

Freezes exact live Claim, Binding, WorkEnvelope and Git observations while refusing Session rotation that would imply dirty-task transfer.

## 1. P1:能力架構地圖

### 1.1 架構圖

```mermaid
flowchart LR
  p1_capability_runtime_harness_bound_task_freezes_b47bdee4["Bound Task Freezes"]:::component
  p1_capability_runtime_harness_engineer_bindings_34c00f72["Engineer Bindings"]:::component
  p1_component_bound_task_freezes_primary_aeb06c9b["Immutable Task Freeze Store"]:::component
  p1_capability_runtime_harness_bound_task_freezes_b47bdee4 -->|"Revalidate the current Binding and exact live ClaimActorReceipt before inspection or rotation refusal"| p1_capability_runtime_harness_engineer_bindings_34c00f72
  p1_capability_runtime_harness_bound_task_freezes_b47bdee4 -->|"Persist and revalidate immutable exact-state freeze receipts without transferring execution authority"| p1_component_bound_task_freezes_primary_aeb06c9b
  classDef actor fill:#111827,color:#ffffff,stroke:#f9fafb,stroke-width:2px
  classDef component fill:#075985,color:#ffffff,stroke:#bae6fd,stroke-width:2px
  classDef datastore fill:#3f6212,color:#ffffff,stroke:#d9f99d,stroke-width:2px
  classDef external fill:#7c2d12,color:#ffffff,stroke:#fed7aa,stroke-width:2px
```

- Proof: `proven` (`sha256:7d292675a7cc468a54552f59363baa784657098859f7ac88ecbba67364b5db4c`).
- Semantic nodes: `3`; declared relations: `2`.

### 1.2 模組職責表

| 宣告入口 | 錨點 | 職責 |
| --- | --- | --- |
| `entrypoint.bound-task-freezes.inspect` | `src/effects/engineers/task-freeze-store.ts#readCurrentTaskFreezeBinding` | `sink.bound-task-freezes.binding-current` → `src/effects/engineers/binding-store.ts#readEngineerBindingStatus` |
| `entrypoint.bound-task-freezes.inspect` | `src/effects/engineers/task-freeze-store.ts#inspectBoundTaskLocked` | `sink.bound-task-freezes.receipt-schema` → `src/core/engineers/task-freeze.ts#buildTaskFreezeReceipt` |
| `entrypoint.bound-task-freezes.persist` | `src/effects/engineers/task-freeze-store.ts#inspectBoundTaskLocked` | `sink.bound-task-freezes.immutable-store` → `src/effects/engineers/task-freeze-store.ts#persistTaskFreezeReceipt` |
| `entrypoint.bound-task-freezes.verify` | `src/effects/engineers/task-freeze-store.ts#verifyTaskFreeze` | `sink.bound-task-freezes.stale-compare` → `src/core/engineers/task-freeze.ts#taskFreezeReceiptChangedFields` |
| `entrypoint.bound-task-freezes.rotation-refusal` | `src/effects/engineers/bound-task-rotation.ts#assertNoLiveClaimForBindingRotation` | `sink.bound-task-freezes.live-claim` → `src/effects/engineers/claim-actor-store.ts#listLiveClaimActorReceiptsForEngineer` |

### 1.3 規模信號

- 規模量級:`2–5` 個文件 / `500–1000` 行
- 匹配前綴:`src/core/engineers/task-freeze.ts`、`src/effects/engineers/task-freeze-store.ts`、`src/effects/engineers/bound-task-rotation.ts`
- 推導:掃描 `source.include` 減 `source.exclude`,跳過 `.git/` 與 `node_modules/`,再按 1–2–5 階梯分桶。精確計數不入本文檔:量級足以回答「這個能力有多大」,而逐行計數會讓覆蓋範圍內任何一次源碼改動都改寫本文檔。

### 1.4 依賴邊界

出向關係:

- `calls` → `capability.runtime-harness.engineer-bindings` — Revalidate the current Binding and exact live ClaimActorReceipt before inspection or rotation refusal
- `calls` → `component.bound-task-freezes.primary` — Persist and revalidate immutable exact-state freeze receipts without transferring execution authority

入向關係:

- 無。

## 2. P2:端到端數據流

> **Proof**: `proven` (`sha256:7d292675a7cc468a54552f59363baa784657098859f7ac88ecbba67364b5db4c`); selectors `5/5`.

```mermaid
%%{init: {"theme":"base","themeVariables":{"background":"#0d1117","actorBkg":"#312e81","actorBorder":"#c4b5fd","actorTextColor":"#ffffff","signalColor":"#e5e7eb","signalTextColor":"#e5e7eb","labelBoxBkgColor":"#4c1d95","labelBoxBorderColor":"#c4b5fd","labelTextColor":"#ffffff","noteBkgColor":"#78350f","noteBorderColor":"#fcd34d","noteTextColor":"#ffffff","sequenceNumberColor":"#ffffff"}}}%%
sequenceDiagram
  autonumber
  participant p2_bound_task_freezes_60610ef7 as Bound Task Freezes
  participant p2_engineer_bindings_4e9749d0 as Engineer Bindings
  participant p2_freeze_store_3c761068 as Immutable Task Freeze Store
  p2_bound_task_freezes_60610ef7->>p2_engineer_bindings_4e9749d0: Resolve one current Binding and one exact live ClaimActorReceipt fenced to the bound Lease and persisted WorkEnvelope
  p2_bound_task_freezes_60610ef7->>p2_freeze_store_3c761068: Double-read exact Git and control-plane observations before building one canonical TaskFreezeReceipt
  alt Stable observations persist one immutable receipt with closed Human choices
  p2_bound_task_freezes_60610ef7->>p2_freeze_store_3c761068: Publish content-addressed receipt bytes without Claim， Lease or Binding mutation
    Note over p2_bound_task_freezes_60610ef7: Return clean-release evidence or freeze-required reasons； never elect a successor
  else Changed or stale state and active-Claim rotation fail closed
  p2_bound_task_freezes_60610ef7->>p2_engineer_bindings_4e9749d0: Refuse Binding replace or retire until the live Claim follows its explicit release path
  p2_bound_task_freezes_60610ef7->>p2_freeze_store_3c761068: Compare every receipt fence with a fresh double-read observation and reject any change
    Note over p2_bound_task_freezes_60610ef7: Preserve the existing Claim and worktree topology； perform no takeover or implicit release
  end
```
<!-- END ARCHCONTEXT:generated target="projection_target.entity.capability-runtime-harness-bound-task-freezes" -->

## 3. P3:設計決策與不變量

## 4. 歷史決策記錄(append-only)

## Optimization Backlog
