# runtime-harness/collaboration 架構文檔

<!-- BEGIN ARCHCONTEXT:generated target="projection_target.entity.capability-runtime-harness-collaboration" sourceDigest="sha256:7e49ded50c742ca067ce469065584ee9fec6d86418d5bb4f0061860759e0af7a" rendererVersion="archcontext.docs-renderer/v4" outputDigest="sha256:8a19b41e7429f8879f08eb0c6dfbf0be7f68ccc74b9759cc5f3b9a43df094e80" -->
> **狀態**:`active`
> **Capability ID**:`capability.runtime-harness.collaboration`(kind `capability`)
> **Matched Prefixes**:`src/core/collaboration/**`、`src/effects/collaboration/**`
> **Local Contracts**:`AGENTS.md`、`CLAUDE.md`
> **事實優先級**:倉庫當前狀態 > 本文檔機器區 > 本文檔人工區。機器區(引言、§1、§2)由 ArchContext 從架構模型與源碼度量投影生成,手改會在下次投影被覆蓋。本文檔不記錄出處;本次投影所驗證的 commit 見 `docs/architecture/.projection-manifest.json`。

Publishes append-only coordination signals, work-state handoffs, non-exclusive adoption receipts and delegated-Worker contribution commits over one shared create-once store substrate, and enforces the parent Engineer's delegation policy at admission time as a pre-step to the existing read-only delegation, with Host-derived identity and recorded time and zero Task, Lease, Publication or Acceptance authority.

## 1. P1:能力架構地圖

### 1.1 架構圖

```mermaid
flowchart LR
  p1_capability_runtime_harness_collaboration_5265febf["Collaboration Substrate"]:::component
  p1_capability_runtime_harness_delegated_runs_e1654b07["Read-only Delegated Runs"]:::component
  p1_capability_runtime_harness_engineer_bindings_34c00f72["Engineer Bindings"]:::component
  p1_component_collaboration_primary_9383ae07["Append-only Collaboration Record Store"]:::component
  p1_capability_runtime_harness_collaboration_5265febf -->|"Enforce the parent Engineer's delegation policy as a pre-step to the unchanged read-only admission， and turn one run's persisted output into a contribution the delegation plane's own WorkerResult then references"| p1_capability_runtime_harness_delegated_runs_e1654b07
  p1_capability_runtime_harness_collaboration_5265febf -->|"Derive the publishing actor from the authenticated principal and current Binding instead of accepting a declared identity"| p1_capability_runtime_harness_engineer_bindings_34c00f72
  p1_capability_runtime_harness_collaboration_5265febf -->|"Persist immutable coordination signals under a per-thread lock without writing any delivery store"| p1_component_collaboration_primary_9383ae07
  p1_capability_runtime_harness_delegated_runs_e1654b07 -->|"Revalidate the exact current parent ClaimActorReceipt， WorkEnvelope and Engineer Binding before delegation admission"| p1_capability_runtime_harness_engineer_bindings_34c00f72
  classDef actor fill:#111827,color:#ffffff,stroke:#f9fafb,stroke-width:2px
  classDef component fill:#075985,color:#ffffff,stroke:#bae6fd,stroke-width:2px
  classDef datastore fill:#3f6212,color:#ffffff,stroke:#d9f99d,stroke-width:2px
  classDef external fill:#7c2d12,color:#ffffff,stroke:#fed7aa,stroke-width:2px
```

- Proof: `proven` (`sha256:fe482e00d203922226bd5ef26bac24cc27b64a3421cb36d287139895f40de7a6`).
- Semantic nodes: `4`; declared relations: `4`.

### 1.2 模組職責表

