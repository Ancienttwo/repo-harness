# ArchContext 接管 capability filing:整合方案與遷移階梯

> **Date**: 2026-07-05
> **Source**: `Ancienttwo/arch-context` @ HEAD(README、docs/spec.md、.archcontext/manifest.yaml、.archcontext/projections/targets.json、.archcontext/model/nodes/capability.architecture-context.yaml、packages/contracts/src/schema.ts,fetched 2026-07-05 via gh api)
> **Repo-side census**: capability filing 全讀寫方普查(本文件 §2,file:line 佐證)
> **Decision owner**: ancienttwo(兩專案同一作者,ID 統一已授權)
> **Status**: direction-approved analysis;分階段執行待各 stage 立項
> **Addendum**: 2026-07-06 雙軌覆核(Opus deep-reasoner + Codex 盲評)結論見 §7;Stage 2+ 暫緩,gating 條件未滿足前不重開。

## 1. 責任分界(整合的核心判定)

- **repo-harness** 保留:任務/意圖生命週期——plans、sprints、contracts(delegation brief + intent boundary)、reviews、notes、workstreams、handoff、lessons、todos。
- **arch-context** 接管:架構/代碼真值——capability 語義模型(`.archcontext/model` nodes YAML)、架構文檔投影(`docs/architecture/**`,projection ownership marker 與 repo-harness BEGIN/END 塊同構)、結構壓力偵測(checkpoint)、freshness/staleness 與 unjustified-compatibility 審查(manifest `review.failOn`)、任務前 context 編譯(`prepare_task`,`contextBudgetBytes` 管預算)。
- **縫合點**:capability stableId + `prepare_task` 輸出。未來 contract brief 的 `Capability ID` 與建議 `allowed_paths` 由 `archcontext_prepare_task` 供給——人給意圖邊界(Non-Goals/EXECUTION_BOUNDARY,見 plan-20260705-1455),archctx 給架構邊界,兩半在 contract 會師。

## 2. capabilities.json 欄位級移交表

現行 schema(7 個 live capability(2026-07-06 覆核修正:原記 6 個已過期);TS type 在 capability-resolver.ts:6-26 / capability-config.ts:7-22 / capability-context.ts:6-26 重複三份):

| 欄位 | 去向 |
|---|---|
| `id`/`domain`/`name` | node stableId,canonical 形態 `capability.<domain>.<name>`(node schema 加 domain 段) |
| `prefixes[]`(longest-prefix 解析) | **node/v1 既有 `source.include/exclude/entrypoints` glob 欄位**(PRD §17.7,recon 2026-07-05 修正:無需新欄位);解析入口新增 `archctx resolve --path`,tie-break=最具體匹配勝出、歧義拒絕 |
| `contract_files{agents,claude}` | projection 新 targetType `agent-context`,pathTemplate 產 nested `CLAUDE.md`/`AGENTS.md` 控制塊(ownership marker 機制現成) |
| `architecture_module` | 已被 `projection_rule.entity.summary` 覆蓋(`docs/architecture/modules/{stableId}.md`) |
| `workstream_dir` | 留 repo-harness(任務域),key 改 stableId;既有已關閉 workstream 目錄不搬 |
| `lsp_profile` | node attribute(agent 上下文一部分) |
| `verification_hints[]` | node `verification:` attribute,`prepare_task` 輸出進 brief |

## 3. 生命週期鉤點對照(SOP 映射)

| repo-harness 現況(census 佐證) | arch-context 接替 |
|---|---|
| SessionStart capability queue(session-start-context.sh:258-284)+ `capability-context sync --apply` | `archcontext_prepare_task` |
| post-edit-guard.sh:51-95 → architecture-queue record(drift cards) | `archcontext_checkpoint`(changedFileThreshold 內建) |
| context-contract-sync.sh:198-244(ARCHITECTURE CONTRACT 塊) | archctx projection(agent-context targetType) |
| capability-context.ts:406-525(CAPABILITY CONTEXT 塊;與上行雙 writer 寫同檔) | 同上,**兩個 writer 併一個** |
| check-architecture-sync.sh:230-268 freshness gate | `archcontext_complete_task` + `review.failOn: stale-context` |
| capability-resolver match(workstream-sync.sh:188 hard-exit;queue :479;sync :375) | `archctx resolve`;Stage 0 先走檔案級 adapter 讀 model YAML |
| plan-to-todo 填 `{{CAPABILITY_ID}}` | prepare_task 輸出 stableId + 建議 allowed_paths |

## 4. 遷移階梯(借 arch-context 自己的 yaml→dual→shadow→authoritative 模式;每階有 fail-closed 開關,無 silent fallback)

- **Stage 0(repo-harness 側,不等 daemon)**:
  1. 前置小刀:三份重複的 Capability type 與直讀 registry 的路徑(capability-config.ts:253-267、capability-context.ts:159-168)收斂到 capability-resolver 單點。
  2. policy.json `context.capability_source: "registry" | "archcontext"` 開關;選 `archcontext` 而 `.archcontext/model` 不存在 → 明確報錯。
  3. resolver 加 archcontext file-source:讀 `.archcontext/model/nodes/*.yaml` 轉成現有 Capability shape,7 個 consumer 不感知。
