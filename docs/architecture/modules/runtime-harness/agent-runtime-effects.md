# runtime-harness/agent-runtime-effects 架構文檔

<!-- BEGIN ARCHCONTEXT:generated target="projection_target.entity.capability-runtime-harness-agent-runtime-effects" sourceDigest="sha256:3517aa5a8e203deb277bb407d8b87ee2ab2308d600f8bb56727e80173e14771c" rendererVersion="archcontext.docs-renderer/v4" outputDigest="sha256:092926bb2c8e9046f5a381a749e9a8214e496687c1b43f90c82359a390b37c53" -->
> **狀態**:`active`
> **Capability ID**:`capability.runtime-harness.agent-runtime-effects`(kind `capability`)
> **Matched Prefixes**:`src/core/engineers/agent-runtime-effect.ts`、`src/effects/engineers/agent-runtime-effect-store.ts`、`src/effects/engineers/agent-runtime-feature.ts`、`src/effects/engineers/agent-runtime-adapters/**`
> **Local Contracts**:`src/core/engineers/AGENTS.md`、`src/core/engineers/CLAUDE.md`
> **事實優先級**:倉庫當前狀態 > 本文檔機器區 > 本文檔人工區。機器區(引言、§1、§2)由 ArchContext 從架構模型與源碼度量投影生成,手改會在下次投影被覆蓋。本文檔不記錄出處;本次投影所驗證的 commit 見 `docs/architecture/.projection-manifest.json`。

Owns the provider-neutral, at-most-once Agent Runtime Effect V2 boundary for closed Codex App Thread and tmux CLI Agent adapters, covering inbox notification and durable task-offer wake.

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
| `entrypoint.agent-runtime-effects.wake` | `src/effects/engineers/agent-runtime-effect-store.ts#recordEngineerOfferSnapshot` | `sink.agent-runtime-effects.offer-wake-decision` → `src/core/engineers/agent-runtime-effect.ts#decideAgentRuntimeOfferWake` |
| `entrypoint.agent-runtime-effects.wake` | `src/effects/engineers/agent-runtime-effect-store.ts#recordAgentRuntimeControllerStep` | `sink.agent-runtime-effects.controller-step-receipt` → `src/core/engineers/agent-runtime-effect.ts#buildAgentRuntimeControllerStepReceipt` |
| `entrypoint.agent-runtime-effects.start` | `src/effects/engineers/agent-runtime-effect-store.ts#startAgentRuntimeEffect` | `sink.agent-runtime-effects.started-observation` → `src/core/engineers/agent-runtime-effect.ts#buildAgentRuntimeEffectObservation` |
| `entrypoint.agent-runtime-effects.observe` | `src/effects/engineers/agent-runtime-effect-store.ts#observeAgentRuntimeEffect` | `sink.agent-runtime-effects.reconciliation-observation` → `src/core/engineers/agent-runtime-effect.ts#buildAgentRuntimeEffectObservation` |
| `entrypoint.agent-runtime-effects.observe` | `src/effects/engineers/agent-runtime-effect-store.ts#receiptEvidence` | `sink.agent-runtime-effects.receipt-evidence` → `src/effects/engineers/module-inbox.ts#readModuleMessageDelivery` |

### 1.3 規模信號

- 規模量級:`5–10` 個文件 / `1000–2000` 行
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

### 3.1 兩個 operation 共用一條 effect 鏈(#281)

`AgentRuntimeOperation` 從 `notify_inbox` 擴成 `notify_inbox | wake_for_offer`,
走的是同一條 intent → effect_started → observation → current 鏈,而不是另起一套 daemon。
intent 依 operation 分岔 subject:`notify_inbox` 帶 `message_ref`,`wake_for_offer` 帶
`wake_ref`(repository_id、authorization_revision、snapshot_revision、closed reason)。
Engineer、Binding ID、generation、contract revision 只由 `endpoint_fence` 綁一次,
wake_ref 不重複承載,避免同一個事實在一份 intent 裡有兩個權威。protocol 仍是 2:
既有 `notify_inbox` intent 的 canonical bytes 一個 byte 都沒動。

### 3.2 wake 是提示,不是授權

wake host action 只帶 `repo-harness-wake:` 前綴的 bounded control reference、
repository_id、snapshot_revision 與 reason,不含 claim token、Lease、Task 或 offer body。
成功只認 `ControllerStepReceiptV2`——綁定該 effect 的 control reference、
Engineer/Binding fence 與控制器實際重讀到的 snapshot revision;
message delivery receipt 與 process exit code 都不能結案(`assertAgentRuntimeReceiptKindForOperation`
兩個方向都封閉)。醒來的控制器重讀當前 offers 與 authorization,
snapshot 已過期或空掉就是 no-op,仍算一次已送達的 wake。