| 宣告入口 | 錨點 | 職責 |
| --- | --- | --- |
| `entrypoint.collaboration.publish` | `src/effects/collaboration/signal-store.ts#publishCoordinationSignal` | `sink.collaboration.mutation-gate` → `src/effects/collaboration/feature-flag.ts#assertCollaborationMutationEnabled`、`sink.collaboration.signal-schema` → `src/core/collaboration/signal.ts#buildCoordinationSignal` |
| `entrypoint.collaboration.actor-derivation` | `src/effects/collaboration/actor.ts#resolveModuleEngineerActor` | `sink.collaboration.authenticated-principal` → `src/effects/engineers/principal.ts#resolveEngineerPrincipal` |
| `entrypoint.collaboration.read` | `src/effects/collaboration/record-store.ts#readCollaborationRecord` | `sink.collaboration.record-path-guard` → `src/effects/collaboration/record-store.ts#collaborationRecordPath` |
| `entrypoint.collaboration.durable-publish` | `src/effects/collaboration/record-store.ts#publishCollaborationRecordDurably` | `sink.collaboration.staging-name` → `src/effects/collaboration/record-store.ts#collaborationStagingName` |
| `entrypoint.collaboration.handoff-publish` | `src/effects/collaboration/handoff-store.ts#publishWorkStateHandoff` | `sink.collaboration.handoff-mutation-gate` → `src/effects/collaboration/feature-flag.ts#assertCollaborationMutationEnabled`、`sink.collaboration.handoff-schema` → `src/core/collaboration/handoff.ts#buildWorkStateHandoff` |
| `entrypoint.collaboration.handoff-adoption` | `src/effects/collaboration/adoption-store.ts#adoptWorkStateHandoff` | `sink.collaboration.adoption-mutation-gate` → `src/effects/collaboration/feature-flag.ts#assertCollaborationMutationEnabled`、`sink.collaboration.adoption-actor` → `src/effects/collaboration/actor.ts#resolveCollaborationActor` |
| `entrypoint.collaboration.adoption-identity` | `src/core/collaboration/adoption.ts#handoffAdoptionReceiptId` | `sink.collaboration.adoption-triple` → `src/core/collaboration/adoption.ts#deriveHandoffAdoptionReceiptId` |
| `entrypoint.collaboration.admission-bridge` | `src/effects/collaboration/admission-bridge.ts#admitCollaborationDelegation` | `sink.collaboration.parent-delegation-policy` → `src/effects/engineers/profile-store.ts#loadEngineerProfile`、`sink.collaboration.tracked-role-profile` → `src/effects/engineers/delegated-run-store.ts#loadLogicalReadOnlyRoleProfile` |
| `entrypoint.collaboration.admission-window` | `src/effects/collaboration/admission-bridge.ts#admitInsideWindow` | `sink.collaboration.existing-admission` → `src/effects/engineers/delegated-run-store.ts#admitReadOnlyDelegation`、`sink.collaboration.seat-creation` → `src/effects/engineers/delegated-run-store.ts#prepareDelegatedRun` |
| `entrypoint.collaboration.contribution-collect` | `src/effects/collaboration/contribution-collector.ts#collectCollaborationContribution` | `sink.collaboration.persisted-provider-output` → `src/effects/collaboration/provider-output-adapter.ts#readContributionDraftFromPersistedOutput`、`sink.collaboration.delegated-worker-actor` → `src/effects/collaboration/actor.ts#resolveDelegatedWorkerActor` |
| `entrypoint.collaboration.contribution-publish` | `src/effects/collaboration/contribution-collector.ts#publishContribution` | `sink.collaboration.contribution-candidate` → `src/effects/collaboration/signal-store.ts#publishCoordinationSignal`、`sink.collaboration.contribution-commit` → `src/core/collaboration/contribution.ts#buildCollaborationContributionCommit`、`sink.collaboration.single-worker-result` → `src/effects/engineers/delegated-run-store.ts#collectDelegatedRunResult` |
| `entrypoint.collaboration.provider-output` | `src/effects/collaboration/provider-output-adapter.ts#parseContributionDraftFromStdout` | `sink.collaboration.draft-schema` → `src/core/collaboration/contribution.ts#validateCollaborationContributionDraft` |
| `entrypoint.collaboration.contribution-visibility` | `src/effects/collaboration/contribution-store.ts#listContributedSignalIds` | `sink.collaboration.committed-only` → `src/effects/collaboration/contribution-store.ts#listCollaborationContributionCommits` |
| `entrypoint.collaboration.shared-mechanics` | `src/core/collaboration/signal.ts#buildCoordinationSignal` | `sink.collaboration.actor-union` → `src/core/collaboration/common.ts#validateCollaborationActorRef` |

### 1.3 規模信號

- 規模量級:`20–50` 個文件 / `5000–10000` 行
- 匹配前綴:`src/core/collaboration/**`、`src/effects/collaboration/**`
- 推導:掃描 `source.include` 減 `source.exclude`,跳過 `.git/` 與 `node_modules/`,再按 1–2–5 階梯分桶。精確計數不入本文檔:量級足以回答「這個能力有多大」,而逐行計數會讓覆蓋範圍內任何一次源碼改動都改寫本文檔。

