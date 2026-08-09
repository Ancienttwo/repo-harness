# Handoff:archctx 接管 docs/architecture 即時投影(mermaid 架構圖 + dataflow 握手圖)

> **Date**: 2026-08-08
> **From**: repo-harness 側(本 repo)
> **To**: arch-context 側(`Ancienttwo/arch-context`),由 owner 平行開工
> **前置協議**: `docs/researches/20260705-archcontext-capability-filing-handover.md`(§1 責任分界已批准;§7 覆核:gating 條件 1、2 已滿足,條件 3 source 層已對齊)
> **背景結論**: repo-harness 對 `docs/architecture/modules/**` 沒有任何內容 writer——只有一次性 stub(`capability-config.ts:311`,existsSync 即 return)、drift request 卡片、本地 CLAUDE/AGENTS 合約塊。模組文檔實質內容全靠 agent closeout 手寫。按 §1 分界,「架構/代碼真值投影到 `docs/architecture/**`」歸 arch-context;本 handoff 把該職責落成可執行需求。

## 1. 分工邊界(本輪)

- **repo-harness 側(已在進行,不需要等 archctx)**:2026-08-08 以人工 fan-out 產出 10 份 by-capability 基線文檔(`docs/architecture/modules/<domain>/<capability>.md`)+ `index.md` 全局 capability 地圖。這批文檔同時定義了投影的**目標形狀**(§2 文檔契約)。基線是一次性快照(`Verified against: main@13686d8d`),不解決持續更新——持續更新正是 archctx 要接的活。
- **arch-context 側(本 handoff 的交付範圍)**:實現 capability 模組文檔的機器投影,讓 mermaid 架構圖、dataflow 握手圖、模組表、規模信號隨代碼變更自動刷新,不再依賴 agent closeout 手寫。

## 2. 文檔契約(投影目標形狀,repo-harness 側已凍結)

每份 `docs/architecture/modules/<domain>/<capability>.md` 的固定結構:

1. 標題 `# <domain>/<capability> 架構文檔`
2. 引言 blockquote:狀態、`Verified against: <branch>@<commit>(<date>)`、Capability ID、Matched Prefixes、Local Contracts、事實優先級聲明
3. `## 1. P1:能力架構地圖` — mermaid flowchart(內部模組/入口/強依賴)+ 模組職責表(file:line 錨點)+ 規模信號(文件數/LOC + 復算命令)+ 依賴邊界
4. `## 2. P2:端到端數據流` — ≥1 張 mermaid sequenceDiagram 握手圖(輸入源頭→契約跨越→轉換→最終副作用)+ 錯誤路徑要點
5. `## 3. P3:設計決策與不變量` — 不變量、約束、10x 失效點
6. `## 4. 歷史決策記錄(append-only)` — dated 章節原文保留
7. `## Optimization Backlog` / workstream 鏈接(如有)

**機器/人工分區(投影的核心接縫)**:

| 區段 | 所有權 | 理由 |
|---|---|---|
| 引言塊 `Verified against` + Matched Prefixes | **archctx 投影** | 從 model node + git 狀態直接推導 |
| §1 P1 地圖(flowchart、模組表、規模信號、依賴邊) | **archctx 投影** | source-tree、import 邊、LOC 全部機器可推導;daemon 掛 codegraph 有 call-path 真值 |
| §2 P2 dataflow 握手圖 | **archctx 投影(首版可半自動)** | codegraph 的 call path 可生成候選 sequenceDiagram;語義命名可保留人工覆寫區 |
| §3 P3 + §4 歷史 + Backlog | **人工/agent 所有,投影絕不觸碰** | 設計判斷與歷史記錄不是機器可推導真值 |

投影必須用 ownership marker 界定機器區(與 repo-harness 既有 `<!-- BEGIN ... -->`/`<!-- END ... -->` 控制塊同構,archctx projection marker 機制現成)。**marker 外的內容 byte-for-byte 保留**——這是驗收的硬條件。

## 3. archctx 側交付清單(帶驗收標準)

1. **capability summary 投影 targetType**(對應 20260705 §2 `projection_rule.entity.summary` → `docs/architecture/modules/{stableId}.md`):
   - 輸入:`.archcontext/model/nodes/*.yaml`(stableId 形態 `capability.<domain>.<name>`,repo-harness id `verification-evals-checks` ↔ `capability.verification.evals-checks` 的映射表寫死在遷移 script)+ codegraph index。
   - 輸出:§2 契約中標記為「archctx 投影」的區段,mermaid v10 可解析。
   - 驗收:對本 repo 任一 capability 跑投影,機器區刷新、marker 外 byte-for-byte 不變;連續兩次投影冪等(無 diff)。
