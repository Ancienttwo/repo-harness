# runtime-harness/dsh-host 架構文檔

<!-- BEGIN ARCHCONTEXT:generated target="projection_target.entity.capability-runtime-harness-dsh-host" rendererVersion="archcontext.docs-renderer/v6" outputDigest="sha256:a967e2bead523995cc0467e7a5f444ea39680cf72b8055e124acfc86400c3f03" -->
> **狀態**:`active`
> **Capability ID**:`capability.runtime-harness.dsh-host`(kind `capability`)
> **Matched Prefixes**:`src/dsh/**`
> **Local Contracts**:`AGENTS.md`、`CLAUDE.md`
> **事實優先級**:倉庫當前狀態 > 本文檔機器區 > 本文檔人工區。機器區(引言、§1、§2)由 ArchContext 從架構模型與源碼度量投影生成,手改會在下次投影被覆蓋。本文檔不記錄出處;本次投影所驗證的 commit 見 `docs/architecture/.projection-manifest.json`。

Runs the repo-harness guard inside DeepSeek Harness (DSH) as a Cordis plugin and shows its denials in the DSH client.

## 1. P1:能力架構地圖

### 1.1 架構圖

```mermaid
flowchart LR
  p1_capability_runtime_harness_dsh_host_8050d95d["DSH Host Plugin"]:::component
  p1_component_dsh_host_primary_0d8179ea["DSH Guard Plugin"]:::component
  p1_capability_runtime_harness_dsh_host_8050d95d -->|"Guard a DSH tool call"| p1_component_dsh_host_primary_0d8179ea
  classDef actor fill:#111827,color:#ffffff,stroke:#f9fafb,stroke-width:2px
  classDef component fill:#075985,color:#ffffff,stroke:#bae6fd,stroke-width:2px
  classDef datastore fill:#3f6212,color:#ffffff,stroke:#d9f99d,stroke-width:2px
  classDef external fill:#7c2d12,color:#ffffff,stroke:#fed7aa,stroke-width:2px
```

- Proof: `proven` (`sha256:272b6135e2c9106db1f3641c19e8dd70aacc92b9bb2130cd1da3154ba559d9f3`).
- Semantic nodes: `2`; declared relations: `1`.

### 1.2 模組職責表

| 宣告入口 | 錨點 | 職責 |
| --- | --- | --- |
| `entrypoint.dsh-host.plugin` | `src/dsh/plugin.ts#createDshPlugin` | `sink.dsh-host.hook-bridge` → `src/dsh/bridge.ts#resolveDshBridge` |

組件入口:

- 組件均未宣告 `source.entrypoints`。

### 1.3 規模信號

- 規模量級:`5–10` 個文件 / `500–1000` 行
- 匹配前綴:`src/dsh/**`
- 推導:掃描 `source.include` 減 `source.exclude`,跳過 `.git/` 與 `node_modules/`,再按 1–2–5 階梯分桶。精確計數不入本文檔:量級足以回答「這個能力有多大」,而逐行計數會讓覆蓋範圍內任何一次源碼改動都改寫本文檔。

### 1.4 依賴邊界

出向關係:

- `depends-on` → `capability.runtime-harness.hook-adapters` — Run DSH tool calls through the shared hook bridge, route registry and hook protocol.
- `calls` → `component.dsh-host.primary` — Guard a DSH tool call

入向關係:

- `depends-on` ← `capability.verification.evals-checks` — Test DSH Host Plugin behavior through its source modules.

組件出向關係:

- `component.dsh-host.primary`:
  - 無。

### 1.5 組件結構

| 組件 | 名稱 | 規模量級 | 宣告入口 |
| --- | --- | --- | --- |
| `component.dsh-host.primary` | DSH Guard Plugin | 未宣告 `source.include` | 未宣告 |

## 2. P2:端到端數據流

> **Proof**: `proven` (`sha256:272b6135e2c9106db1f3641c19e8dd70aacc92b9bb2130cd1da3154ba559d9f3`); selectors `1/1`.

```mermaid
%%{init: {"theme":"base","themeVariables":{"background":"#0d1117","actorBkg":"#312e81","actorBorder":"#c4b5fd","actorTextColor":"#ffffff","signalColor":"#e5e7eb","signalTextColor":"#e5e7eb","labelBoxBkgColor":"#4c1d95","labelBoxBorderColor":"#c4b5fd","labelTextColor":"#ffffff","noteBkgColor":"#78350f","noteBorderColor":"#fcd34d","noteTextColor":"#ffffff","sequenceNumberColor":"#ffffff"}}}%%
sequenceDiagram
  autonumber
  participant p2_capability_4262990f as DSH Host Plugin
  participant p2_component_7b8d80ff as DSH Guard Plugin
  p2_capability_4262990f->>p2_component_7b8d80ff: Dispatch DSH Guard Plugin
  alt The hook bridge is resolved for the session
  p2_capability_4262990f->>p2_component_7b8d80ff: Resolve the packaged hook entry
    Note over p2_capability_4262990f: Return the plugin with a ready bridge
  else The hook entry is missing
  p2_capability_4262990f->>p2_component_7b8d80ff: Report DSH_HOOK_ENTRY_MISSING
    Note over p2_capability_4262990f: Return the plugin with the bridge marked unavailable
  end
```
<!-- END ARCHCONTEXT:generated target="projection_target.entity.capability-runtime-harness-dsh-host" -->

## 3. P3:設計決策與不變量

## 4. 歷史決策記錄(append-only)

## Optimization Backlog