### 1.4 依賴邊界

出向關係:

- `calls` → `capability.runtime-harness.delegated-runs` — Enforce the parent Engineer's delegation policy as a pre-step to the unchanged read-only admission, and turn one run's persisted output into a contribution the delegation plane's own WorkerResult then references
- `calls` → `capability.runtime-harness.engineer-bindings` — Derive the publishing actor from the authenticated principal and current Binding instead of accepting a declared identity
- `calls` → `component.collaboration.primary` — Persist immutable coordination signals under a per-thread lock without writing any delivery store

入向關係:

- 無。

## 2. P2:端到端數據流

> **Proof**: `proven` (`sha256:fe482e00d203922226bd5ef26bac24cc27b64a3421cb36d287139895f40de7a6`); selectors `21/21`.

```mermaid
%%{init: {"theme":"base","themeVariables":{"background":"#0d1117","actorBkg":"#312e81","actorBorder":"#c4b5fd","actorTextColor":"#ffffff","signalColor":"#e5e7eb","signalTextColor":"#e5e7eb","labelBoxBkgColor":"#4c1d95","labelBoxBorderColor":"#c4b5fd","labelTextColor":"#ffffff","noteBkgColor":"#78350f","noteBorderColor":"#fcd34d","noteTextColor":"#ffffff","sequenceNumberColor":"#ffffff"}}}%%
sequenceDiagram
  autonumber
  participant p2_collaboration_50c48bca as Collaboration Substrate
  participant p2_delegated_runs_6de9843b as Read-only Delegated Runs
  participant p2_engineer_bindings_4e9749d0 as Engineer Bindings
  participant p2_record_store_d73a3e78 as Append-only Collaboration Record Store
  p2_collaboration_50c48bca->>p2_engineer_bindings_4e9749d0: Resolve the parent Module Engineer Profile from the parent claim so allowed_roles and max_parallel_readers are the values this admission decides against
  alt A participant under the limit is admitted through the unchanged read-only admission， and its seat exists before the counting lock is released
  p2_collaboration_50c48bca->>p2_delegated_runs_6de9843b: Load the tracked read-only Role Profile， because an open logical_role string is not authorization
  p2_collaboration_50c48bca->>p2_delegated_runs_6de9843b: Forward the caller's admission input verbatim， leaving the existing admission semantics untouched
  p2_collaboration_50c48bca->>p2_delegated_runs_6de9843b: Create the run intent inside the same critical section that counted for the seat， so the granted seat is never invisible to the next request
    Note over p2_delegated_runs_6de9843b: Return the admission decision and the seat； the parallel-reader limit is now a runtime constraint rather than a declared value
  else The run's exact persisted stdout becomes candidate records， one commit， and one WorkerResult that references it
  p2_collaboration_50c48bca->>p2_delegated_runs_6de9843b: Take the draft only from the stdout blob the Host persisted for that run， never from a caller-supplied payload
  p2_collaboration_50c48bca->>p2_delegated_runs_6de9843b: Derive the delegated Worker actor from the immutable run reference and admission receipt， ignoring anything the Worker said about itself
  p2_collaboration_50c48bca->>p2_record_store_d73a3e78: Publish every candidate signal immutably under an identity derived from the run and the entry index， so a retry converges instead of duplicating
  p2_collaboration_50c48bca->>p2_record_store_d73a3e78: Publish the contribution commit last， as the sole visibility boundary over the candidates already on disk
  p2_collaboration_50c48bca->>p2_delegated_runs_6de9843b: Construct the one WorkerResult for this run， carrying the commit as an evidence reference and refusing a second result with different bytes
  p2_collaboration_50c48bca->>p2_record_store_d73a3e78: Expose contributed records to projections only through committed contributions， so an uncommitted candidate is indistinguishable from one never written
    Note over p2_collaboration_50c48bca: Return the commit and the single WorkerResult； the delivery plane holds the same bytes it held before the contribution
  else An output that cannot be parsed is a typed rejection， never a synthesised empty contribution
  p2_collaboration_50c48bca->>p2_record_store_d73a3e78: Validate the entire draft before any visible write， so a malformed later entry publishes none of the earlier ones
    Note over p2_collaboration_50c48bca: Surface the typed rejection with its adapter version； the ordinary WorkerResult still persists and no candidate， commit or partial signal exists
  end
```

