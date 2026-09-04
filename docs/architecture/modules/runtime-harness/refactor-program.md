# Refactor Program
<!-- BEGIN ARCHCONTEXT:generated target="projection_target.entity.capability-runtime-harness-refactor-program" sourceDigest="sha256:e62d682d1acc2005b21ec95c10b7d564f58d7974b9190f8bd2352ae2f89574b9" rendererVersion="archcontext.docs-renderer/v4" outputDigest="sha256:281710e8acc1b2e7fa7a7e0521833566e98430f128f36147674832cef046126d" -->
> **狀態**:`active`
> **Capability ID**:`capability.runtime-harness.refactor-program`(kind `capability`)
> **Matched Prefixes**:`src/core/refactor/**`、`src/effects/refactor/**`、`src/cli/commands/refactor.ts`
> **Local Contracts**:`AGENTS.md`、`CLAUDE.md`
> **事實優先級**:倉庫當前狀態 > 本文檔機器區 > 本文檔人工區。機器區(引言、§1、§2)由 ArchContext 從架構模型與源碼度量投影生成,手改會在下次投影被覆蓋。本文檔不記錄出處;本次投影所驗證的 commit 見 `docs/architecture/.projection-manifest.json`。

Orchestrates ArchContext-backed refactor discovery, accountable proposal authoring, conservative workflow routing, execution evidence, and post-merge resolution without duplicating structural authority.

## 1. P1:能力架構地圖

### 1.1 架構圖

```mermaid
flowchart LR
  p1_capability_runtime_harness_refactor_program_75614af4["Refactor Program"]:::component
  p1_component_refactor_program_archctx_provider_66030fac["Refactor ArchContext Provider Boundary"]:::component
  p1_component_refactor_program_lifecycle_2ce6d5e2["Refactor Program Lifecycle Plane"]:::component
  p1_capability_runtime_harness_refactor_program_75614af4 -->|"Run proposal-free discovery and proposal-bound assessment through the exact package-local ArchContext contract"| p1_component_refactor_program_archctx_provider_66030fac
  p1_capability_runtime_harness_refactor_program_75614af4 -->|"Execute authorized program transitions and publish only exact lifecycle evidence through the capability-owned effect plane"| p1_component_refactor_program_lifecycle_2ce6d5e2
  classDef actor fill:#111827,color:#ffffff,stroke:#f9fafb,stroke-width:2px
  classDef component fill:#075985,color:#ffffff,stroke:#bae6fd,stroke-width:2px
  classDef datastore fill:#3f6212,color:#ffffff,stroke:#d9f99d,stroke-width:2px
  classDef external fill:#7c2d12,color:#ffffff,stroke:#fed7aa,stroke-width:2px
```

- Proof: `proven` (`sha256:73e4995f7ad0fbe27bda040c8e7307891a8407b81069c37844a98b1157da846d`).
- Semantic nodes: `3`; declared relations: `2`.

### 1.2 模組職責表

| 宣告入口 | 錨點 | 職責 |
| --- | --- | --- |
| `entrypoint.refactor-program.discover` | `src/effects/refactor/discovery-authoring.ts#discoverRefactorCandidates` | `sink.refactor-program.provider-scan` → `src/effects/refactor/archctx-provider.ts#runRefactorScan` |
| `entrypoint.refactor-program.discover` | `src/effects/refactor/discovery-authoring.ts#assessRefactorProposal` | `sink.refactor-program.proposal-assessment` → `src/effects/refactor/archctx-provider.ts#runRefactorScan` |
| `entrypoint.refactor-program.lifecycle` | `src/cli/commands/refactor.ts#runRefactorStart` | `sink.refactor-program.create` → `src/effects/refactor/program-store.ts#createRefactorProgram` |
| `entrypoint.refactor-program.lifecycle` | `src/cli/commands/refactor.ts#runRefactorStatus` | `sink.refactor-program.status` → `src/effects/refactor/program-store.ts#readRefactorProgramStatus` |
| `entrypoint.refactor-program.lifecycle` | `src/cli/commands/refactor.ts#runRefactorStop` | `sink.refactor-program.stop` → `src/effects/refactor/program-store.ts#appendRefactorProgramEvent` |
| `entrypoint.refactor-program.lifecycle` | `src/cli/commands/refactor.ts#runRefactorMaterialize` | `sink.refactor-program.materialize` → `src/effects/refactor/materialization.ts#materializeRefactorProgram` |
| `entrypoint.refactor-program.lifecycle` | `src/cli/commands/refactor.ts#runRefactorArchitectureRequest` | `sink.refactor-program.architecture-intervention` → `src/effects/refactor/architecture-intervention.ts#prepareRefactorArchitectureIntervention` |
| `entrypoint.refactor-program.lifecycle` | `src/cli/commands/refactor.ts#runRefactorCandidateVerify` | `sink.refactor-program.candidate-verification` → `src/effects/refactor/candidate-verification.ts#verifyRefactorCandidate` |
| `entrypoint.refactor-program.lifecycle` | `src/cli/commands/refactor.ts#runRefactorBindExecution` | `sink.refactor-program.execution-binding` → `src/effects/refactor/execution-binding-store.ts#appendRefactorExecutionBinding` |
| `entrypoint.refactor-program.lifecycle` | `src/cli/commands/refactor.ts#runRefactorPostMerge` | `sink.refactor-program.post-merge-resolution` → `src/effects/refactor/post-merge-resolution.ts#resolveRefactorPostMerge` |
| `entrypoint.refactor-program.lifecycle` | `src/cli/commands/refactor.ts#runRefactorBoard` | `sink.refactor-program.board-projection` → `src/effects/refactor/post-merge-resolution.ts#rebuildRefactorBoard` |
| `entrypoint.refactor-program.lifecycle` | `src/cli/commands/refactor.ts#runRefactorActivationPromote` | `sink.refactor-program.activation-ledger` → `src/effects/refactor/activation-store.ts#advanceRefactorActivation` |