- **Stage 1(arch-context 側;recon 修正:M0 已全綠凍結,無時間窗口,改為 additive)**:ADR-0043 跨產品契約(stableId=capability ID、`source.include`=路徑歸屬、`extensions.lspProfile`/`extensions.verification` 慣例——頂層 schema `additionalProperties:false` + 升級規則要求新欄位走 extensions);projection 加 `agent-context` targetType(schema enum + projection-engine builder + default-manifest 三處);新增 `archctx resolve --path` 薄命令(現無任何 path→node 解析面)。
- **Stage 2(切換)**:本 repo 6 個 capability 一次性遷成 nodes(mapping 表寫死在遷移 script);`capability_source=archcontext`;post-edit 事件改薄為 checkpoint nudge;check-architecture-sync 委派 freshness。capabilities.json 直接停用(不留唯讀鏡像;測試面同步改)。
- **Stage 3(退役)**:刪 capability-config.ts、capability-context.ts、context-contract-sync.sh、select-agent-context-blocks.sh、capability-source-map.json、requests.jsonl 機制;workflow-contract `artifacts.requiredFiles` 移除 capabilities.json;init/migrate 改為偵測/提示 `.archcontext/`(external_tooling 加 `archcontext` readiness 條目,沿 codegraph 先例);downstream repos 走 migrate 升級。

## 5. 主要成本與風險

- **測試面**(census §3):scaffold-parity snapshot、workflow-contract requiredFiles 斷言(bootstrap/workflow-contract/migration 三組)、6 個 helper 測試——Stage 2/3 的主體成本。
- **arch-context 里程碑依賴**:Stage 2 依賴 `archctx resolve` 與 projection 可用;版本偏差以 schemaVersion fail-closed。
- **雙 repo 同步**:schema 在 arch-context、消費在 repo-harness;以 contracts 包的 JSON Schema + pinned schemaVersion 測試護欄。
- **break-first 順序**(registry 消失時):resolver → workstream-sync(exit 2)/check-architecture-sync strict → queue 降級 → context-contract-sync 退化為啟發式 → capability-context CLI 不可用——Stage 0 的開關設計必須覆蓋這條鏈的頭部。

## 6. 明確不做

- 不做 capabilities.json ↔ nodes 的長期雙向同步橋(No-Fallback;切換是單向、fail-closed)。
- 不把 workstreams/lessons/todos 移進 arch-context(任務記憶 ≠ 架構記憶)。
- 不等 GitHub App/雲面;整合只依賴 Local Core。

## 7. 2026-07-06 覆核修正與 gating 條件(雙軌評審結論)

Opus(deep-reasoner)與 Codex 盲評獨立收斂:現階段不接入 archctx 運行時,`capabilities.json` 保持權威;先做 repo-harness 內部收斂與只讀 export 橋(見 `plans/` 中 slug 為 archcontext-boundary-bridge 的 work package)。

覆核修正:
- live capability 已為 7 個(2026-07-06 實測 `.ai/context/capabilities.json`),§2 的 6 個已過期。
- node/v1 schema 的 `source.include/exclude/entrypoints` 欄位確實存在(`packages/contracts/fixtures/valid/architecture-node.json` 核實),但 arch-context 無任何 runtime 消費這些 glob 做 path→node 歸屬解析;`context`/`prepare`/`checkpoint` 全走 daemon,daemon 硬依賴 codegraph+SQLite。§2 "既有欄位覆蓋 prefixes" 只在 schema 層成立,不在 runtime 層成立。
- Stage 2 的 "capabilities.json 直接停用(不留唯讀鏡像)" 過於激進:會同時打破 workflow-contract requiredFiles、context-map 與 scaffold parity 測試,下游 migrate 會崩。停用必須分階段並同步遷移這些消費面。
- No-Fallback fail-closed 適用於 authority 切換,不適用於 hook 熱路徑與下游 scaffold 預設行為:hook 保持 fail-open/advisory,嚴格失敗只放在顯式 gate(`check-architecture-sync --strict`)。
- 實測環境狀態(2026-07-06):全域 archctx 為 0.1.4 且 `doctor` readiness `ok:false`;source checkout 0.1.5 未裝依賴無法直跑;`@archcontext/contracts` 有未解決的 npm scope blocker。

重開 Stage 2 討論的 gating 條件(三者齊備):
1. arch-context 交付 daemon-optional 的 `archctx resolve --path`(純讀 model YAML,不依賴 daemon+codegraph)。
2. `@archcontext/contracts` 乾淨發佈 npm 且 node schema 穩定(schemaVersion pin 可 fail-closed)。
3. projection 支持 `agent-context` targetType(schema enum + projection-engine + default-manifest 三處)。
