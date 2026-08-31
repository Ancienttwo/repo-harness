# runtime-harness/agent-runtime-effects 架構文檔

<!-- BEGIN ARCHCONTEXT:generated target="projection_target.entity.capability-runtime-harness-agent-runtime-effects" sourceDigest="sha256:ac4f132b11344961f5e367ab35c32f9b4ab66b86068042f0747383cf992d81fb" rendererVersion="archcontext.docs-renderer/v4" outputDigest="sha256:89dfc817809be4f206c133ec77607395fe409ede91dfb53dda90a2579e0f75c9" -->
> **狀態**:`active`
> **Capability ID**:`capability.runtime-harness.agent-runtime-effects`(kind `capability`)
> **Matched Prefixes**:`src/core/engineers/agent-runtime-effect.ts`、`src/effects/engineers/agent-runtime-effect-store.ts`、`src/effects/engineers/agent-runtime-feature.ts`、`src/effects/engineers/agent-runtime-adapters/**`
> **Local Contracts**:`AGENTS.md`、`CLAUDE.md`
> **事實優先級**:倉庫當前狀態 > 本文檔機器區 > 本文檔人工區。機器區(引言、§1、§2)由 ArchContext 從架構模型與源碼度量投影生成,手改會在下次投影被覆蓋。本文檔不記錄出處;本次投影所驗證的 commit 見 `docs/architecture/.projection-manifest.json`。

Owns the provider-neutral, at-most-once Agent Runtime Effect V2 boundary for closed Codex App Thread and tmux CLI Agent adapters.

## 1. P1:能力架構地圖

### 1.1 架構圖

```mermaid
flowchart LR
  p1_capability_runtime_harness_agent_runtime_effects_f1bcf433["Agent Runtime Effects"]:::component
  p1_capability_runtime_harness_engineer_bindings_34c00f72["Engineer Bindings"]:::component
  p1_capability_runtime_harness_engineer_messages_f10d1d17["Engineer Messages"]:::component
  p1_component_agent_runtime_effects_journal_f6727f8f["Agent Runtime Effect Journal"]:::component
  p1_capability_runtime_harness_agent_runtime_effects_f1bcf433 -->|"Revalidate the exact current Engineer Binding endpoint before preparing or admitting one Host adapter action"| p1_capability_runtime_harness_engineer_bindings_34c00f72
  p1_capability_runtime_harness_agent_runtime_effects_f1bcf433 -->|"Consume one exact persisted message and record effect success only from its authoritative receipt"| p1_capability_runtime_harness_engineer_messages_f10d1d17
  p1_capability_runtime_harness_agent_runtime_effects_f1bcf433 -->|"Persist immutable effect intents and observations before one closed Host action or a reconcile-only state can be returned"| p1_component_agent_runtime_effects_journal_f6727f8f
  p1_capability_runtime_harness_engineer_messages_f10d1d17 -->|"Revalidate the exact target Engineer and current Binding before assignment delivery， transport and acknowledgement"| p1_capability_runtime_harness_engineer_bindings_34c00f72
  classDef actor fill:#111827,color:#ffffff,stroke:#f9fafb,stroke-width:2px
  classDef component fill:#075985,color:#ffffff,stroke:#bae6fd,stroke-width:2px
  classDef datastore fill:#3f6212,color:#ffffff,stroke:#d9f99d,stroke-width:2px
  classDef external fill:#7c2d12,color:#ffffff,stroke:#fed7aa,stroke-width:2px
```

- Proof: `proven` (`sha256:e466b6ca52dfbcc6e27d20584f7a353fe21bfee2b1694a9816130e992db82187`).
- Semantic nodes: `4`; declared relations: `4`.

### 1.2 模組職責表

| 宣告入口 | 錨點 | 職責 |
| --- | --- | --- |
| `entrypoint.agent-runtime-effects.prepare` | `src/effects/engineers/agent-runtime-effect-store.ts#currentBinding` | `sink.agent-runtime-effects.current-binding` → `src/effects/engineers/binding-store.ts#readEngineerBindingStatus` |
| `entrypoint.agent-runtime-effects.prepare` | `src/effects/engineers/agent-runtime-effect-store.ts#moduleReference` | `sink.agent-runtime-effects.persisted-message` → `src/effects/engineers/module-inbox.ts#readModuleMessageDelivery` |
| `entrypoint.agent-runtime-effects.prepare` | `src/effects/engineers/agent-runtime-effect-store.ts#taskEndpointAndReference` | `sink.agent-runtime-effects.persisted-task-message` → `src/effects/fleet/task-inbox.ts#readTaskMessageDelivery` |
| `entrypoint.agent-runtime-effects.start` | `src/effects/engineers/agent-runtime-effect-store.ts#startAgentRuntimeEffect` | `sink.agent-runtime-effects.started-observation` → `src/core/engineers/agent-runtime-effect.ts#buildAgentRuntimeEffectObservation` |
| `entrypoint.agent-runtime-effects.observe` | `src/effects/engineers/agent-runtime-effect-store.ts#observeAgentRuntimeEffect` | `sink.agent-runtime-effects.reconciliation-observation` → `src/core/engineers/agent-runtime-effect.ts#buildAgentRuntimeEffectObservation` |
| `entrypoint.agent-runtime-effects.observe` | `src/effects/engineers/agent-runtime-effect-store.ts#receiptEvidence` | `sink.agent-runtime-effects.receipt-evidence` → `src/effects/engineers/module-inbox.ts#readModuleMessageDelivery` |