```mermaid
%%{init: {"theme":"base","themeVariables":{"background":"#0d1117","actorBkg":"#312e81","actorBorder":"#c4b5fd","actorTextColor":"#ffffff","signalColor":"#e5e7eb","signalTextColor":"#e5e7eb","labelBoxBkgColor":"#4c1d95","labelBoxBorderColor":"#c4b5fd","labelTextColor":"#ffffff","noteBkgColor":"#78350f","noteBorderColor":"#fcd34d","noteTextColor":"#ffffff","sequenceNumberColor":"#ffffff"}}}%%
sequenceDiagram
  autonumber
  participant p2_collaboration_50c48bca as Collaboration Substrate
  participant p2_engineer_bindings_4e9749d0 as Engineer Bindings
  participant p2_record_store_d73a3e78 as Append-only Collaboration Record Store
  p2_collaboration_50c48bca->>p2_record_store_d73a3e78: Refuse every handoff write unless collaboration.mode has been promoted past off
  alt The attempted paths， dead ends， findings and next actions land as one immutable record
  p2_collaboration_50c48bca->>p2_record_store_d73a3e78: Require the four knowledge fields and one complete execution-context branch before any write
    Note over p2_collaboration_50c48bca: Return the persisted handoff； knowledge moved and no Task， Lease or Claim byte did
  else Any number of distinct adopters take the same handoff， and none of them gains a writer seat
  p2_collaboration_50c48bca->>p2_engineer_bindings_4e9749d0: Derive the adopter from the authenticated principal and refuse any caller-declared identity
  p2_collaboration_50c48bca->>p2_record_store_d73a3e78: Key the receipt on the handoff digest， the adopter actor digest and the context packet digest so distinct adopters never collide
    Note over p2_collaboration_50c48bca: Return the receipt； execution succession still runs only through TaskFreeze plus the existing release， takeover and acquire lifecycle
  else A disabled collaboration plane refuses knowledge transfer instead of degrading to a silent write
  p2_collaboration_50c48bca->>p2_record_store_d73a3e78: Refuse the adoption before any record is read or written when collaboration.mode is off
    Note over p2_collaboration_50c48bca: Surface the typed collaboration_disabled rejection； the adoption shard is never created
  end
```

```mermaid
%%{init: {"theme":"base","themeVariables":{"background":"#0d1117","actorBkg":"#312e81","actorBorder":"#c4b5fd","actorTextColor":"#ffffff","signalColor":"#e5e7eb","signalTextColor":"#e5e7eb","labelBoxBkgColor":"#4c1d95","labelBoxBorderColor":"#c4b5fd","labelTextColor":"#ffffff","noteBkgColor":"#78350f","noteBorderColor":"#fcd34d","noteTextColor":"#ffffff","sequenceNumberColor":"#ffffff"}}}%%
sequenceDiagram
  autonumber
  participant p2_collaboration_50c48bca as Collaboration Substrate
  participant p2_engineer_bindings_4e9749d0 as Engineer Bindings
  participant p2_signal_store_5a76fb32 as Append-only Collaboration Record Store
  p2_collaboration_50c48bca->>p2_signal_store_5a76fb32: Refuse every mutation unless collaboration.mode has been promoted past off
  p2_collaboration_50c48bca->>p2_engineer_bindings_4e9749d0: Resolve the authenticated principal and fence it against a second read of the principal mapping
  alt A new identity samples the recorded time once and lands as one immutable file
  p2_collaboration_50c48bca->>p2_signal_store_5a76fb32: Content-address the signal and write it with an exclusive create plus fsync
    Note over p2_collaboration_50c48bca: Return the persisted signal； no Task， Lease， Publication or Acceptance byte moves
  else An invalid record or an unreadable shard fails closed
  p2_collaboration_50c48bca->>p2_signal_store_5a76fb32: Reject an unknown field， an unsupported actor kind or a stale digest before any write
  p2_collaboration_50c48bca->>p2_signal_store_5a76fb32: Validate the 64-hex record id before any path join， then fail loud on an unreadable or non-canonical shard rather than serving a healthy empty store
    Note over p2_collaboration_50c48bca: Surface the typed rejection； a republished identity reuses its recorded time instead of re-sampling the clock
  end
```
<!-- END ARCHCONTEXT:generated target="projection_target.entity.capability-runtime-harness-collaboration" -->

