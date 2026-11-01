<!-- BEGIN ARCHCONTEXT:generated target="projection_target.entity.capability-runtime-harness-integration-acceptance" rendererVersion="archcontext.docs-renderer/v6" outputDigest="sha256:18d41c267499efee3f1d8bfc37b0fce9d0e47e84f090daf668527994360c0435" -->
> **狀態**:`active`
> **Capability ID**:`capability.runtime-harness.integration-acceptance`(kind `capability`)
> **Matched Prefixes**:`src/core/integration/product-acceptance.ts`、`src/effects/integration/product-acceptance.ts`、`src/cli/commands/integration.ts`
> **Local Contracts**:`AGENTS.md`、`CLAUDE.md`
> **事實優先級**:倉庫當前狀態 > 本文檔機器區 > 本文檔人工區。機器區(引言、§1、§2)由 ArchContext 從架構模型與源碼度量投影生成,手改會在下次投影被覆蓋。本文檔不記錄出處;本次投影所驗證的 commit 見 `docs/architecture/.projection-manifest.json`。

Binds approved requirement bytes, explicit canonical provider PR integration proofs, one exact Git candidate, evidence and the canonical acceptance receipt into immutable V2 product projections.

## 1. P1:能力架構地圖

### 1.1 架構圖

```mermaid
flowchart LR
  p1_capability_organization_publication_44355620["Publication Observations"]:::component
  p1_capability_runtime_harness_integration_acceptance_8c7dd2d3["Integration Product Acceptance"]:::component
  p1_component_integration_acceptance_primary_d3db0bd8["Integration Acceptance Evidence Plane"]:::component
  p1_component_integration_acceptance_primary_core_24d429f5["Integration Acceptance Evidence Plane (core)"]:::component
  p1_component_integration_acceptance_primary_effects_edc398d3["Integration Acceptance Evidence Plane (effects)"]:::component
  p1_capability_runtime_harness_integration_acceptance_8c7dd2d3 -->|"Validate and persist immutable exact-subject integration evidence before returning a non-authoritative projection"| p1_component_integration_acceptance_primary_d3db0bd8
  p1_capability_runtime_harness_integration_acceptance_8c7dd2d3 -->|"Reuse the shared provider PR integration collector and canonical JSON helpers without historical receipt authority"| p1_capability_organization_publication_44355620
  classDef actor fill:#111827,color:#ffffff,stroke:#f9fafb,stroke-width:2px
  classDef component fill:#075985,color:#ffffff,stroke:#bae6fd,stroke-width:2px
  classDef datastore fill:#3f6212,color:#ffffff,stroke:#d9f99d,stroke-width:2px
  classDef external fill:#7c2d12,color:#ffffff,stroke:#fed7aa,stroke-width:2px
```

- Proof: `proven` (`sha256:0213bb5b958a9dc9fbcb37a0bcb81b3703994f7e58db6a40b7c07ec2de19b69e`).
- Semantic nodes: `5`; declared relations: `2`.

### 1.2 模組職責表

| 宣告入口 | 錨點 | 職責 |
| --- | --- | --- |
| `entrypoint.integration-acceptance.contract` | `src/effects/integration/product-acceptance.ts#createIntegrationContract` | `sink.integration-acceptance.contract-schema` → `src/core/integration/product-acceptance.ts#buildIntegrationContract` |
| `entrypoint.integration-acceptance.envelope` | `src/effects/integration/product-acceptance.ts#observeSelectedPullRequest` | `sink.integration-acceptance.local-merge-tree` → `src/effects/integration/product-acceptance.ts#treeForCommit`、`sink.integration-acceptance.local-ancestry` → `src/effects/integration/product-acceptance.ts#assertAncestor` |
| `entrypoint.integration-acceptance.envelope` | `src/effects/integration/product-acceptance.ts#buildCurrentEnvelope` | `sink.integration-acceptance.envelope-schema` → `src/core/integration/product-acceptance.ts#buildIntegrationEnvelope` |
| `entrypoint.integration-acceptance.publication-observation` | `src/effects/integration/product-acceptance.ts#observeSelectedPullRequest` | `sink.integration-acceptance.provider-integration` → `src/effects/publication/merge-readiness.ts#collectPullRequestIntegration` |
| `entrypoint.integration-acceptance.matrix` | `src/effects/integration/product-acceptance.ts#createAcceptanceMatrix` | `sink.integration-acceptance.matrix-schema` → `src/core/integration/product-acceptance.ts#assertCompletePassingMatrix` |
| `entrypoint.integration-acceptance.product` | `src/effects/integration/product-acceptance.ts#createProductAcceptanceProjection` | `sink.integration-acceptance.product-schema` → `src/core/integration/product-acceptance.ts#buildProductAcceptanceProjection` |
| `entrypoint.integration-acceptance.product-command` | `src/cli/commands/integration.ts#buildIntegrationCommand` | `sink.integration-acceptance.product-operation` → `src/effects/integration/product-acceptance.ts#createProductAcceptanceProjection` |
| `entrypoint.integration-acceptance.contract-canonical` | `src/core/integration/product-acceptance.ts#buildIntegrationContract` | `sink.integration-acceptance.contract-canonical` → `src/core/publication/publication-receipt.ts#stablePublicationJson` |
| `entrypoint.integration-acceptance.envelope-canonical` | `src/core/integration/product-acceptance.ts#buildIntegrationEnvelope` | `sink.integration-acceptance.envelope-canonical` → `src/core/publication/publication-receipt.ts#stablePublicationJson` |
| `entrypoint.integration-acceptance.matrix-canonical` | `src/core/integration/product-acceptance.ts#buildAcceptanceMatrix` | `sink.integration-acceptance.matrix-canonical` → `src/core/publication/publication-receipt.ts#stablePublicationJson` |
| `entrypoint.integration-acceptance.product-canonical` | `src/core/integration/product-acceptance.ts#buildProductAcceptanceProjection` | `sink.integration-acceptance.product-canonical` → `src/core/publication/publication-receipt.ts#stablePublicationJson` |