### 3.3 offers 文檔是外部權威的產物,先證明再取用

`recordEngineerOfferSnapshot` 收到的 `EngineerOffersV1` 是 scheduling 權威的產物,
不是可信輸入。進 ledger 之前先過 `validateEngineerOffersDocument`(scheduling core 唯一的
整份文檔校驗器,與 `validateEngineerOffer` 並列):封閉鍵集、每個 offer 與 exclusion 都合法且屬於本文檔、
`snapshot_revision` 用相同 basis 重算。摘要蓋在陣列本身,所以改欄位、換順序、偽造 revision 都在這裡失敗。
通過之後再打兩道 fence:文檔的 `repository_id` 必須等於本 worktree 解析出的註冊倉庫,
每個 offer 的 `binding_id`/`binding_generation`/`engineer_contract_revision` 必須等於**當前** Binding——
舊 Binding 世代收集的 snapshot 只會被拒絕,永遠不會被重新綁到當前 Binding 上。

### 3.4 每個 Binding 一個 wake 指針

`wakes/<sha256(engineer\0binding\0generation)>.json` 是該 Binding 的耐久 ledger:
上一次消費的 offer 投影 + 唯一的 pending wake 指針 + coalescing 窗口。
只有 empty→eligible 這個確切轉換會 arm wake;同一個 snapshot 重複觀測不寫盤;
任何換到另一個仍有 eligible work 的 snapshot 都算 due——包括 A→B 這種本來就 eligible 的變化——
所以最新 revision 不會丟;更新的 snapshot 只在舊 wake 尚未 start 時取代它
(繼承原本的 `requested_at`/`coalesce_until`,所以窗口有界、不會被連續變更推著走);
已 start 的 wake 不被取代,也不會開第二個並行 wake。
被取代的 intent 會在自己的鏈上寫入終態 `superseded`(只能從 `intent_persisted` 到達),
不是留在 `intent_persisted` 讓 ledger 指針去解釋——因此每個 Binding 任何時刻只有一個非終態 wake,
Board projection 不必讀 ledger 就與指針一致,重啟一個 superseded wake 是明確報錯而不是靜默無動作。
沒有無限重試面:同一個 snapshot 的 idempotency key 固定,失敗後除非 offers 再次變化不會自動重來
(retry 屬於 attempt receipt 的權威)。

### 3.5 wake 的線性化點只有一個

wake ledger lock 與 per-effect lock 之前各自為政,supersession 與 start 之間有 TOCTOU:
observer 讀完舊 effect 後放鎖,starter 可以在新 ledger 發佈前啟動舊 wake。
現在**所有** wake 變更——arm/supersede、start、observe、controller-step receipt——
都先取 per-Binding wake lock 再取 effect lock,鎖序全域單向 wake → effect;
`assertWakeStartable` 在該鎖內讀 ledger,所以那次讀就是線性化點而不是提示。
`startAgentRuntimeEffect` 靠無鎖 peek intent(write-once + fsync,不可變)決定要不要取 wake lock。

跨權威的 fence(Binding、capability observation、authorization revision)不歸這把鎖管,
它們可能在檢查通過之後、`effect_started` 落盤之前提交。所以 start 在 append 之後**再讀一次**同樣的 fence:
不成立就寫 `observed_failure`(`binding_stale` / `capability_unsupported` / `authorization_stale`)並回傳 `action: null`。
host action 只在 fence 於「落盤前」與「落盤後」都成立時才交出去。

### 3.6 崩潰重放不會卡死一個 wake

intent 先寫、ledger 後發佈,兩者之間崩潰時 `created_at` 用的是本 store 的時鐘,
逐位元組比對會讓同一個 snapshot 的重放永久 conflict。重放比對的是**身分**而非位元組:
同一把 idempotency key、同一個 endpoint fence、同一個 wake subject 即視為同一個 intent 並接續;
其餘仍然 fail closed。

### 3.7 訂閱面在 effect 層

`listDueOfferWakes` / `subscribeToOfferWakes` 讀 ledger 與 effect current,
由呼叫方提供時鐘、回傳 bounded 事件,非互動控制器不經 CLI 即可消費。
ledger 用 atomic replace 發布,讀取不取鎖,因此不會反向持有 effect lock 去要 wake lock。

## 4. 歷史決策記錄(append-only)

## Optimization Backlog