2. **P1 flowchart 生成**:從 node 的 `source.include/entrypoints` glob + import graph 產 flowchart(模組節點、入口、強依賴邊);邊必須來自真實 import/call 關係,不允許啟發式猜邊(No-Fallback:取不到真值就省略該邊並標註,不合成)。
3. **P2 sequenceDiagram 生成(可半自動)**:從 entrypoint 出發的 call path 產候選握手圖;若 daemon/codegraph 不可用,fail-closed 報錯,不退化成空模板。
4. **`agent-context` targetType 收尾**(20260705 §7 gating 條件 3 的殘留):schema enum + projection-engine builder + default-manifest 三處對齊已發佈物;這是 Stage 2 authority cutover 的前置,和本次投影可並行。
5. **freshness 信號**:投影輸出帶 `Verified against` commit;`review.failOn: stale-context` 能對「代碼變了、投影沒刷」報警(接 repo-harness `check-architecture-sync --strict` 委派的前置)。
6. **entity-summary 的 placement / pathTemplate 可配置化**(Stage 0 實作中新探明,archctx 側新交付項):現行渲染把 capability summary 硬編碼成扁平的 `capability-<domain>-<name>.md`,不讀 `targets.json` 的 pathTemplate,所以第 1 項要求的 `docs/architecture/modules/<domain>/<capability>.md` 巢狀落點目前投不出來。加分項:本輪 10 份已提交基線文檔的路徑與 repo-harness 側推導模板 10/10 一致,所以缺口只擋 archctx 的渲染方向,不擋 repo-harness 未來翻開關。驗收:pathTemplate 由 target 配置決定,同一 node 換模板即換落點,渲染不再持有路徑常量。
7. **`extensions` 鍵是 repo-harness ↔ archctx 的 node 慣例,不是可選裝飾**:`extensions.contractFiles`、`extensions.lspProfile`、`extensions.verification` 三者在 `capability_source: "archcontext"` 下為必填(顯式空陣列可以,缺鍵 fail-closed),因為 repo-harness 的 capability 契約不從 node 其他欄位推導它們。archctx 側若要在 schema 或 lint 上表達這組慣例,以這三鍵為準。
8. **`source.include` 走受限文法(D2),不是完整 glob**:只接受 `<dir>/**`(→ 前綴 `<dir>`)與「無萬用字元且不是既存目錄」的字面路徑(→ 該檔本身)兩種形狀,其餘一律 fail-closed;無萬用字元卻指向既存目錄的寫法被判為歧義並要求改寫成 `<dir>/**`;`source.exclude` 不支援;include 次序即前綴次序。收窄是刻意的——上游 glob 對整條 repo-relative 路徑比對,不收窄兩邊會對「一個邊界覆蓋什麼」給出不同答案。放寬是 additive,可日後再談。
9. **checkout 內 `@archcontext/contracts` 的 `files` 配方與 `archctx-contracts` 發佈物不一致(歷史缺口,AXR8 已收斂)**:初次 handoff 時,依發佈的 `archctx-contracts` 取得的 schema 檔集合,和從 arch-context checkout 內按 package `files` 欄位推得的集合對不上。AXR8 已以 `archctx-contracts@0.4.0` 的公開 tarball 作唯一 schema authority,並把它與 `archctx@0.4.0` 一起精確固定為 `repo-harness@0.14.0` production dependency;consumer 不再依賴 sibling checkout 或 file overlay。

## 4. repo-harness 側對接承諾(archctx 交付後的 Stage 2 work-package,另立)

- policy.json `context.capability_source: "registry" | "archcontext"` 開關(20260705 §4 Stage 0 設計,fail-closed)。
- post-edit drift 卡片改薄為 checkpoint nudge;`check-architecture-sync` freshness 委派 archctx。
- 本輪產出的 10 份基線文檔按 §2 分區補 marker,作為投影首次接管的底稿(機器區允許被覆蓋,人工區不允許)。

## 5. 明確不做(沿用 20260705 §6)

- 不做 capabilities.json ↔ nodes 長期雙向同步;authority 切換單向、fail-closed、另立 work-package。
- 不把 workstreams/lessons/todos 移進 arch-context(任務記憶 ≠ 架構記憶)。
- 投影不生成 P3/歷史/Backlog 的任何內容,也不「幫忙整理」它們。

## 6. AXR8 release cutover readback(2026-08-09)

- npm `latest` 已指向 `archctx@0.4.0`;公開包的 package-local
  `@colbymchenry/codegraph` 精確為 `1.5.0`,Node 24 clean-room 的 41-command
  help、`doctor` 四個 runtime version 與 `update --check` 全部一致。
- `repo-harness@0.14.0` candidate 從 lockfile 精確解析
  `archctx@0.4.0` 與 `archctx-contracts@0.4.0`;provider handshake 回報
  `binaryPath` 位於 package-local dependency,不走 PATH。
- self-host `projection_failure_gate` 與 `freshness_gate` 已由 advisory 升為
  strict。`check-architecture-sync --format json` 的 candidate runtime
  readback 為 provider `ready`,pending/running/dead-letter/human-action/
  adoption-required 全為 0,10 個 capability 的 Mermaid-only 投影基線仍由
  `tests/architecture-projection-e2e.test.ts` 逐一驗證。
- 完整 candidate release gate 的 2313 tests、1 skip、0 fail 已通過;首次
  gate 只因本 research 尚未同步而被 `check-task-sync` 擋下,補本段後重跑
  workflow/release tail 作最終 authority。Claude review 依 owner 指令跳過,
  closeout 必須記 typed user waiver,不得聲稱 external Claude pass。
