# runtime-harness/development-campaign 架構文檔

<!-- BEGIN ARCHCONTEXT:generated target="projection_target.entity.capability-runtime-harness-development-campaign" sourceDigest="sha256:59b65341f1a2e1887330a8cff3c84c3e6a75e9ab11dc7c884321d4a6546bb4df" rendererVersion="archcontext.docs-renderer/v4" outputDigest="sha256:a8a93bd62327286262292f3bccc9ed435e5bc08f17ab1a040644a1b8fb30b1c5" -->
> **狀態**:`active`
> **Capability ID**:`capability.runtime-harness.development-campaign`(kind `capability`)
> **Matched Prefixes**:`src/core/automation/development-campaign.ts`、`src/effects/automation/development-campaign-policy.ts`、`src/effects/automation/development-campaign-store.ts`、`src/cli/commands/campaign.ts`
> **Local Contracts**:`AGENTS.md`、`CLAUDE.md`
> **事實優先級**:倉庫當前狀態 > 本文檔機器區 > 本文檔人工區。機器區(引言、§1、§2)由 ArchContext 從架構模型與源碼度量投影生成,手改會在下次投影被覆蓋。本文檔不記錄出處;本次投影所驗證的 commit 見 `docs/architecture/.projection-manifest.json`。

Owns the host-authorized, policy-bounded campaign journal that will route externally authored repair Issues into existing execution authorities without replacing them.

## 1. P1:能力架構地圖

### 1.1 架構圖

```mermaid
flowchart LR
  p1_capability_runtime_harness_development_campaign_db01be65["Development Campaign"]:::component
  p1_component_development_campaign_journal_b980c208["Development Campaign Journal"]:::component
  p1_capability_runtime_harness_development_campaign_db01be65 -->|"Bind a host-owned campaign grant to target-base policy and publish only canonical serialized campaign events and their rebuildable projection"| p1_component_development_campaign_journal_b980c208
  classDef actor fill:#111827,color:#ffffff,stroke:#f9fafb,stroke-width:2px
  classDef component fill:#075985,color:#ffffff,stroke:#bae6fd,stroke-width:2px
  classDef datastore fill:#3f6212,color:#ffffff,stroke:#d9f99d,stroke-width:2px
  classDef external fill:#7c2d12,color:#ffffff,stroke:#fed7aa,stroke-width:2px
```

- Proof: `proven` (`sha256:06733d36e2a0c0121a5150ca2c5f1deabfaa8b86c1d2817cde505bf021be5b1b`).
- Semantic nodes: `2`; declared relations: `1`.

### 1.2 模組職責表

| 宣告入口 | 錨點 | 職責 |
| --- | --- | --- |
| `entrypoint.development-campaign.lifecycle` | `src/cli/commands/campaign.ts#runCampaignStart` | `sink.development-campaign.create` → `src/effects/automation/development-campaign-store.ts#createDevelopmentCampaign` |
| `entrypoint.development-campaign.lifecycle` | `src/cli/commands/campaign.ts#runCampaignTransition` | `sink.development-campaign.append` → `src/effects/automation/development-campaign-store.ts#appendDevelopmentCampaignEvent` |
| `entrypoint.development-campaign.lifecycle` | `src/cli/commands/campaign.ts#runCampaignStatus` | `sink.development-campaign.status` → `src/effects/automation/development-campaign-store.ts#readDevelopmentCampaignStatus` |

### 1.3 規模信號

- 規模量級:`2–5` 個文件 / `500–1000` 行
- 匹配前綴:`src/core/automation/development-campaign.ts`、`src/effects/automation/development-campaign-policy.ts`、`src/effects/automation/development-campaign-store.ts`、`src/cli/commands/campaign.ts`
- 推導:掃描 `source.include` 減 `source.exclude`,跳過 `.git/` 與 `node_modules/`,再按 1–2–5 階梯分桶。精確計數不入本文檔:量級足以回答「這個能力有多大」,而逐行計數會讓覆蓋範圍內任何一次源碼改動都改寫本文檔。

### 1.4 依賴邊界

出向關係:

- `depends_on` → `capability.runtime-harness.automation-budget` — Consume the existing host-owned ProgramAuthorizationV1 grant identity without minting or widening automation authority
- `depends_on` → `capability.runtime-harness.collaboration` — Reserve the existing fenced delegated-run boundary as the only later campaign dispatch path
- `depends_on` → `capability.runtime-harness.engineer-scheduling` — Reserve the existing Work Graph and acquire chain as the only later campaign execution path
- `depends_on` → `capability.runtime-harness.external-source-intake` — Require the established external Issue intake policy before campaign startup without acquiring provider mutation authority
- `depends_on` → `capability.runtime-harness.integration-acceptance` — Observe existing acceptance and publication projections later without creating a second acceptance or merge authority
- `calls` → `component.development-campaign.journal` — Bind a host-owned campaign grant to target-base policy and publish only canonical serialized campaign events and their rebuildable projection

入向關係:

- 無。

## 2. P2:端到端數據流

> **Proof**: `proven` (`sha256:06733d36e2a0c0121a5150ca2c5f1deabfaa8b86c1d2817cde505bf021be5b1b`); selectors `2/2`.

```mermaid
%%{init: {"theme":"base","themeVariables":{"background":"#0d1117","actorBkg":"#312e81","actorBorder":"#c4b5fd","actorTextColor":"#ffffff","signalColor":"#e5e7eb","signalTextColor":"#e5e7eb","labelBoxBkgColor":"#4c1d95","labelBoxBorderColor":"#c4b5fd","labelTextColor":"#ffffff","noteBkgColor":"#78350f","noteBorderColor":"#fcd34d","noteTextColor":"#ffffff","sequenceNumberColor":"#ffffff"}}}%%
sequenceDiagram
  autonumber
  participant p2_operator_97b83da8 as Development Campaign
  participant p2_journal_6b53b807 as Development Campaign Journal
  p2_operator_97b83da8->>p2_journal_6b53b807: Bind the stored ProgramAuthorization campaign payload to exact target-base policy and append the authorized event
  alt Rebuild current from the immutable event chain
  p2_operator_97b83da8->>p2_journal_6b53b807: Validate the definition and every event before accepting the current projection
    Note over p2_operator_97b83da8: Return canonical definition， events， and current projection
  else Disabled policy， unavailable intake， stale grant， exceeded limits， or conflicting replay fails closed
  p2_operator_97b83da8->>p2_journal_6b53b807: Reject before publishing a new event or projection
    Note over p2_operator_97b83da8: Observe a non-zero typed failure with no synthesized campaign state
  end
```
<!-- END ARCHCONTEXT:generated target="projection_target.entity.capability-runtime-harness-development-campaign" -->

## 3. P3:設計決策與不變量

## 4. 歷史決策記錄(append-only)

## Optimization Backlog