### 1.3 規模信號

- 規模量級:`20–50` 個文件 / `2000–5000` 行
- 匹配前綴:`src/core/refactor/**`、`src/effects/refactor/**`、`src/cli/commands/refactor.ts`
- 推導:掃描 `source.include` 減 `source.exclude`,跳過 `.git/` 與 `node_modules/`,再按 1–2–5 階梯分桶。精確計數不入本文檔:量級足以回答「這個能力有多大」,而逐行計數會讓覆蓋範圍內任何一次源碼改動都改寫本文檔。

### 1.4 依賴邊界

出向關係:

- `calls` → `component.refactor-program.archctx-provider` — Run proposal-free discovery and proposal-bound assessment through the exact package-local ArchContext contract
- `calls` → `component.refactor-program.lifecycle` — Execute authorized program transitions and publish only exact lifecycle evidence through the capability-owned effect plane

入向關係:

- 無。

## 2. P2:端到端數據流

> **Proof**: `proven` (`sha256:73e4995f7ad0fbe27bda040c8e7307891a8407b81069c37844a98b1157da846d`); selectors `8/8`.

```mermaid
%%{init: {"theme":"base","themeVariables":{"background":"#0d1117","actorBkg":"#312e81","actorBorder":"#c4b5fd","actorTextColor":"#ffffff","signalColor":"#e5e7eb","signalTextColor":"#e5e7eb","labelBoxBkgColor":"#4c1d95","labelBoxBorderColor":"#c4b5fd","labelTextColor":"#ffffff","noteBkgColor":"#78350f","noteBorderColor":"#fcd34d","noteTextColor":"#ffffff","sequenceNumberColor":"#ffffff"}}}%%
sequenceDiagram
  autonumber
  participant p2_refactor_program_a8b792d5 as Refactor Program
  participant p2_archctx_provider_3b536550 as Refactor ArchContext Provider Boundary
  p2_refactor_program_a8b792d5->>p2_archctx_provider_3b536550: Run an exact proposal-free scan and accept only structural observations with null proposal digest and scale
  alt An accountable proposal is assessed by the same provider boundary
  p2_refactor_program_a8b792d5->>p2_archctx_provider_3b536550: Validate file scope and rerun the original request with the authored proposal
    Note over p2_refactor_program_a8b792d5: Return the provider-owned non-null scale bound to the proposal digest
  else Invalid author， scope， provider handshake， or scan transition fails closed
  p2_refactor_program_a8b792d5->>p2_archctx_provider_3b536550: Preserve zero local structural output when the provider contract is not exact
    Note over p2_refactor_program_a8b792d5: Return one typed error without route， materialization， or recommendation-state mutation
  end
```