## 3. P3:設計決策與不變量

### 兩個平面,一個方向

交付平面(Work Graph → EngineerOffer → Claim/Lease → WorkEnvelope → Publication
→ Acceptance)是權威。協作平面只讀它,永不寫它,也沒有一條反向邊。這條邊界由
C0 的 D1 凍結,由 `tests/unit/collaboration-authority-baseline.test.ts` 守住:
封閉掃描證明本能力不在五個被凍結的平面上,另一條斷言證明任何交付平面模組都沒有
import 協作模組。

Child PRD A 記的核心風險是「協作 store 退化成第二個調度器」。防線不是文檔約定,
而是這條 import 方向斷言加上 store 本身零交付寫入的 before/after digest 證據。

### 記錄時間為什麼是一個判別聯合

signal 的 `created_at` 由 Host 派生,且對重試穩定。兩種來源各自對應一條真實的
provenance 鏈:delegated 貢獻取該次運行精確的持久化觀測時間,直接發布在第一次
idempotency 事件裡凍結時鐘。用一組可空欄位表達會允許「兩個都為 null」這種無意義
狀態,所以它是判別聯合。

真正的壓力點在重試路徑:先採樣時鐘再查存在性,會讓一次冪等重試看起來像 payload
衝突。store 因此只在建檔那條分支讀時鐘,比較分支一律用已持久化的值重建候選。

### 身份只能由服務端派生

publish 的入參裡根本沒有 actor 欄位。actor 由 `resolveEngineerPrincipal()` 從
authenticated principal 推導,再對 principal mapping 做第二次讀取,兩次不一致就
fail closed。呼叫方自述的身份不是被忽略,而是無處可寫。

P0 的 wire union 只有 `module_engineer` 與 `delegated_worker`,因為只有這兩類有
不可變的服務端 provenance。`human_operator` 與 `native_subagent` 不進 union,也
不留佔位分支——留下的佔位分支遲早會被填上一個沒有 provenance 的值。

### supersede 的 lineage 邊界

append-only 的修訂只能是 supersede,而 supersede 只能在同一個 actor lineage 內。
lineage 對 Module Engineer 取 `engineer_id`,對 delegated Worker 取
`worker_run_ref_sha256`:重新綁定是同一個持久 Engineer 的換屆,兩次 delegated run
則是兩個參與者。

### 10x 規模下先壞的地方

per-thread lock 讓同一條 thread 的寫入串行。單一 thread 上的高頻寫入會先撞到鎖等待,
而不是磁碟。thread 之間互不阻塞,所以擴展方向是 thread 的數量而不是單 thread 的吞吐。
`listCoordinationSignals()` 是全量掃描,C2 的投影需要它時要綁定來源集合的 digest,
且快取永遠不能成為權威。

### 不變量

- 協作平面對 Task、Lease、Publication、Acceptance 的字節影響為 0。
- 每條 signal 一個不可變檔案,身份級原子寫,同 id 同 payload 冪等、不同 payload 顯式衝突。
- store 不可讀時 fail loud,絕不退化成健康空集。
- `collaboration.mode` 預設 `off`,升級順序 `off -> shadow -> active`,不跳級。
- `src/core/collaboration/common.ts` 在 C1 之後凍結,C2-C9 只消費不修改。

## 4. 歷史決策記錄(append-only)

| 日期 | 決策 | 依據 |
| --- | --- | --- |
| 2026-08-29 | 建立 `capability.runtime-harness.collaboration`,協作平面與交付平面分離 | `docs/researches/20260829-c0-collaboration-two-plane-authority-freeze.md` D1-D12 |
| 2026-08-29 | `ArtifactRefV1` 複用 `WorkerResultV1.evidence_refs` 的同一個校驗器,不引入第二個等價引用類型 | D8;`src/core/engineers/delegation.ts` 的 `validateWorkerEvidenceRefs()` |
| 2026-08-29 | store 根、鎖策略與 canonical JSON 複用既有 `repo-harness/<domain>/v1` 慣例與既有鎖原語,不寫第二個序列化器 | D9 |

## Optimization Backlog

- C2 的 thread/hotspot 投影如果需要快取,快取必須綁定來源集合的 digest 並在不匹配時重算。
- 目前 `listCoordinationSignals()` 讀全量;真實 signal 量級由 C9 的 canary 測出來之後再決定要不要分片。
