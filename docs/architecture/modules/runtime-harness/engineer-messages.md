# runtime-harness/engineer-messages 架構文檔

<!-- BEGIN ARCHCONTEXT:generated target="projection_target.entity.capability-runtime-harness-engineer-messages" sourceDigest="sha256:df774446ad4c71c9cf53661368cac6235e624ccb858d40d4fe4934b7862931d0" rendererVersion="archcontext.docs-renderer/v4" outputDigest="sha256:4670b5c9de8566346eb3eddfab86672b5c430ee2c096caafa6c707e150c4b10c" -->
> **狀態**:`active`
> **Capability ID**:`capability.runtime-harness.engineer-messages`(kind `capability`)
> **Matched Prefixes**:`src/core/messages/mechanics.ts`、`src/core/engineers/module-message.ts`、`src/effects/engineers/module-inbox.ts`
> **Local Contracts**:`AGENTS.md`、`CLAUDE.md`
> **事實優先級**:倉庫當前狀態 > 本文檔機器區 > 本文檔人工區。機器區(引言、§1、§2)由 ArchContext 從架構模型與源碼度量投影生成,手改會在下次投影被覆蓋。本文檔不記錄出處;本次投影所驗證的 commit 見 `docs/architecture/.projection-manifest.json`。

Persists closed Module Engineer messages and binding-fenced delivery state before any optional Provider transport observation.

## 1. P1:能力架構地圖

### 1.1 架構圖

```mermaid
flowchart LR
  p1_capability_runtime_harness_engineer_bindings_34c00f72["Engineer Bindings"]:::component
  p1_capability_runtime_harness_engineer_messages_f10d1d17["Engineer Messages"]:::component
  p1_component_engineer_messages_primary_96d07b30["Module Engineer Durable Inbox"]:::component
  p1_capability_runtime_harness_engineer_messages_f10d1d17 -->|"Revalidate the exact target Engineer and current Binding before assignment delivery， transport and acknowledgement"| p1_capability_runtime_harness_engineer_bindings_34c00f72
  classDef actor fill:#111827,color:#ffffff,stroke:#f9fafb,stroke-width:2px
  classDef component fill:#075985,color:#ffffff,stroke:#bae6fd,stroke-width:2px
  classDef datastore fill:#3f6212,color:#ffffff,stroke:#d9f99d,stroke-width:2px
  classDef external fill:#7c2d12,color:#ffffff,stroke:#fed7aa,stroke-width:2px
```

- Proof: `proven` (`sha256:810402b8f02ac70757a56d84fa51ced9f2901a8e9292d6d6196668ddf5561f2f`).
- Semantic nodes: `3`; declared relations: `1`.

### 1.2 模組職責表

| 宣告入口 | 錨點 | 職責 |
| --- | --- | --- |
| `entrypoint.engineer-messages.send` | `src/effects/engineers/module-inbox.ts#sendModuleMessage` | `sink.engineer-messages.current-binding` → `src/effects/engineers/binding-store.ts#readEngineerBindingStatus` |
| `entrypoint.engineer-messages.acknowledge` | `src/effects/engineers/module-inbox.ts#acknowledgeModuleMessage` | `sink.engineer-messages.resource-bytes` → `src/effects/engineers/module-inbox.ts#verifyModuleMessageResources` |
| `entrypoint.engineer-messages.binding-fence` | `src/effects/engineers/module-inbox.ts#validateTarget` | `sink.engineer-messages.binding-fence` → `src/effects/engineers/binding-store.ts#readEngineerBindingStatus` |

### 1.3 規模信號

- 規模量級:`2–5` 個文件 / `1000–2000` 行
- 匹配前綴:`src/core/messages/mechanics.ts`、`src/core/engineers/module-message.ts`、`src/effects/engineers/module-inbox.ts`
- 推導:掃描 `source.include` 減 `source.exclude`,跳過 `.git/` 與 `node_modules/`,再按 1–2–5 階梯分桶。精確計數不入本文檔:量級足以回答「這個能力有多大」,而逐行計數會讓覆蓋範圍內任何一次源碼改動都改寫本文檔。

### 1.4 依賴邊界

出向關係:

- `calls` → `capability.runtime-harness.engineer-bindings` — Revalidate the exact target Engineer and current Binding before assignment delivery, transport and acknowledgement

入向關係:

- `calls` ← `capability.runtime-harness.mcp-sidecar` — Expose authenticated Engineer message send, list and acknowledgement without granting generic Fleet or Provider authority

## 2. P2:端到端數據流

> **Proof**: `proven` (`sha256:810402b8f02ac70757a56d84fa51ced9f2901a8e9292d6d6196668ddf5561f2f`); selectors `1/1`.

```mermaid
%%{init: {"theme":"base","themeVariables":{"background":"#0d1117","actorBkg":"#312e81","actorBorder":"#c4b5fd","actorTextColor":"#ffffff","signalColor":"#e5e7eb","signalTextColor":"#e5e7eb","labelBoxBkgColor":"#4c1d95","labelBoxBorderColor":"#c4b5fd","labelTextColor":"#ffffff","noteBkgColor":"#78350f","noteBorderColor":"#fcd34d","noteTextColor":"#ffffff","sequenceNumberColor":"#ffffff"}}}%%
sequenceDiagram
  autonumber
  participant p2_message_authority_43d726e6 as Engineer Messages
  participant p2_binding_authority_b56d10c4 as Engineer Bindings
  p2_message_authority_43d726e6->>p2_binding_authority_b56d10c4: Resolve the exact current Engineer and assignment Binding fences
  alt Immutable event and pending receipt exist before optional delivery and digest-gated acknowledgement
  p2_message_authority_43d726e6->>p2_binding_authority_b56d10c4: Persist canonical event and receipt before returning the current delivery state
    Note over p2_message_authority_43d726e6: Return canonical event and current receipt
  else Stale Binding， persistence， transport observation， resource digest or transition validation fails closed
  p2_message_authority_43d726e6->>p2_binding_authority_b56d10c4: Preserve the last durable state and return typed refusal
    Note over p2_message_authority_43d726e6: Preserve durable state and return typed refusal
  end
```
<!-- END ARCHCONTEXT:generated target="projection_target.entity.capability-runtime-harness-engineer-messages" -->

## 3. P3:設計決策與不變量

## 4. 歷史決策記錄(append-only)

## Optimization Backlog
