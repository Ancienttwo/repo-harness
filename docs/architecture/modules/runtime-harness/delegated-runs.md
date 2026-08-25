# runtime-harness/delegated-runs 架構文檔

<!-- BEGIN ARCHCONTEXT:generated target="projection_target.entity.capability-runtime-harness-delegated-runs" sourceDigest="sha256:b45e9abc2c6cccd9f49f5b67129a5ba9a7b55692683f403153843863f8bef0f4" rendererVersion="archcontext.docs-renderer/v4" outputDigest="sha256:76441cf622e8d7c32c62fc2ebd3a38f9b290a6875c441c8d168a5375ffee1bec" -->
> **狀態**:`active`
> **Capability ID**:`capability.runtime-harness.delegated-runs`(kind `capability`)
> **Matched Prefixes**:`src/core/engineers/delegation.ts`、`src/effects/engineers/delegated-run-store.ts`、`src/cli/commands/delegation.ts`
> **Local Contracts**:`AGENTS.md`、`CLAUDE.md`
> **事實優先級**:倉庫當前狀態 > 本文檔機器區 > 本文檔人工區。機器區(引言、§1、§2)由 ArchContext 從架構模型與源碼度量投影生成,手改會在下次投影被覆蓋。本文檔不記錄出處;本次投影所驗證的 commit 見 `docs/architecture/.projection-manifest.json`。

Admits one logical Role Profile against current Engineer authority and journals at most one Codex CLI read-only host action as untrusted evidence.

## 1. P1:能力架構地圖

### 1.1 架構圖

```mermaid
flowchart LR
  p1_capability_runtime_harness_delegated_runs_e1654b07["Read-only Delegated Runs"]:::component
  p1_capability_runtime_harness_engineer_bindings_34c00f72["Engineer Bindings"]:::component
  p1_component_delegated_runs_primary_0e9104c9["Read-only Delegated Run Journal"]:::component
  p1_capability_runtime_harness_delegated_runs_e1654b07 -->|"Revalidate the exact current parent ClaimActorReceipt， WorkEnvelope and Engineer Binding before delegation admission"| p1_capability_runtime_harness_engineer_bindings_34c00f72
  p1_capability_runtime_harness_delegated_runs_e1654b07 -->|"Persist immutable capability， admission， launch， process and result evidence without creating runtime or task authority"| p1_component_delegated_runs_primary_0e9104c9
  classDef actor fill:#111827,color:#ffffff,stroke:#f9fafb,stroke-width:2px
  classDef component fill:#075985,color:#ffffff,stroke:#bae6fd,stroke-width:2px
  classDef datastore fill:#3f6212,color:#ffffff,stroke:#d9f99d,stroke-width:2px
  classDef external fill:#7c2d12,color:#ffffff,stroke:#fed7aa,stroke-width:2px
```

- Proof: `proven` (`sha256:ba1eee35301496400c16d4811f5d155bffb67cda455acdb73e7ffae965875c0c`).
- Semantic nodes: `3`; declared relations: `2`.

### 1.2 模組職責表

| 宣告入口 | 錨點 | 職責 |
| --- | --- | --- |
| `entrypoint.delegated-runs.parent-authority` | `src/effects/engineers/delegated-run-store.ts#validateDelegationParent` | `sink.delegated-runs.parent-authority` → `src/effects/engineers/claim-actor-store.ts#validateClaimActorReceiptLive` |
| `entrypoint.delegated-runs.intent` | `src/effects/engineers/delegated-run-store.ts#persistIntent` | `sink.delegated-runs.intent-schema` → `src/core/engineers/delegation.ts#canonicalDelegatedRunIntentBytes` |
| `entrypoint.delegated-runs.observation` | `src/effects/engineers/delegated-run-store.ts#appendObservation` | `sink.delegated-runs.observation` → `src/core/engineers/delegation.ts#buildDelegatedRunObservation` |
| `entrypoint.delegated-runs.result` | `src/effects/engineers/delegated-run-store.ts#persistResult` | `sink.delegated-runs.worker-result` → `src/core/engineers/delegation.ts#canonicalWorkerResultBytes` |

### 1.3 規模信號

- 規模量級:`2–5` 個文件 / `1000–2000` 行
- 匹配前綴:`src/core/engineers/delegation.ts`、`src/effects/engineers/delegated-run-store.ts`、`src/cli/commands/delegation.ts`
- 推導:掃描 `source.include` 減 `source.exclude`,跳過 `.git/` 與 `node_modules/`,再按 1–2–5 階梯分桶。精確計數不入本文檔:量級足以回答「這個能力有多大」,而逐行計數會讓覆蓋範圍內任何一次源碼改動都改寫本文檔。

### 1.4 依賴邊界

出向關係:

- `calls` → `capability.runtime-harness.engineer-bindings` — Revalidate the exact current parent ClaimActorReceipt, WorkEnvelope and Engineer Binding before delegation admission
- `calls` → `component.delegated-runs.primary` — Persist immutable capability, admission, launch, process and result evidence without creating runtime or task authority

入向關係:

- 無。

## 2. P2:端到端數據流

> **Proof**: `proven` (`sha256:ba1eee35301496400c16d4811f5d155bffb67cda455acdb73e7ffae965875c0c`); selectors `4/4`.

```mermaid
%%{init: {"theme":"base","themeVariables":{"background":"#0d1117","actorBkg":"#312e81","actorBorder":"#c4b5fd","actorTextColor":"#ffffff","signalColor":"#e5e7eb","signalTextColor":"#e5e7eb","labelBoxBkgColor":"#4c1d95","labelBoxBorderColor":"#c4b5fd","labelTextColor":"#ffffff","noteBkgColor":"#78350f","noteBorderColor":"#fcd34d","noteTextColor":"#ffffff","sequenceNumberColor":"#ffffff"}}}%%
sequenceDiagram
  autonumber
  participant p2_delegated_run_journal_781391f9 as Read-only Delegated Runs
  participant p2_binding_authority_b56d10c4 as Engineer Bindings
  participant p2_delegated_run_schema_0652b33a as Read-only Delegated Run Journal
  p2_delegated_run_journal_781391f9->>p2_binding_authority_b56d10c4: Revalidate current Task， Lease， WorkEnvelope， Engineer Binding and ClaimActorReceipt fences before admission
  p2_delegated_run_journal_781391f9->>p2_delegated_run_schema_0652b33a: Canonicalize and persist the immutable admitted run intent before any Host action
  alt One immutable launch claim admits at most one read-only host action and returns only untrusted receipt-bound evidence
  p2_delegated_run_journal_781391f9->>p2_delegated_run_schema_0652b33a: Bind the completed observation and bounded/redacted immutable process evidence into WorkerResult without authority mutation
    Note over p2_delegated_run_journal_781391f9: Return completed observation and untrusted result； no Task or Acceptance transition
  else Lost acknowledgement， stale authority or protected-state drift fails closed without another host action
  p2_delegated_run_journal_781391f9->>p2_delegated_run_schema_0652b33a: Append reconciliation_required or failed observation under the existing launch claim
    Note over p2_delegated_run_journal_781391f9: Return reconcile-only state and never retry or substitute a runtime
  end
```
<!-- END ARCHCONTEXT:generated target="projection_target.entity.capability-runtime-harness-delegated-runs" -->

## 3. P3:設計決策與不變量

## 4. 歷史決策記錄(append-only)

## Optimization Backlog