### 1.3 規模信號

- 規模量級:`5–10` 個文件 / `500–1000` 行
- 匹配前綴:`src/core/engineers/agent-runtime-effect.ts`、`src/effects/engineers/agent-runtime-effect-store.ts`、`src/effects/engineers/agent-runtime-feature.ts`、`src/effects/engineers/agent-runtime-adapters/**`
- 推導:掃描 `source.include` 減 `source.exclude`,跳過 `.git/` 與 `node_modules/`,再按 1–2–5 階梯分桶。精確計數不入本文檔:量級足以回答「這個能力有多大」,而逐行計數會讓覆蓋範圍內任何一次源碼改動都改寫本文檔。

### 1.4 依賴邊界

出向關係:

- `calls` → `capability.runtime-harness.engineer-bindings` — Revalidate the exact current Engineer Binding endpoint before preparing or admitting one Host adapter action
- `calls` → `capability.runtime-harness.engineer-messages` — Consume one exact persisted message and record effect success only from its authoritative receipt
- `calls` → `component.agent-runtime-effects.journal` — Persist immutable effect intents and observations before one closed Host action or a reconcile-only state can be returned

入向關係:

- `calls` ← `capability.runtime-harness.engineering-overlay` — Observe exact current runtime-effect and reconciliation states without executing or repairing an effect
- `calls` ← `capability.runtime-harness.mcp-sidecar` — Expose read-only runtime capability and current-effect projections to the authenticated Engineer without Host mutation authority

## 2. P2:端到端數據流

> **Proof**: `proven` (`sha256:e466b6ca52dfbcc6e27d20584f7a353fe21bfee2b1694a9816130e992db82187`); selectors `4/4`.

```mermaid
%%{init: {"theme":"base","themeVariables":{"background":"#0d1117","actorBkg":"#312e81","actorBorder":"#c4b5fd","actorTextColor":"#ffffff","signalColor":"#e5e7eb","signalTextColor":"#e5e7eb","labelBoxBkgColor":"#4c1d95","labelBoxBorderColor":"#c4b5fd","labelTextColor":"#ffffff","noteBkgColor":"#78350f","noteBorderColor":"#fcd34d","noteTextColor":"#ffffff","sequenceNumberColor":"#ffffff"}}}%%
sequenceDiagram
  autonumber
  participant p2_effect_journal_1eea3f14 as Agent Runtime Effects
  participant p2_binding_authority_b56d10c4 as Engineer Bindings
  participant p2_message_authority_43d726e6 as Engineer Messages
  participant p2_effect_schema_e2bdceda as Agent Runtime Effect Journal
  p2_effect_journal_1eea3f14->>p2_message_authority_43d726e6: Read the exact persisted Module or Task message and its current delivery fact before action admission
  p2_effect_journal_1eea3f14->>p2_binding_authority_b56d10c4: Revalidate Binding generation， Host， endpoint and contract revision
  alt One immutable intent admits at most one Host action and exact receipt evidence closes the observation chain
  p2_effect_journal_1eea3f14->>p2_message_authority_43d726e6: Consume the exact authoritative delivery receipt before recording effect success
    Note over p2_effect_journal_1eea3f14: Return terminal effect current and no further Host action
  else Lost acknowledgement or ambiguous Host facts remain reconciliation_required without retry
  p2_effect_journal_1eea3f14->>p2_effect_schema_e2bdceda: Persist reconciliation_required in the immutable effect chain while leaving the authoritative receipt unchanged
    Note over p2_effect_journal_1eea3f14: Return reconcile-only state and no Host action
  end
```
<!-- END ARCHCONTEXT:generated target="projection_target.entity.capability-runtime-harness-agent-runtime-effects" -->

## 3. P3:設計決策與不變量

## 4. 歷史決策記錄(append-only)

## Optimization Backlog
