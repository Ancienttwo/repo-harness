# organization/publication 架構文檔

<!-- BEGIN ARCHCONTEXT:generated target="projection_target.entity.capability-organization-publication" rendererVersion="archcontext.docs-renderer/v6" outputDigest="sha256:1cba9ca2a06c0d432bc9e84da9fa1d57f429e588725adf7ae9af1a07f66dcdaa" -->
> **狀態**:`active`
> **Capability ID**:`capability.organization.publication`(kind `capability`)
> **Matched Prefixes**:`src/core/publication/**`、`src/effects/publication/**`、`src/cli/commands/publication.ts`
> **Local Contracts**:`AGENTS.md`、`CLAUDE.md`
> **事實優先級**:倉庫當前狀態 > 本文檔機器區 > 本文檔人工區。機器區(引言、§1、§2)由 ArchContext 從架構模型與源碼度量投影生成,手改會在下次投影被覆蓋。本文檔不記錄出處;本次投影所驗證的 commit 見 `docs/architecture/.projection-manifest.json`。

Reads historical publication receipts, derives fenced PR readiness and records manual provider feedback without changing task ownership.

## 1. P1:能力架構地圖

### 1.1 架構圖

```mermaid
flowchart LR
  p1_capability_organization_publication_44355620["Publication Observations"]:::component
  p1_component_publication_primary_d7ca6a90["Publication Record and Readiness Readers"]:::component
  p1_component_publication_provider_feedback_f0705608["Provider Feedback"]:::component
  p1_capability_organization_publication_44355620 -->|"Read historical publication records and derive fenced PR readiness without task ownership mutation"| p1_component_publication_primary_d7ca6a90
  p1_component_publication_provider_feedback_f0705608 -->|"Read the current receipt and lifecycle pointer before feedback intake and repair projection"| p1_component_publication_primary_d7ca6a90
  classDef actor fill:#111827,color:#ffffff,stroke:#f9fafb,stroke-width:2px
  classDef component fill:#075985,color:#ffffff,stroke:#bae6fd,stroke-width:2px
  classDef datastore fill:#3f6212,color:#ffffff,stroke:#d9f99d,stroke-width:2px
  classDef external fill:#7c2d12,color:#ffffff,stroke:#fed7aa,stroke-width:2px
```

- Proof: `proven` (`sha256:7278b2713f9ba291f0004c6f20ed96ce52c81dd3274b1367d5c7818f248a38ba`).
- Semantic nodes: `3`; declared relations: `2`.

### 1.2 模組職責表

| 宣告入口 | 錨點 | 職責 |
| --- | --- | --- |
| `entrypoint.publication.command` | `src/cli/commands/publication.ts#buildPublicationCommand` | `sink.publication.readiness` → `src/effects/publication/merge-readiness.ts#resolvePublicationReadiness` |

組件入口:

- 組件均未宣告 `source.entrypoints`。

### 1.3 規模信號

- 規模量級:`10–20` 個文件 / `2000–5000` 行
- 匹配前綴:`src/core/publication/**`、`src/effects/publication/**`、`src/cli/commands/publication.ts`
- 推導:掃描 `source.include` 減 `source.exclude`,跳過 `.git/` 與 `node_modules/`,再按 1–2–5 階梯分桶。精確計數不入本文檔:量級足以回答「這個能力有多大」,而逐行計數會讓覆蓋範圍內任何一次源碼改動都改寫本文檔。

### 1.4 依賴邊界

出向關係:

- `calls` → `capability.workflow-engine.contract-assets` — Read integration proof through the packaged worktree merge helper
- `depends-on` → `capability.verification.acceptance-review` — Read the acceptance receipt for publication evidence.
- `calls` → `component.publication.primary` — Read historical publication records and derive fenced PR readiness without task ownership mutation

入向關係:

- `depends-on` ← `capability.workflow-engine.contract-assets` — Read publication merge readiness from the merge helper.
- `reads` ← `capability.runtime-harness.engineer-scheduling` — Read cached publication receipts as dependency authority
- `depends-on` ← `capability.verification.evals-checks` — Test PR Publication behavior through its source modules.
- `calls` ← `component.global-runtime-reconciliation.cli-root` — Register the publication command
- `reads` ← `capability.runtime-harness.integration-acceptance` — Read cached immutable publication receipts and reuse their canonical JSON digest
- `calls` ← `component.mcp-sidecar.primary` — Reopen and take over publications and read merge readiness
- `depends-on` ← `capability.runtime-harness.operator` — Use publication readiness types in the Operator fixture.
- `calls` ← `capability.organization.task-fleet` — Read publication receipts readiness and provider feedback for fleet commands and board cards
- `depends-on` ← `capability.workflow-engine.workflow-state` — Read publication receipts for coordination worktree topology.

組件出向關係:

- `component.publication.primary`:
  - `calls` → `capability.workflow-engine.execution-primitives` — Read the worktree topology and the Git common directory
  - `calls` → `capability.workflow-engine.workflow-state` — Read historical leases and the board to validate publication observations
- `component.publication.provider-feedback`:
  - `calls` → `capability.workflow-engine.execution-primitives` — Resolve the Git common directory for feedback records
  - `calls` → `component.publication.primary` — Read the current receipt and lifecycle pointer before feedback intake and repair projection
  - `calls` → `capability.workflow-engine.workflow-state` — Read canonical tasks and leases to evaluate provider feedback progress

### 1.5 組件結構

| 組件 | 名稱 | 規模量級 | 宣告入口 |
| --- | --- | --- | --- |
| `component.publication.primary` | Publication Record and Readiness Readers | `5–10` 個文件 / `1000–2000` 行 | 未宣告 |
| `component.publication.provider-feedback` | Provider Feedback | `2–5` 個文件 / `2000–5000` 行 | 未宣告 |

## 2. P2:端到端數據流

> **Proof**: `proven` (`sha256:7278b2713f9ba291f0004c6f20ed96ce52c81dd3274b1367d5c7818f248a38ba`); selectors `1/1`.

```mermaid
%%{init: {"theme":"base","themeVariables":{"background":"#0d1117","actorBkg":"#312e81","actorBorder":"#c4b5fd","actorTextColor":"#ffffff","signalColor":"#e5e7eb","signalTextColor":"#e5e7eb","labelBoxBkgColor":"#4c1d95","labelBoxBorderColor":"#c4b5fd","labelTextColor":"#ffffff","noteBkgColor":"#78350f","noteBorderColor":"#fcd34d","noteTextColor":"#ffffff","sequenceNumberColor":"#ffffff"}}}%%
sequenceDiagram
  autonumber
  participant p2_publication_1c89e8c8 as Publication Observations
  participant p2_reader_f734aaea as Publication Record and Readiness Readers
  p2_publication_1c89e8c8->>p2_reader_f734aaea: Read receipt and provider facts for the exact head and base
  alt Report the read-only readiness verdict
  p2_publication_1c89e8c8->>p2_reader_f734aaea: Resolve the exact provider facts and return the read-only verdict
    Note over p2_publication_1c89e8c8: Return readiness and leave publication authority with GitHub
  else Provider or historical receipt facts are unavailable
  p2_publication_1c89e8c8->>p2_reader_f734aaea: Refuse missing or inconsistent provider and receipt facts with a typed error
    Note over p2_publication_1c89e8c8: Return the typed read error without changing task ownership
  end
```
<!-- END ARCHCONTEXT:generated target="projection_target.entity.capability-organization-publication" -->

## 3. P3: Current boundary after #773 slice C

The GitHub issue and PR own task and publication status. This capability reads
historical publication records and live provider facts. It does not create
receipts, edit PR markers or change lease ownership.

- `publication readiness` and MCP `publication_readiness` remain read-only.
- Receipt and integration readers keep their exact schema and digest checks.
- Provider readiness remains bound to the observed head, base, checks and reviews.
- Provider merge proof remains available to guarded worktree cleanup.
- Manual feedback intake and acknowledgement remain available. Historical repair
  records can explain no progress. They cannot dispatch a new repair.
- Removed commands have no alias or automatic migration. Old records remain
  historical inputs. GitHub carries new task authority.

The `flow.publication.readiness` flow replaces the retired lifecycle flow.
The publication-to-evidence-ledger journal relation is removed. The remaining
workflow-state relation reads historical records.

## 4. 歷史決策記錄(append-only)

The lifecycle behavior below is historical. Slice C retired its writers.

### 从无 owner 到 organization 域的独立能力 (2026-10-11)

- P1：本能力的文件此前没有 capability owner。
- P2：功能来自 PRD `fleet-acquire-publication-readiness`。主要提交：`42e3d93d`（immutable receipt）、`70ace994`（review lifecycle）、`9028f759`（recovery 与 reconcile）、`8b8c4dbc`（merge readiness）、`82f1c44c`（feedback repair loop）。
- P3：用户决定把 publication 与 task-fleet 放进新的 `organization` 域。

### Receipt protocol 3 (2026-10-06, #545)

- P1：Receipt writer 总是读取主机 merge seal。只有 `merge-gate run` 写 seal，而它要求非 draft PR。
- P2：默认 Draft ship 以 `publication_incomplete` 失败，lease 停在 completing。
- P3：Receipt 不再绑定 seal。Rebuild 改为重算候选 diff。Merge gate 保留自己的 seal 检查。

### 集成分类使用打包 helper (2026-10-06, #565)

- P3：候选仓库是不可信内容。可执行的判定只来自包内 helper。

## Remaining boundary

The receipt reader still obtains the protected Git runtime from
`scripts/acceptance-receipt.ts`. The packaged worktree merge helper supplies
integration proof. These shared read boundaries remain in use.