```mermaid
%%{init: {"theme":"base","themeVariables":{"background":"#0d1117","actorBkg":"#312e81","actorBorder":"#c4b5fd","actorTextColor":"#ffffff","signalColor":"#e5e7eb","signalTextColor":"#e5e7eb","labelBoxBkgColor":"#4c1d95","labelBoxBorderColor":"#c4b5fd","labelTextColor":"#ffffff","noteBkgColor":"#78350f","noteBorderColor":"#fcd34d","noteTextColor":"#ffffff","sequenceNumberColor":"#ffffff"}}}%%
sequenceDiagram
  autonumber
  participant p2_operator_97b83da8 as Refactor Program
  participant p2_program_store_c54d7d72 as Refactor Program Lifecycle Plane
  p2_operator_97b83da8->>p2_program_store_c54d7d72: Bind an account-level ProgramAuthorization to the exact protected target revision and append the created event
  alt Rebuild current state from the immutable event chain
  p2_operator_97b83da8->>p2_program_store_c54d7d72: Validate the program and every event before comparing the cached projection
    Note over p2_operator_97b83da8: Return the deterministic current projection and durable events
  else Publish one exact Refactor Program execution graph atomically
  p2_operator_97b83da8->>p2_program_store_c54d7d72: Bind recommendations to contract-gated Work Packages and publish Program， Sprint， Plans， Work Graph， acceptance policies， and rollback boundaries in one Git CAS
    Note over p2_operator_97b83da8: Return the materialized commit and planning-state receipt
  else Route architecture-scale work through the existing human projection acceptance authority
  p2_operator_97b83da8->>p2_program_store_c54d7d72: Bind the accepted ArchContext target delta and stop at architecture_approval_required
    Note over p2_operator_97b83da8: Use the returned digest-derived approval reference with architecture-projection accept before materialization
  else Verify an exact candidate through all four gates in fixed order
  p2_operator_97b83da8->>p2_program_store_c54d7d72: Run Contract， Cutover Closure， ArchContext candidate preverify， then AcceptanceReceipt and persist an immutable receipt
    Note over p2_operator_97b83da8: Return exact evidence references without projecting a final architecture disposition
  else Append an explicit stopped terminal transition
  p2_operator_97b83da8->>p2_program_store_c54d7d72: Recheck grant， protected target policy， target movement， and expected current digest before append
    Note over p2_program_store_c54d7d72: Persist stopped without claiming completed
  else Off mode， shadow-forbidden work， stale authority， moved target， or conflicting replay fails closed
  p2_operator_97b83da8->>p2_program_store_c54d7d72: Reject the requested mutation before publishing a new durable event
    Note over p2_operator_97b83da8: Observe a non-zero mutation failure with no synthesized state
  end
```
<!-- END ARCHCONTEXT:generated target="projection_target.entity.capability-runtime-harness-refactor-program" -->
## 3. P3:設計決策與不變量

- No local module statistics, dependency analysis, cycle detection, refactor scoring, or scale inference.
- No copied recommendation status or locally synthesized resolution.
- Materialization re-reads ArchContext lifecycle authority and accepts only exact `recommendationId` + fingerprint pairs whose current status is `accepted`.
- Every generated Work Package ID must be present in the account-level ProgramAuthorization allowlist.
- Every mutating program transition is append-only, idempotent by exact event identity, and rejected on conflicting replay.
- Candidate worktrees cannot relax the target revision's policy or authorization.
- Architecture-scale work always crosses the existing human architecture-acceptance boundary.
- An architecture approval reference is derived from the complete target delta; the existing projection receipt must bind that reference, the exact affected nodes, and the exact provider major-change reasons.
- Projection-owned architecture file changes join the same Git CAS as the Refactor Program artifacts; the refactor lane never renders architecture docs itself.
- Workflow route is a pure three-input projection of provider-owned scale, scale reason codes, and major-change reasons; a supplied route is accepted only when it equals that projection.
- Materialization never creates a Lease: it writes only Program bindings, canonical Sprint tasks, Work Packages, Plans, and their exact acceptance and rollback references.
- One affected architecture node maps to one Work Package, one rollback boundary, and one repo-scoped concurrency key; dependency topology must validate before the Git CAS.
- A failed CAS leaves the append-only program at `materializing`; replay recognizes only the exact authorized child commit and finishes the `planning` transition idempotently.
- Completion requires Cutover Closure plus exact post-merge ArchContext measurement.
- Candidate verification preserves the fixed four-gate order. A closure failure prevents provider and acceptance calls; an unavailable Stage 2 provider is recorded explicitly and never weakens Contract, closure, or AcceptanceReceipt gates.
- Execution bindings contain only immutable references. Candidate verification is a separate receipt because PR and merge identities do not exist at preverify time; no nullable or lifecycle fields represent a partial binding.
- Refactor Board joins Program, recommendation readback, execution bindings, and resolution evidence by exact recommendation ID plus digest; duplicate authorities fail closed.
- Merge observation alone is `merged_pending_measurement`. Only provider evidence bound to the exact final-main commit may resolve a card, while stale evidence requires reconciliation and all other non-resolved dispositions require follow-up.
- Discovery re-reads ArchContext lifecycle state and excludes exact resolved or superseded recommendation identities before assigning candidate aliases.
- Runtime policy is an intent ceiling, not activation evidence: shadow requires the shadow rung, active execution requires `active_module`, and cross-module materialization additionally requires `active_cross_module`.
- Activation events are append-only, advance exactly one rung, and bind the fixed canary receipt subset to the same repository and exact target revision. Architecture intervention retains its independent human approval at every rung.

## Verification

Run the root required checks and the focused Refactor Program tests recorded in the capability node.
