# runtime-harness/engineering-overlay 架構文檔

<!-- BEGIN ARCHCONTEXT:generated target="projection_target.entity.capability-runtime-harness-engineering-overlay" sourceDigest="sha256:06214075572b77e5c063af3d7240be61709bd7b38b1c7305a33d564e41ab3f1e" rendererVersion="archcontext.docs-renderer/v4" outputDigest="sha256:bdcc163dd16594d4d67106cd967bdea87f1b6c6a6bb82fb03d24e7beb1bd14ea" -->
> **狀態**:`active`
> **Capability ID**:`capability.runtime-harness.engineering-overlay`(kind `capability`)
> **Matched Prefixes**:`src/core/engineers/engineering-overlay.ts`、`src/effects/engineers/engineering-overlay.ts`
> **Local Contracts**:`AGENTS.md`、`CLAUDE.md`
> **事實優先級**:倉庫當前狀態 > 本文檔機器區 > 本文檔人工區。機器區(引言、§1、§2)由 ArchContext 從架構模型與源碼度量投影生成,手改會在下次投影被覆蓋。本文檔不記錄出處;本次投影所驗證的 commit 見 `docs/architecture/.projection-manifest.json`。

Projects Profile, Binding, Claim, message and Provider observations into exact read-only Engineer and organization-attention views without changing Fleet lifecycle authority.

## 1. P1:能力架構地圖

### 1.1 架構圖

```mermaid
flowchart LR
  p1_capability_runtime_harness_engineering_overlay_c3aa5b35["Engineering Overlay"]:::component
  p1_component_engineering_overlay_primary_37afa8e8["Engineering Overlay Read Model"]:::component
  p1_capability_runtime_harness_engineering_overlay_c3aa5b35 -->|"Validate and content-address the read-only Engineer and organization-attention projections"| p1_component_engineering_overlay_primary_37afa8e8
  classDef actor fill:#111827,color:#ffffff,stroke:#f9fafb,stroke-width:2px
  classDef component fill:#075985,color:#ffffff,stroke:#bae6fd,stroke-width:2px
  classDef datastore fill:#3f6212,color:#ffffff,stroke:#d9f99d,stroke-width:2px
  classDef external fill:#7c2d12,color:#ffffff,stroke:#fed7aa,stroke-width:2px
```

- Proof: `proven` (`sha256:559d4d6312038098e0a8c276d4ab6185a5e2de6b144811876a09e78aaa920604`).
- Semantic nodes: `2`; declared relations: `1`.

### 1.2 模組職責表

| 宣告入口 | 錨點 | 職責 |
| --- | --- | --- |
| `entrypoint.engineering-overlay.collect` | `src/effects/engineers/engineering-overlay.ts#collectEngineeringBoard` | `sink.engineering-overlay.binding` → `src/effects/engineers/binding-store.ts#readEngineerBindingStatus`、`sink.engineering-overlay.claim` → `src/effects/engineers/claim-actor-store.ts#listLiveClaimActorReceiptsForEngineer`、`sink.engineering-overlay.messages` → `src/effects/engineers/module-inbox.ts#observeModuleInboxSummary`、`sink.engineering-overlay.provider-effects` → `src/effects/engineers/provider-thread-effect-store.ts#observeProviderThreadEffects`、`sink.engineering-overlay.schema` → `src/core/engineers/engineering-overlay.ts#buildEngineeringOverlaySnapshot` |
| `entrypoint.engineering-overlay.attention` | `src/core/engineers/engineering-overlay.ts#projectOrganizationAttention` | `sink.engineering-overlay.attention-schema` → `src/core/engineers/engineering-overlay.ts#validateOrganizationAttentionSnapshot` |
| `entrypoint.engineering-overlay.overlay-schema` | `src/core/engineers/engineering-overlay.ts#buildEngineeringOverlaySnapshot` | `sink.engineering-overlay.overlay-validation` → `src/core/engineers/engineering-overlay.ts#validateEngineeringOverlaySnapshot` |

### 1.3 規模信號

- 規模量級:`2–5` 個文件 / `500–1000` 行
- 匹配前綴:`src/core/engineers/engineering-overlay.ts`、`src/effects/engineers/engineering-overlay.ts`
- 推導:掃描 `source.include` 減 `source.exclude`,跳過 `.git/` 與 `node_modules/`,再按 1–2–5 階梯分桶。精確計數不入本文檔:量級足以回答「這個能力有多大」,而逐行計數會讓覆蓋範圍內任何一次源碼改動都改寫本文檔。

### 1.4 依賴邊界

出向關係:

- `calls` → `capability.runtime-harness.agent-runtime-effects` — Observe exact current runtime-effect and reconciliation states without executing or repairing an effect
- `calls` → `capability.runtime-harness.engineer-bindings` — Observe exact current Profile, Binding and live ClaimActor revisions without mutating their stores
- `calls` → `capability.runtime-harness.engineer-messages` — Observe pending and failed delivery facts from the existing ME-1C event and receipt authority
- `calls` → `component.engineering-overlay.primary` — Validate and content-address the read-only Engineer and organization-attention projections

入向關係:

- 無。

## 2. P2:端到端數據流

> **Proof**: `proven` (`sha256:559d4d6312038098e0a8c276d4ab6185a5e2de6b144811876a09e78aaa920604`); selectors `3/3`.

```mermaid
%%{init: {"theme":"base","themeVariables":{"background":"#0d1117","actorBkg":"#312e81","actorBorder":"#c4b5fd","actorTextColor":"#ffffff","signalColor":"#e5e7eb","signalTextColor":"#e5e7eb","labelBoxBkgColor":"#4c1d95","labelBoxBorderColor":"#c4b5fd","labelTextColor":"#ffffff","noteBkgColor":"#78350f","noteBorderColor":"#fcd34d","noteTextColor":"#ffffff","sequenceNumberColor":"#ffffff"}}}%%
sequenceDiagram
  autonumber
  participant p2_overlay_65dd31ba as Engineering Overlay
  participant p2_schema_a50dde9a as Engineering Overlay Read Model
  p2_overlay_65dd31ba->>p2_schema_a50dde9a: Validate and content-address the double-read result with explicit component fences
  alt Return stable， changed_during_read or degraded without changing an observed authority
  p2_overlay_65dd31ba->>p2_schema_a50dde9a: Validate and content-address organization attention from the exact overlay snapshot
    Note over p2_overlay_65dd31ba: Return read-only JSON/text projection with no authority mutation
  else Reject an illegal overlay shape or digest instead of inventing a compatible projection
  p2_overlay_65dd31ba->>p2_schema_a50dde9a: Validate the closed overlay schema and content digest before returning bytes
    Note over p2_overlay_65dd31ba: Return a typed projection error with every observed authority unchanged
  end
```
<!-- END ARCHCONTEXT:generated target="projection_target.entity.capability-runtime-harness-engineering-overlay" -->

## 3. P3:設計決策與不變量

## 4. 歷史決策記錄(append-only)

## Optimization Backlog