組件入口:

- 組件均未宣告 `source.entrypoints`。

### 1.3 規模信號

- 規模量級:`2–5` 個文件 / `1000–2000` 行
- 匹配前綴:`src/core/integration/product-acceptance.ts`、`src/effects/integration/product-acceptance.ts`、`src/cli/commands/integration.ts`
- 推導:掃描 `source.include` 減 `source.exclude`,跳過 `.git/` 與 `node_modules/`,再按 1–2–5 階梯分桶。精確計數不入本文檔:量級足以回答「這個能力有多大」,而逐行計數會讓覆蓋範圍內任何一次源碼改動都改寫本文檔。

### 1.4 依賴邊界

出向關係:

- `calls` → `component.integration-acceptance.primary` — Validate and persist immutable exact-subject integration evidence before returning a non-authoritative projection
- `reads` → `capability.organization.publication` — Reuse the shared provider PR integration collector and canonical JSON helpers without historical receipt authority

入向關係:

- `reads` ← `capability.runtime-harness.engineer-scheduling` — Read ME-4C product acceptance projections as one closed dependency authority and never reconstruct acceptance from prose
- `depends-on` ← `capability.verification.evals-checks` — Test Integration Product Acceptance behavior through its source modules.
- `calls` ← `component.global-runtime-reconciliation.cli-root` — Register the integration command

組件出向關係:

- `component.integration-acceptance.primary`:
  - `calls` → `capability.verification.acceptance-review` — Locate the acceptance receipt for an integration candidate
  - `calls` → `capability.workflow-engine.execution-primitives` — Resolve the Git common directory for integration records
- `component.integration-acceptance.primary-core`:
  - 無。
- `component.integration-acceptance.primary-effects`:
  - 無。

### 1.5 組件結構

| 組件 | 名稱 | 規模量級 | 宣告入口 |
| --- | --- | --- | --- |
| `component.integration-acceptance.primary` | Integration Acceptance Evidence Plane | `1–2` 個文件 / `200–500` 行 | 未宣告 |
| `component.integration-acceptance.primary-core` | Integration Acceptance Evidence Plane (core) | `1–2` 個文件 / `200–500` 行 | 未宣告 |
| `component.integration-acceptance.primary-effects` | Integration Acceptance Evidence Plane (effects) | `1–2` 個文件 / `500–1000` 行 | 未宣告 |

## 2. P2:端到端數據流

> **Proof**: `proven` (`sha256:0213bb5b958a9dc9fbcb37a0bcb81b3703994f7e58db6a40b7c07ec2de19b69e`); selectors `7/7`.

```mermaid
%%{init: {"theme":"base","themeVariables":{"background":"#0d1117","actorBkg":"#312e81","actorBorder":"#c4b5fd","actorTextColor":"#ffffff","signalColor":"#e5e7eb","signalTextColor":"#e5e7eb","labelBoxBkgColor":"#4c1d95","labelBoxBorderColor":"#c4b5fd","labelTextColor":"#ffffff","noteBkgColor":"#78350f","noteBorderColor":"#fcd34d","noteTextColor":"#ffffff","sequenceNumberColor":"#ffffff"}}}%%
sequenceDiagram
  autonumber
  participant p2_integration_plane_da058c3e as Integration Product Acceptance
  participant p2_evidence_schema_dd5fece0 as Integration Acceptance Evidence Plane
  participant p2_publication_1c89e8c8 as Publication Observations
  p2_integration_plane_da058c3e->>p2_evidence_schema_dd5fece0: Digest one Approved PRD and source spec into an immutable IntegrationContract
  p2_integration_plane_da058c3e->>p2_publication_1c89e8c8: Collect and reobserve exact provider PR identity and actual merge commit/tree evidence
  p2_integration_plane_da058c3e->>p2_evidence_schema_dd5fece0: Compare the actual provider merge tree with its exact local commit
  p2_integration_plane_da058c3e->>p2_evidence_schema_dd5fece0: Prove selected base to actual merge commit and merge commit to exact final candidate ancestry
  p2_integration_plane_da058c3e->>p2_evidence_schema_dd5fece0: Freeze exact reobserved PR integrations into one existing Git head and tree
  p2_integration_plane_da058c3e->>p2_evidence_schema_dd5fece0: Require exactly one passing immutable evidence row for every contract constraint
  alt Current authority bytes and the existing passing AcceptanceReceipt project onto the exact candidate
  p2_integration_plane_da058c3e->>p2_evidence_schema_dd5fece0: Revalidate every fence and content-address the existing product verdict
    Note over p2_integration_plane_da058c3e: Return immutable ProductAcceptanceProjectionV2 with every authority unchanged
  else Any stale requirement#44; provider integration#44; candidate#44; matrix#44; evidence or acceptance receipt fails closed
  p2_integration_plane_da058c3e->>p2_evidence_schema_dd5fece0: Reject the mismatched authority before persisting a product projection
    Note over p2_integration_plane_da058c3e: Return a typed integration error without mutation or fallback
  end
```
<!-- END ARCHCONTEXT:generated target="projection_target.entity.capability-runtime-harness-integration-acceptance" -->
