# PRD: ArchContext-backed Refactor Mode and Execution Integration

> **Status**: Draft
> **Slug**: `archctx-backed-refactor-mode`
> **Created**: 2026-09-03 04:35
> **Updated**: 2026-09-03 05:07
> **Source Spec**: `docs/spec.md`
> **Tier**: standard
> **Baseline**: `main@9e922e47a7970d8aded7a3597912df8c02f7ca34`
> **Upstream Contract Authority**: `/Users/ancienttwo/Projects/arch-context/packages/contracts/src/{refactor,ledger,schema}.ts`（arch-context main，PR #129）
> **Upstream Dispatch**: `/Users/ancienttwo/Projects/arch-context/docs/researches/20260903-program-b-dispatch.md`（main `278fbad`）
> **Source Research**: `docs/researches/20260902-restructure.md`（Program B；§二十二 為上游對齊記錄）
> **Related PRD**: `plans/prds/20260902-2238-gpt-pro-seeded-repair-campaign.prd.md`（其 Phase B 與本 PRD 共用 Cutover Closure Gate）

## AI Quick-Read Card

- Problem: repo-harness 想主動發現重構機會、主動清理技術債，但它沒有結構判定權威（該不該改、改在哪一層）、沒有方案作者（誰來寫出可執行的重構提案）、也沒有收口閘門（舊路徑是否真的死了）。三者缺一，重構就只能靠人記得。
- Users: Human Refactor Owner、Refactor Program Controller、Proposal Author（本地 subagent 或 GPT Pro）、Worker、Architecture Approver、Repair Campaign Controller、Maintainer。
- Platform: repo-harness CLI root action `refactor` + 既有 fleet acquire 執行鏈 + package-local `archctx` provider（exact version pin，CLI-only 消費）+ 既有 GPT Pro delegate 通道。
- P0 surface: Cutover Closure Gate、discovery 與 proposal authoring loop、兩階段 provider handshake、Refactor Mode policy 與 state machine、`RefactorWorkflowRoute` 投影、module/cross-module materialization、architecture intervention route、execution binding 與 candidate verify、post-merge resolution 與 joined board、canary ladder。
- Core metric: 一條由本地主動發現的結構問題，經 proposal authoring 取得 `scale`，走完執行鏈，最終由 ArchContext 回報 `disposition: 'resolved'`——全程零本地結構判定、零本地狀態複製、每一跳都有可重建 receipt。
- Hard constraint: ArchContext 是儀器/閘門/賬本，repo-harness 是作者/調度/收口。repo-harness 不得實作任何模組統計、依賴圖、cycle 偵測、refactor 評分或 CodeGraph 直讀；不得持有第二份 recommendation 狀態；不得從 Issue 標題推斷 scale；版本或 feature 不匹配一律 fail closed，永不本地 fallback。
- Key risk: 「重構做完了但舊路徑還在」。ArchContext 能證明結構指標改善，證明不了舊 public surface、舊 fallback、舊 test、舊 doc 被清乾淨；沒有 Cutover Closure，指標改善會被當成重構完成。
- Unknowns: `archctx refactor` CLI 尚未實作（上游只凍結 contract），0.5.0/0.5.1 未發布；first-class provenance 欄位（GPT Pro 來源標註）要等 0.6.0 contract 變更；Cutover Closure inventory 能否在不做語義分析下確定性判定（本 PRD 的 falsifier）。
- Acceptance scenarios: 無 proposal 的掃描必須回 `scale = null` 且不得物化任務；`scale = 'cross_module'` 被投影成 `module_refactor` 時 `refactor_route_conflict`；PR 合入但 after-scan 未跑時只能顯示 `merged_pending_measurement`。
- Suggested next step: **不生成 Sprint**。先把 Module 1（Cutover Closure Gate）抽成獨立 work-package plan——它零 archctx 依賴、可立即落地、且是 GPT Pro campaign Phase B 的前置——並在一個真實歷史重構 PR 上跑 First Proof Point。

## Problem

用戶要的能力是一句話：**repo-harness 可以主動發現重構機會並清理技術債；必要時請 GPT Pro 獨立調研拿方案。** 這句話拆開來是三個當前都不存在的東西。

**發現**缺結構判定權威。「這是單模組的事還是跨模組的事」「證據夠不夠」「這算不算動了架構」目前只有人腦答案。把這些算法補在 repo-harness 裡是錯的方向——LOC 統計、import graph、fan-in/fan-out、SCC 偵測、模組邊界解析，全都是脫離 repo-harness 也對別的倉庫有用的能力，它們屬於 ArchContext。

**方案**缺作者。這是最容易被誤判的一環：上游凍結的 contract 明確規定，ArchContext **不寫提案**。`RefactorRequestV1.proposal?: RefactorProposalV1`（`refactor.ts:166-173`）是**輸入**，`RefactorProposalV1.authoredBy`（`refactor.ts:154-164`）必須是合法的 agent/human 配對，`daemon` 與 `system` 永遠不能撰寫。validator `refactor.ts:545-547` 強制 `scale === null` 恰好在 `proposalDigest === null` 時成立——**沒有提案就沒有判級**。所以一次純觀察掃描只會回 observations 與 `scale = null`；`scale` 是提案被評估之後才存在的東西。寫提案是 repo-harness 的職責，而且是可以外包的職責：本地 subagent 能寫，GPT Pro 透過既有 delegate 通道做獨立調研後也能寫。

**收口**缺閘門，且這一端只在 repo-harness 有意義。ArchContext 能在合入後量出「cycle 少了 2 條、fan-out 降了」，量不出「舊的 `legacyResolve()` 還在 export」「舊測試還在跑舊路徑」「文檔還在教舊 API」「相容分支沒有移除期限」。這些是執行層事實，只有拿得到 contract kill-list、diff 與 AcceptanceReceipt 的一方能判。

`scripts/cutover-closure.ts` 不存在，`assets/workflow-contract.v1.json` 沒有 `cutoverClosure` 鍵（已核）。而上游凍結的 `REFACTOR_EXECUTION_EVIDENCE_KINDS` 已經包含 `cutover_closure`，`RefactorExecutionEvidenceRefV1` 形狀為 `{ kind, locator, sha256 }`——上游已經預留了消費介面，repo-harness 一份證據都還沒有。

### Product Direction

- Hard Constraints:
  - ArchContext 是儀器、閘門、賬本；repo-harness 是作者、調度、收口。repo-harness 不得出現 `src/core/refactor/module-statistics.ts`、`cycle-detector.ts`、`refactor-score.ts` 這一類本地結構算法，也不得直接解析 CodeGraph 輸出。
  - repo-harness 不得複製 recommendation 狀態。`resolved`、`superseded`、`accepted` 一律從 ArchContext 讀回，本地資料模型不得有對應欄位。
  - GPT Pro 與任何 proposal author 都不決定 `scale`、不決定 `RefactorWorkflowRoute`、不決定 recommendation 狀態。作者只提供 `intent` / `scopePaths` / `targetOutcomes` / `killList` / 可選 `targetDelta`；判級一律回 ArchContext。
  - 不得從 Issue 標題或正文推斷 scale。
  - provider 版本或 feature 集合不匹配時，一律 `refactor_provider_version_mismatch` 直接失敗，永不啟用本地 fallback 統計。
  - 不得以 git link 或本地路徑在 runtime 依賴未發布的 contract；只允許 compile-only 型別準備。
  - Architecture intervention 永遠需要人工批准，走既有 `architecture-projection accept`；v1 禁止自動批准與自動合入。
  - 重構若同時改變使用者可見行為、product requirement、public API semantics、新 capability 或新 workflow，必須退出 Refactor Mode 轉回 `PRD → Sprint → Plan`。
  - 不新增 skill 或 facade package，不復活 autoplan，不引入第二個 workflow engine。
  - `mode = off` 時所有 mutation 命令失敗退出，不靜默 no-op（沿用 BRC3 對 `development_campaign.mode` 的既定形狀）。
- Recommended Defaults:
  - `refactor.mode` 安裝預設 `off`；晉級階梯 `off → shadow → active/module-only → active/cross-module`。
  - provider 分兩階段：Stage 1 `archctx@0.5.0`（scan/record）解鎖 Module 2-8，Stage 2 `archctx@0.5.1`（verify）解鎖 Module 9-10 的測量面。`required_features` 按 stage 分組，不是一份扁平列表。
  - `proposal_author` 預設 `local`，可選 `gpt_pro` 或 `ask`；GPT Pro 只在本地作者判定證據不足或需要外部視角時才請。
  - `maximum_modules_per_program = 10`、`maximum_parallel_modules = 3`。
  - `require_cutover_closure` 只有在 Module 1 真正落地後才置 `true`；`require_post_merge_measurement` 在 verify stage 就緒前只能是 `false`，不得用本地推斷頂替。
  - concurrency key 取 architecture node id：同一 node 的 writer 不並行。
  - 授權複用 `ProgramAuthorizationV1`，refactor 欄位作為其 payload。
- Freedoms:
  - 一個 program 的 module 數可以遠少於上限；一次只跑一個 module 是合法結果。
  - proposal author 的調查手法自由（讀碼、跑 fixture、查 CodeGraph、請 GPT Pro）；受約束的只有輸出形狀與作者身份配對。
  - proof investigation 的具體手法自由（補 CodeGraph index、跑真實 entrypoint fixture、確認 dynamic caller）。
  - board 的 Markdown 呈現格式是顯示約定，不是權威。

### Feasibility Boundary

- Confirmed:
  - 上游 rf0+rf1a 已完成並凍結：`refactor.ts` 與 `ledger.ts` 定義了 `RefactorAssessmentV1`、`ModuleStatisticsSnapshotV1`、`RefactorResolutionEvidenceV1`、`RecommendationV3` 與相關閉集枚舉。
  - `REFACTOR_SCALES`（`refactor.ts:28-34`）恰為 `architecture | cross_module | insufficient_evidence | model_adoption_required | module`；`REFACTOR_SCALE_REASON_CODES`（`:35-46`）為另外 10 值。
  - validator `refactor.ts:545-547` 強制 `scale === null` 恰在 `proposalDigest === null` 時成立；`:548-550` 強制 `scale === 'architecture'` 時 `majorChangeReasons` 非空。
  - `REFACTOR_PROPOSAL_AUTHOR_PAIRS`（`refactor.ts:78-83`）恰為 `cli→cli`、`mcp→mcp`、`subagent→subagent`、`developer→manual`；違反回 `AC_REFACTOR_PROPOSAL_UNAUTHORED`（作者閘門在 `:780`）。
  - 上游定案（2026-09-03）：0.5.0 不新增任何 source 值。`authoredBy` 的語義是**把提案送進 ArchContext 並為其負責的行動者**，不是內容的產地。GPT Pro 起草的提案有兩條合法路徑：人審閱並署名 → `developer → manual`（責任在人）；repo-harness agent 採納草稿並以自己名義提交 → `subagent → subagent`（責任在該 agent），來源寫進 `intent` 自由文字。`cli → cli` 保留給操作者透過 CLI 提交自己的提案。GPT Pro 永遠不是任何一種 kind。
  - `REFACTOR_EXECUTION_EVIDENCE_KINDS` 已含 `cutover_closure`；`RefactorExecutionEvidenceRefV1` 為 `{ kind, locator, sha256 }`。
  - `REFACTOR_KILL_LIST_KINDS` 恰為 `path | relation | symbol`（`refactor.ts:64`）。
  - `RecommendationV3 = RecommendationV3Base & RecommendationV3CategoryPayloadV1`，category 恰為 `practice | structural_observation | refactor_proposal`（`ledger.ts:26`）；架構級是 `refactor_proposal` 且 `scale = 'architecture'`，不是獨立 category；`risk` 在 `RecommendationV3Base`。
  - repo-harness 已有可直接複用的 provider 呼叫模式：`src/effects/architecture/archctx-provider.ts` 的 package-local 解析、Node runtime 檢查、`assertArchctxCapabilities`（`src/core/architecture/projection.ts:198`）feature superset handshake、exact repository/workspace/head/worktree identity 綁定。
  - `ARCHITECTURE_MAJOR_CHANGE_REASONS`（13 值，`src/core/architecture/projection.ts:23-28`）與上游 `ArchitectureMajorChangeReasonCode` 同源。
  - 人工架構批准路徑已存在：`src/effects/architecture/projection-acceptance.ts` 的 `acceptArchitectureProjectionCandidate` / `reconcileArchitectureProjectionCandidate`，CLI 在 `src/cli/commands/architecture-projection.ts`。
  - 版本化 JSON 投影既有形狀：`src/core/fleet/board.ts` 的 `FLEET_BOARD_PROTOCOL = 3`；`src/core/publication/merge-readiness.ts` 的 `MERGE_READINESS_PROTOCOL = 1`。
  - Sprint backlog 六欄列文法唯一權威在 `src/core/state/sprint-backlog-rows.ts`，與 `scripts/sprint-backlog.sh` 的 awk 掃描綁定。
  - GPT Pro delegate 協議已存在：`assets/skills/repo-harness-chatgpt/references/delegate.md`（GPT Pro 為外部資深工程師，本地持獨立驗收權；GPT Pro 自述已驗證不構成證據；PromptBundle 內容級出境掃描強制）。
  - `scripts/cutover-closure.ts` 不存在；`assets/workflow-contract.v1.json` 無 `cutoverClosure` 鍵。
  - `ProgramAuthorizationV1` 不在 `src/` 中，定義在 `plans/prds/20260828-2321-guarded-merge-unattended-automation.prd.md:239`，由 campaign sprint 第 3 行 BRC3 建造。
  - npm latest `archctx@0.4.8` / `archctx-contracts@0.4.8`，發布於 2026-09-02T08:32:49Z，早於 rf1a（2026-09-03 04:00 +0800 合入 main）。repo-harness 現 pin `0.4.7`（`src/core/architecture/projection.ts:12`）。
  - 上游剩餘順序：RF1b（實作中）→ RF2 → RF3 → RF5a（`0.5.0` + npm readback）→ RF4 → RF5b（`0.5.1`）。每次 readback 完成後上游以 session chat 通知並附 `capabilities --json`。
- [UNKNOWN]:
  - `archctx refactor scan|record|verify` 的實際 CLI args、stdout 契約與退出碼。上游只凍結了 contract。
  - `archctx@0.5.0` / `0.5.1` 的 capabilities feature 實際命名。本 PRD 使用的 feature 名來自上游 dispatch §2，仍需 readback 確認。
  - first-class provenance 欄位（例如 `provenance?: { provider, ref }`）的形狀與時程。上游明示這是 0.6.0 的 contract 變更，0.5.x 期間來源只能寫在 `intent` 自由文字裡。
  - Cutover Closure inventory 能否在不讀 CodeGraph、不做語義分析的前提下對真實歷史重構 PR 做出確定性判定。這是本 PRD 的 falsifier。
- [UNVERIFIED]:
  - `ProgramAuthorizationV1` 的最終落地欄位。BRC3 尚未合入 main。
  - `archctx refactor verify` 的 `--request-json` 請求包絡待 rf5b 凍結（上游 sprint 第 9 行）。上游定案（2026-09-03）：`RefactorVerificationRequestV1` **會**在 `0.5.1`（RF4/RF5b）凍結，預期形狀為 `archcontext.refactor-verification-request/v1 { recommendationId, expectedHeadSha, expectedWorktreeDigest?, executionEvidenceRefs? }`，核心 API 維持 `refactorVerifyInvariantIssues(afterSnapshot, evidence)`（`refactor.ts:723`）。最終欄位以 0.5.1 readback 通知為準，標 `[UNVERIFIED until rf5b]`；0.5.1 之前不得為其撰寫 validator。
  - 上游錯誤碼 `AC_REFACTOR_STALE`、`AC_REFACTOR_EVIDENCE_REQUIRED`、`AC_REFACTOR_PROPOSAL_UNAUTHORED`（`schema.ts:33-35,74-76`）的實際觸發條件與 stdout 呈現。
- 研究文檔早期草案中不成立的前提（已由其 §二十二 對齊記錄修正，本 PRD 依修正後版本）:
  - 早期草案稱「繼續執行仍使用 `repo-harness execute`」。該命令在本倉庫不存在。執行走既有 fleet acquire 鏈。
  - 早期草案把 `required_features` 寫成扁平四元列表。若照此實作，0.5.0 發布後所有 scan 都會 fail closed。
  - 早期草案把 `proof_required` / `no_action` 當成上游判級結果。兩者都不是 `RefactorScale` 值。
  - 早期草案假設 Cutover Closure Gate 已存在。它不存在，且已被 campaign PRD 推遲到 Phase B。

## Users

### Primary Users

- User: Human Refactor Owner
  - Need: 讓倉庫自己提出「這裡該重構」，必要時外包給 GPT Pro 拿一份獨立方案，而不必自己論證。
  - Success signal: 一輪 discovery 之後拿到的是帶 `scale` 與 `targetOutcomes` 的具體提案，不是一份感想清單。
- User: Refactor Program Controller（本地 parent host）
  - Need: 每次被喚醒時能確定性地算出下一個唯一動作，崩潰後能從 event chain 完全重建狀態。
  - Success signal: 任意 step 崩潰重放後不產生重複的 `archctx refactor record` 或重複的 Work Package。
- User: Proposal Author（本地 subagent 或 GPT Pro）
  - Need: 明確知道要交什麼形狀（`intent` / `scopePaths` / `targetOutcomes` / `killList` / 可選 `targetDelta`），以及自己不決定什麼（scale、route、狀態）。
  - Success signal: 提交的 proposal 通過作者身份閘門並得到 ArchContext 的判級，而不是被 `AC_REFACTOR_PROPOSAL_UNAUTHORED` 打回。
- User: Worker（Claude/Codex）
  - Need: contract 明確告訴它要殺掉什麼，且收口標準是機器判定而非評審口味。
  - Success signal: closure 失敗時拿到的是閉集錯誤碼與缺項清單，不是「請再檢查一下」。
- User: Architecture Approver
  - Need: 拿到 target state、migration state、compatibility contracts、kill list、benefit/cost ledger 與 falsifier 之後再決定。
  - Success signal: `unresolvedTargets` 非空時系統直接擋住，不讓提案進入批准流程。

### Secondary Users

- User: Repair Campaign Controller（GPT Pro campaign）
  - Need: 能把 refactor kind 的 Issue 交給這條 lane，而不必自己判定重構層級。
  - Success signal: campaign 用短 candidate alias（`C01`..）引用候選，不複製 64 位 digest，且不會重複 adopt 已 `resolved` 的 recommendation。
- User: Maintainer
  - Need: 從 board 一眼看出「發現 → 提案 → 執行 → 完成」四段分別卡在哪，且每格都能反查權威來源。
  - Success signal: 刪掉整個 board 目錄後可以從權威完全重建，內容逐字一致。

## Success Criteria

| Metric | Target | Measurement Method | Degradation Threshold |
|---|---:|---|---:|
| repo-harness 中的本地結構算法數量 | 0 | 負向測試：禁止 `src/core/refactor/**` 出現統計/圖/評分符號；禁止 import CodeGraph | ≥1 |
| 本地持有的 recommendation 狀態欄位數 | 0 | 型別層斷言：`RefactorProgramV1` / `RefactorExecutionBindingV1` 無 status/resolved/done 欄位 | ≥1 |
| 無 proposal 掃描誤產 scale 的次數 | 0 | 負向 fixture：純觀察掃描斷言 `scale === null && proposalDigest === null` | ≥1 |
| 作者身份閘門的誤放行次數 | 0 | 負向 fixture：`daemon`/`system` 與非法配對均回 `AC_REFACTOR_PROPOSAL_UNAUTHORED` | ≥1 |
| 版本或 feature 不匹配時的 fallback 次數 | 0 | 負向 fixture：提供 0.4.8 provider，斷言 `refactor_provider_version_mismatch` 且零產出 | ≥1 |
| `architecture` / `cross_module` 被降級的次數 | 0 | route 投影 property test，遍歷 scale × majorChangeReasons 組合 | ≥1 |
| `insufficient_evidence` 下的任務物化次數 | 0 | 負向 fixture | ≥1 |
| Cutover Closure 漏判率（宣告刪除但仍存在） | 0 | 真實歷史重構 PR 的 characterization fixture | ≥1 |
| Board 從權威重建的逐字一致率 | 100% | 刪除 `tasks/workstreams/refactor/` 後重建並 diff | <100% |
| `merged` 直接顯示為 `resolved` 的次數 | 0 | 負向 fixture：merge 後不跑 after-scan | ≥1 |
| 同一 architecture node 的並行 writer 數 | 1 | 併發 canary | ≥2 |
| 崩潰重放後的重複 provider mutation | 0 | 在每個 persist 邊界注入崩潰後重放 | ≥1 |

## Acceptance Scenarios

### Scenario 1（positive，Module 1）

- Given: 一個 refactor contract 宣告 kill list 含 `symbol:legacyResolve`、`path:src/legacy/resolve.ts`，closure inventory 六類均已顯式處置。
- When: candidate head 上執行 closure gate。
- Then: 產出 `CutoverClosureV1`，狀態 `closed`，帶 sha256，可直接填入上游 `RefactorExecutionEvidenceRefV1` 的 `{ kind: 'cutover_closure', locator, sha256 }`。
- Machine-checkable evidence: closure JSON `status === 'closed'`；sha256 與 canonical digest 一致。

### Scenario 2（negative，Module 1）→ Non-goal「不把指標改善當成重構完成」

- Given: kill list 宣告移除 `symbol:legacyResolve`，但 candidate head 上該符號仍被 `src/compat/shim.ts` export。
- When: 執行 closure gate。
- Then（must NOT）: 不得回 `closed`，不得降級為 warning，不得因 archctx 指標已改善而放行。必須回 `refactor_closure_residue` 並列出殘留 selector。
- Machine-checkable evidence: 退出碼非零；輸出含 `refactor_closure_residue`；`residues[]` 非空。

### Scenario 3（negative，Module 1）→ Non-goal「closure 不做語義分析」

- Given: contract 未宣告任何 kill list。
- When: 執行 closure gate。
- Then（must NOT）: 不得自行推斷應刪什麼，不得掃 diff 猜測舊實現，不得默認 pass。必須回 `not_applicable`；在 refactor profile 下升級為 `refactor_closure_missing`。
- Machine-checkable evidence: 輸出無任何未宣告 selector；refactor profile 下退出碼非零。

### Scenario 4（positive，Module 2）

- Given: `mode = shadow`，倉庫上一次 discovery 掃描產生 12 條 `structural_observation`。
- When: 對其中一條 `cycle` observation 派本地 subagent 撰寫 proposal，`authoredBy = { kind: 'subagent', source: 'subagent' }`，再帶 proposal 重跑 scan。
- Then: 第一次掃描 `scale === null`；第二次掃描回具體 `scale` 與 `scaleReasonCodes`；`recommendationId` 在兩次之間可追溯。
- Machine-checkable evidence: 兩次 assessment 的 `proposalDigest` 分別為 `null` 與非空；`scale` 隨之變化。

### Scenario 5（negative，Module 2）→ Non-goal「作者不決定 scale」

- Given: proposal author（本地 subagent 或 GPT Pro）在返回內容中自行宣稱「這是 module 級重構」。
- When: 提交 proposal。
- Then（must NOT）: 不得採信作者的層級宣稱，不得跳過 `archctx refactor scan` 直接物化，不得從 Issue 標題推斷 scale。`scale` 只能來自帶 proposal 的 assessment。
- Machine-checkable evidence: program 的 `scale` 來源標註為 `archctx`；fixture 中作者宣稱與實際 scale 不同時以 assessment 為準。

### Scenario 6（negative，Module 2）→ Non-goal「非法作者不得撰寫提案」

- Given: 一個 `authoredBy = { kind: 'daemon', source: 'cli' }` 的 proposal。
- When: 提交。
- Then（must NOT）: 不得接受，不得本地改寫成合法配對再送。必須原樣透出 `AC_REFACTOR_PROPOSAL_UNAUTHORED`。
- Machine-checkable evidence: 錯誤碼逐字匹配；零 recommendation 寫入。

### Scenario 6b（negative，Module 2）→ Non-goal「不得把目錄或 glob 當 scopePaths 提交」

- Given: 一份 proposal 的 `scopePaths` 含目錄或 glob（例如 `src/effects/refactor/` 或 `src/**/*.ts`），未展開成檔案路徑。
- When: Program B 直接提交。
- Then: 上游把這些 path 視為 unowned，回 `scale = 'model_adoption_required'`；Program B **不得**物化任何執行型任務，也不得本地把 `model_adoption_required` 改判成別的 scale 再繼續。修法是在提交前展開成檔案清單後重跑 scan。
- Machine-checkable evidence: assessment `scale === 'model_adoption_required'`；`plans/refactors/**` 與 `tasks/workstreams/refactor/**` 零寫入；展開後重跑得到非 `model_adoption_required` 的 scale。

### Scenario 7（negative，Module 3）→ Non-goal「不做本地 fallback」

- Given: package-local `archctx` 為 `0.4.8`（今日 npm latest，無 refactor 能力）。
- When: `repo-harness refactor scan`。
- Then（must NOT）: 不得本地統計任何模組數據，不得降級為部分結果，不得跳過 assessment 直接進 materialization，不得以 git link 指向未發布 contract 頂替。必須 `refactor_provider_version_mismatch` 且零產出。
- Machine-checkable evidence: `plans/refactors/**` 與 `tasks/workstreams/refactor/**` 零寫入；錯誤碼精確匹配。

### Scenario 8（negative，Module 4）→ Non-goal「off 不得靜默 no-op」

- Given: `refactor.mode = "off"`（安裝預設）。
- When: 執行 `repo-harness refactor start`。
- Then（must NOT）: 不得靜默返回成功，不得寫入任何 program 檔案。必須失敗退出。
- Machine-checkable evidence: 退出碼非零；`git status` 零變更。

### Scenario 9（negative，Module 5）→ Non-goal「不得降級 route」

- Given: `RefactorAssessmentV1.scale === 'cross_module'`。
- When: 任何路徑（投影、policy 覆寫、agent 手工編輯 program 檔）試圖把 route 設成 `module_refactor`。
- Then（must NOT）: 不得接受。必須 `refactor_route_conflict`。同一斷言對 `scale === 'architecture'` 降到 `architecture_intervention` 之下亦成立。
- Machine-checkable evidence: property test 遍歷 `REFACTOR_SCALES × majorChangeReasons 冪集`，斷言 `architecture` → `{architecture_intervention, proof_required, no_action}`、`cross_module` → 不含 `module_refactor`。

### Scenario 10（negative，Module 6）→ Non-goal「證據不足不得物化」

- Given: `scale === 'insufficient_evidence'`，`scaleReasonCodes` 含 `code-facts-truncated`。
- When: 嘗試 materialization。
- Then（must NOT）: 不得建立 Work Package、Sprint 行、worktree 或 PR；不得因 `pressure.level === 'high'` 而放行。只能建立 investigation Work Package。
- Machine-checkable evidence: `plans/plan-*.md` 無執行型新增；program 停在 `proof_required`。

### Scenario 11（negative，Module 6）→ Non-goal「recommendation 不直接成為 Lease」

- Given: 一次 materialization 產生 3 個 module Work Package，第 3 個寫入時磁碟失敗。
- When: 重放。
- Then（must NOT）: 不得留下孤立 Work Package；不得讓任何 recommendation 直接獲得 Lease 或 ClaimToken。materialization 必須原子。
- Machine-checkable evidence: 崩潰注入後 `plans/` 與 sprint backlog 無部分寫入；Lease store 無 recommendation-derived 條目。

### Scenario 12（negative，Module 7）→ Non-goal「架構變更不得自動批准」

- Given: route 為 `architecture_intervention`，`ArchitectureTargetDeltaV1.unresolvedTargets` 非空。
- When: 嘗試進入 implementation。
- Then（must NOT）: 不得建立 contract，不得派工，不得因 assessment confidence 為 `high` 而放行。必須停在 `architecture_approval_required`。
- Machine-checkable evidence: `tasks/contracts/**` 無新增；缺口清單非空。

### Scenario 13（negative，Module 8）→ Non-goal「binding 不持有狀態」

- Given: 一次執行完成，PR 已合入。
- When: 寫入 `RefactorExecutionBindingV1`。
- Then（must NOT）: binding 不得含 `status`、`resolved`、`done`、`recommendationStatus` 任何欄位；不得因合入而在本地標記 recommendation 為完成。
- Machine-checkable evidence: 型別層測試斷言 binding 鍵集合恰為不可變引用集；JSON schema 拒絕多餘鍵。

### Scenario 14（negative，Module 9）→ Non-goal「PR merged ≠ resolved」

- Given: PR 已合入 main，尚未在 exact new main 上跑 after-scan；且當前只有 Stage 1 provider（`0.5.0`），refactor 類的 `resolved` 在 0.5.0 不可達。
- When: 產生 board。
- Then（must NOT）: architecture result 欄不得顯示 `Resolved`，不得從 merge 事件推斷結構已改善。必須顯示 `merged_pending_measurement`。
- Machine-checkable evidence: board JSON 該列 `architectureResult === 'merged_pending_measurement'`，來源標註為 `repo-harness`。

### Scenario 15（positive，Module 9）

- Given: Stage 2 provider 就緒，after-scan 在 exact new main 上執行，ArchContext 回 `disposition === 'resolved'`。
- When: 產生 board。
- Then: 該列顯示 `Resolved`，來源標註 `archctx`；刪除整個 `tasks/workstreams/refactor/` 後重建，逐字一致。
- Machine-checkable evidence: 重建後 `git diff --exit-code tasks/workstreams/refactor/` 為空。

### Scenario 16（negative，Module 10）→ Non-goal「階梯不得跳級」

- Given: 當前 `mode` 從未進入過 `shadow`。
- When: 嘗試直接設為 `active/cross-module`。
- Then（must NOT）: 不得接受跳級。晉級必須逐級，且每級有對應 canary 通過記錄。
- Machine-checkable evidence: policy 校驗拒絕；錯誤訊息指名缺失的前一級與其 canary。

## Non-goals

- 不在 repo-harness 實作 module analyzer、cycle detector、SCC 分析、fan-in/fan-out 計算、refactor 評分或模組邊界解析器。
- 不在 repo-harness 直接讀取或解析 CodeGraph 輸出。
- 不建立第二份 `refactor-ledger.json`，不複製 ArchContext 的 recommendation 狀態。
- proposal author（含 GPT Pro）不決定 `scale`、不決定 route、不決定 recommendation 狀態；不得從 Issue 標題或正文推斷 scale。
- 不接受非法 `authoredBy` 配對，不本地改寫作者身份使其合法；不把 GPT Pro 偽裝成任何一種 `kind`，0.5.x 期間不自造 provenance 欄位。
- 不把目錄或 glob 當 `scopePaths` 提交；展開成檔案路徑是 Program B 的責任，收到 `model_adoption_required` 不得本地改判。
- 不依賴 v1 未推導的 `majorChangeReasons`（`node-added`、`lifecycle-changed`）作為任何 route 或閘門的觸發條件。
- 不新增 `repo-harness execute` 命令；不新增 skill 或 facade package；不復活 autoplan。
- provider 版本或 feature 不匹配時不提供任何本地 fallback；不以 git link 或本地路徑在 runtime 依賴未發布 contract（compile-only 型別準備除外）。
- 0.5.x 不新增 MCP 工具，只透過 CLI 消費；0.5.1 之前不得為 `archctx refactor verify` 的請求包絡撰寫 validator。
- 不新建第二個授權協議；複用 `ProgramAuthorizationV1`。
- `RefactorExecutionBindingV1` 不含任何狀態欄位；`PR merged` 永遠不等於 `resolved`。
- Closure gate 不做語義分析、不猜測應刪內容；未宣告即不判定。
- `scale = 'insufficient_evidence'` 時不得物化執行型任務。
- 架構 route 不得自動批准、不得自動合入、不得被本地降級；`cross_module` 不得降級為 `module_refactor`。
- 不把 `tests.callerCoverage` 當作 essential evidence（v1 恆為 `null`）。
- 不以 `cross-review --json` 的 `findings` 欄位判定外部審查通過；一律讀 transcript。
- 晉級階梯不得跳級。
- 本 PRD 不生成 Sprint，直到 Stage 1 在 npm 發布**且** campaign sprint 第 3 行 BRC3 已清。
- `0.4.7 → 0.4.8` 的 pin bump 是獨立技術債，不屬於本 PRD。

## Module Behaviors (P0)

### Module 1 — Cutover Closure Gate（provider-independent，先行落地）

- Purpose: 判定「被替換的舊東西是否真的死了」。repo-harness 在整條鏈上唯一的獨占判定權威，也是本 PRD 唯一不被上游發布節奏阻塞的模組。
- Hard Constraints:
  - 只做確定性判定。輸入是 contract 顯式宣告的 kill list 與 candidate head 的真實檔案狀態；不做語義推斷、不猜測、不讀 CodeGraph、不呼叫 archctx。
  - inventory 六類必須全部顯式處置，缺一即失敗：`old_implementation`、`callers`、`fallback`、`tests`、`docs_and_projections`、`compatibility_expiry`。
  - 每類 disposition ∈ `removed | migrated | retained_with_reason | not_applicable`；`retained_with_reason` 必須同時帶 `reason` 與 `expiry`。
  - selector kind 只有 `path | relation | symbol`，對齊上游 `REFACTOR_KILL_LIST_KINDS`（`refactor.ts:64`）。
  - 產出必須是版本化 JSON 且帶 canonical sha256，形狀能直接餵給上游 `RefactorExecutionEvidenceRefV1`。
  - 失敗一律閉集錯誤碼，不得降級為 warning。
- Recommended Defaults: 落 `scripts/cutover-closure.ts` + `assets/workflow-contract.v1.json#cutoverClosure`；`CUTOVER_CLOSURE_PROTOCOL = 1`；`policy.refactor.require_cutover_closure` 在本模組落地前保持 `false`。
- Freedoms: 殘留掃描的實作手段（ripgrep / TS AST），只要對同一輸入確定性。
- Normal path: 讀 contract kill list → 讀 closure inventory 宣告 → 對 candidate head 驗證每個 `removed` selector 確實不存在 → 校驗六類均有 disposition → 產出 `CutoverClosureV1` 與 sha256。
- Failure path 1: 宣告 `removed` 的 selector 仍存在 → `refactor_closure_residue`，列出殘留位置。
- Failure path 2: 有未處置類別，或 refactor profile 下無 closure 宣告 → `refactor_closure_incomplete` / `refactor_closure_missing`。
- States: Empty（無 kill list → 非 refactor profile 回 `not_applicable`）/ Loading（掃描中）/ Ready（`closed` 與 sha256）/ Error（閉集碼，退出碼非零）。
- Dependencies: 既有 task contract 與 allowed-path 機制；`assets/workflow-contract.v1.json` 與 `.ai/harness/workflow-contract.json` 的同步規則。**不依賴 archctx**。
- Open decisions: None

### Module 2 — Discovery 與 Proposal Authoring Loop

- Purpose: 讓倉庫主動發現重構機會，並把「誰來寫方案」變成一條有身份閘門的顯式 lane——本地 subagent 或 GPT Pro 獨立調研。
- Hard Constraints:
  - 循環固定為 `scan（無 proposal）→ observations, scale = null` → `proposal authoring` → `scan（帶 proposal）→ scale` → route → materialize。不得跳過任一步。
  - 無 proposal 的掃描必須回 `scale === null` 且 `proposalDigest === null`（上游 validator `refactor.ts:545-547` 強制），只產出 `structural_observation` recommendation。
  - `authoredBy` 必須是 `REFACTOR_PROPOSAL_AUTHOR_PAIRS`（`refactor.ts:78-83`）的合法配對：`cli→cli`、`mcp→mcp`、`subagent→subagent`、`developer→manual`。`daemon` 與 `system` 永不能撰寫。非法配對原樣透出 `AC_REFACTOR_PROPOSAL_UNAUTHORED`，不得本地改寫身份。
  - `authoredBy` 記的是**提交者與問責方**，不是內容產地（上游定案 2026-09-03）。GPT Pro 起草的提案只有兩條 lane：人審閱署名 → `developer → manual`；repo-harness agent 採納草稿後以自己名義提交 → `subagent → subagent`，並在 `intent` 自由文字寫明來源（例如 `adopted from GPT Pro candidate C01`）。`cli → cli` 保留給操作者提交自己的提案。**GPT Pro 永遠不是任何一種 kind**，不得偽裝、不得新增 source 值。
  - proposal 只提供 `intent`、`scopePaths`、`targetOutcomes`、`killList`、可選 `targetDelta`。作者不決定 `scale`、不決定 route、不決定狀態。
  - `RefactorProposalV1.scopePaths` 必須是**檔案路徑**。目錄與 glob 在上游被視為 unowned，直接回 `scale = 'model_adoption_required'`。Program B 在提交前必須把 scope 展開成檔案清單，不得把展開責任推給上游，也不得在收到 `model_adoption_required` 後本地重試展開再宣稱通過。
  - `targetDelta.unresolvedTargets` 由 ArchContext 回填，且被排除在 proposal digest 之外——本地不得預填或據此判定。
  - GPT Pro lane 走既有 delegate 協議（`assets/skills/repo-harness-chatgpt/references/delegate.md`）：本地持獨立驗收權，GPT Pro 自述已驗證不構成證據，PromptBundle 內容級出境掃描強制。
  - essential evidence 恰為三項（上游 RF2 classifier 定案 2026-09-03）：每個相關 node 的 `footprintDeclared` 為真、每個 `scopePath` 有唯一的最深 owner、`codeFacts.coverage === 'complete'`。`caller-coverage-unknown` 只進 `scaleReasonCodes` 與 `confidence`，**永不單獨**選出 `insufficient_evidence`；`tests.callerCoverage` 在 v1 恆為 `null`，不得列為 essential evidence。
- Recommended Defaults: `proposal_author: "local"`（可選 `gpt_pro` / `ask`）；discovery 掃描在 `shadow` 下由排程或顯式觸發；候選用短 alias（`C01`..）綁 `recommendationId` + digest，不要求外部作者複製 64 位 digest（沿用 campaign §14.2）。
- Freedoms: 作者的調查手法；candidate 排序與呈現；GPT Pro 請求時機的具體啟發式。
- Normal path: discovery scan → observation 候選清單 → 選定候選 → 依 `proposal_author` 派本地 subagent 或發起 GPT Pro 獨立調研 → 收到 proposal → 帶 proposal 重跑 scan → 取得 scale。
- Failure path 1: 非法作者配對 → `AC_REFACTOR_PROPOSAL_UNAUTHORED`，零寫入。
- Failure path 2: GPT Pro lane 出境掃描失敗或返回不可解析內容 → fail closed，不本地補寫提案。
- States: Empty（無 observation）/ Loading（authoring 中）/ Ready（proposal 已取得 scale）/ Error（作者閘門或 lane 失敗）。
- Dependencies: Module 3、Module 4；GPT Pro delegate 通道。
- Open decisions: None

### Module 3 — Refactor provider contract 與兩階段 exact handshake

- Purpose: 用倉庫既有的 provider 呼叫模式接上 `archctx refactor`，並把「哪些能力在哪個版本可用」變成可分階段推進的機器事實。
- Hard Constraints:
  - `src/core/refactor/provider-contract.ts` 只 import `archctx-contracts` 型別與本地 validator，零算法。
  - `src/effects/refactor/archctx-provider.ts` 複用 `src/effects/architecture/archctx-provider.ts` 的 package-local 解析與 Node runtime 檢查，不新寫第二套。
  - handshake 四道全過才算成功：package version **精確相等**、capabilities feature **子集判定**、repository/workspace/head/worktree identity 精確匹配、result `schemaVersion` 與 digest readback。
  - `required_features` 按 stage 分組。Stage 1 缺 `refactor-resolution-v1` 是合法狀態，不得因此擋住 scan。
  - 只透過 CLI 消費；0.5.x 不新增 MCP 工具。
  - `0.5.1` 會凍結 `RefactorVerificationRequestV1`，預期形狀 `archcontext.refactor-verification-request/v1 { recommendationId, expectedHeadSha, expectedWorktreeDigest?, executionEvidenceRefs? }`（`[UNVERIFIED until rf5b]`，最終欄位以 0.5.1 readback 通知為準）；0.5.1 之前不得為其撰寫 validator。核心 API 維持 `refactorVerifyInvariantIssues(afterSnapshot, evidence)`（`refactor.ts:723`），語義輸入是 after `ModuleStatisticsSnapshotV1` + `RefactorResolutionEvidenceV1`。
  - 上游錯誤碼原樣透出，不本地翻譯成別的語義。
- Recommended Defaults: Stage 1 = `0.5.0` + `["module-statistics-v1","refactor-assessment-v1","recommendation-v3"]`；Stage 2 = `0.5.1` + `["refactor-resolution-v1"]`；timeout 沿用 `projection_timeout_ms` 的 1000..120000 邊界。
- Freedoms: request 組裝的內部結構；readback 快取策略。
- Normal path: 解析 package-local archctx → `capabilities` handshake → 組 `RefactorRequestV1`（帶 `expectedHeadSha` / `expectedWorktreeDigest`）→ 呼叫 → 驗證 result → 回傳。
- Failure path 1: 版本或 feature 不匹配 → `refactor_provider_version_mismatch`，零產出。
- Failure path 2: head/worktree 漂移或上游回 `AC_REFACTOR_STALE` → `refactor_assessment_stale`，要求重新 scan。
- States: Empty（provider 未安裝）/ Loading（呼叫中）/ Ready（result 已驗）/ Error（上述碼）。
- Dependencies: 上游 Stage 1 發布與 npm readback 通知。
- Open decisions: None

### Module 4 — Refactor Mode policy 與 program state machine

- Purpose: 定義 Refactor Mode 的權限階梯與一次 program 的生命週期，且讓狀態可從 event chain 完全重建。
- Hard Constraints:
  - `mode ∈ off | shadow | active`，安裝預設 `off`；`off` 時所有 mutation 命令失敗退出。
  - `shadow` 允許 discovery scan / assess / proposal authoring / record / board 與 campaign issue 產出；禁止 materialization、worktree、程式碼修改、PR、merge。
  - event chain append-only；current projection 必須可從 events 完全重建；同 key replay 冪等，衝突 replay 拒絕。
  - 授權複用 `ProgramAuthorizationV1`，不新建型別。
  - candidate branch 不得放寬 policy。
  - `require_post_merge_measurement` 在 verify stage 未就緒時只能是 `false`，不得用本地推斷頂替。
- Recommended Defaults: 狀態機 `created → scanning → observed → authoring → assessed → routing → materializing → planning → executing → verifying → merging → post_merge_measuring → resolving → complete`；異常態 `proof_required`、`architecture_approval_required`、`stale`、`blocked`、`reconciliation_required`；store 落 `<git-common-dir>/repo-harness/refactor-programs/v1/`（沿用 engineer binding store 慣例）。
- Freedoms: CLI 輸出格式；status 命令呈現細節。
- Normal path: `refactor scan` → `refactor start` 建 program 並推進 → `refactor status` 讀 projection → `refactor board` 產投影 → `refactor stop` 收口。
- Failure path 1: `mode = off` 下任何 mutation → 失敗退出，零寫入。
- Failure path 2: event chain 與 projection 不一致 → `reconciliation_required`，拒絕繼續推進。
- States: Empty（無 program）/ Loading（scanning）/ Ready（observed 及之後）/ Error（異常態之一）。
- Dependencies: Module 3；`ProgramAuthorizationV1`（BRC3）。
- Open decisions: None

### Module 5 — `RefactorWorkflowRoute` 投影與保守性不變式

- Purpose: 把上游的**結構判級**（`scale`）確定性投影成 repo-harness 的**工作流路由**，並用可機檢的不變式保證這個投影只會更保守。
- Hard Constraints:
  - `RefactorWorkflowRoute = module_refactor | cross_module_refactor | architecture_intervention | proof_required | no_action`，是 repo-harness 自有型別，**不在** `archctx-contracts` 中。
  - 投影輸入恰為 `(scale, scaleReasonCodes, majorChangeReasons)`，不得引入第四個輸入，不得引入本地啟發式。
  - 不變式一：`scale === 'architecture'` → route ∈ `{architecture_intervention, proof_required, no_action}`。
  - 不變式二：`scale === 'cross_module'` → route ∉ `{module_refactor}`。
  - 不變式三：`scale === 'insufficient_evidence'` → 不得物化任何執行型任務。
  - 違反任一 → `refactor_route_conflict`。
  - 本地 agent 不得手工改寫 route；proof 完成後只能重跑 scan 重算。
  - `scaleReasonCodes` 逐字保存為 `routeReasonCodes`，不得本地改寫或補充。
  - v1 的 `majorChangeReasons` 只推導 `ownership-changed` / `relation-changed` / `node-removed` 三值（上游 RF2 定案 2026-09-03）；`node-added` 與 `lifecycle-changed` **不推導**，未解析目標改由 `targetDelta.unresolvedTargets` 表達。投影不得依賴未推導的 reason，也不得因其缺席而降級 route。
- Recommended Defaults 投影表:

  | upstream `scale` | `RefactorWorkflowRoute` | 備註 |
  |---|---|---|
  | `architecture` | `architecture_intervention` | 上游強制 `majorChangeReasons` 非空（`refactor.ts:548-550`） |
  | `cross_module` | `cross_module_refactor` | 永不降為 `module_refactor` |
  | `module` | `module_refactor` | |
  | `insufficient_evidence` | `proof_required` | 缺口由 `scaleReasonCodes` 表達 |
  | `model_adoption_required` | `proof_required`（model adoption 分支） | 補的是 `.archcontext/model`，不是程式碼調查 |
  | `null` | `no_action` 或 `proof_required` | 無 proposal 的觀察掃描；有值得執行的 observation → 進 Module 2 authoring，否則 `no_action` |

  repo-harness 可沿階梯**向更保守一側**停（例如把 `module` 停成 `proof_required` 等人工），反向一律拒絕。
- Freedoms: 投影結果的展示措辭；`proof_required` 子類的細分粒度。
- Normal path: 讀 assessment → 套投影表 → 校驗三條不變式 → 寫入 program。
- Failure path 1: 不變式違反 → `refactor_route_conflict`，program 停在 `routing`。
- Failure path 2: `scale === null` 且無值得執行的 observation → `no_action`，記錄證據後收口。
- States: Empty（無 assessment）/ Loading（routing）/ Ready（route 已定）/ Error（conflict）。
- Dependencies: Module 3、Module 4。
- Open decisions: None

### Module 6 — Module 與 cross-module materialization

- Purpose: 把 accepted recommendation 物化成既有執行鏈認得的 Work Package / Sprint 行 / Plan，並保持一個 module 一個 rollback 邊界。
- Hard Constraints:
  - recommendation 不直接成為 Lease。跳數固定為 `recommendation → binding → Work Package → Plan → Contract → Lease`，每跳留 receipt。
  - materialization 原子：Work Package、Sprint 行、bindings 全成或全不寫。
  - 一個 module = 一個 Work Package = 一個 rollback 邊界。
  - 同一 architecture node 的 writer 不並行（concurrency key = node id）。
  - Sprint 行必須經 `src/core/state/sprint-backlog-rows.ts` 的六欄文法產出，不自行拼字串。
  - `scale === 'insufficient_evidence'` 時只能建立 investigation Work Package。
- Recommended Defaults: `module_refactor` 走 `capture-plan --artifact-level work-package`；`cross_module_refactor` 產生一份 Refactor Sprint，每個 module/cutover stage 一行，依賴進 Work Graph；`maximum_modules_per_program = 10`、`maximum_parallel_modules = 3`。
- Freedoms: Sprint 行的 acceptance 文案；stage 切分粒度。
- Normal path: route 決定形狀 → 組 `RefactorProgramV1` bindings → 原子寫入 plan/sprint/program → 交給既有 fleet acquire 鏈。
- Failure path 1: 部分寫入失敗 → 全部回滾，狀態停在 `materializing`，重放冪等。
- Failure path 2: 超過 `maximum_modules_per_program` → 拒絕物化，要求縮小 scope 或拆 program。
- States: Empty（無 accepted recommendation）/ Loading（materializing）/ Ready（bindings 已寫）/ Error（回滾後的失敗態）。
- Dependencies: Module 4、Module 5；既有 sprint backlog 與 Work Graph。
- Open decisions: None

### Module 7 — Architecture Intervention route

- Purpose: 讓架構級變更走人工批准，且批准所需證據由上游結構化提供而非自然語言提案。
- Hard Constraints:
  - 消費 `RefactorProposalPayloadV1.targetDelta`（`ArchitectureTargetDeltaV1`）的 `targetState`、`migrationState`、`completionCriteria`、`falsifiers`、`benefitLedger`、`unresolvedTargets`。架構級是 `refactor_proposal` category 且 `scale = 'architecture'`，不是獨立 category。
  - `unresolvedTargets` 非空 → 停在 `architecture_approval_required`，不得建 contract、不得派工。
  - 人工批准只走既有 `repo-harness run architecture-projection accept`；無 acceptance receipt 即無 implementation。
  - generated architecture docs 只透過既有 projection 更新；refactor lane 不直接寫 `docs/architecture/modules/**`。
  - `majorChangeReasons` 含 `interface-changed` 或 `responsibility-changed` 時，是否為 product-visible 由人判定；agent 不得自行判定為「純內部」。
  - v1 的 `majorChangeReasons` 只推導 `ownership-changed` / `relation-changed` / `node-removed`；`node-added` 與 `lifecycle-changed` 不推導，對應缺口由 `targetDelta.unresolvedTargets` 表達。architecture intervention route 不得把「新增 node」或「lifecycle 變更」寫成觸發條件，`unresolvedTargets` 非空才是硬閘門。
- Recommended Defaults: 架構請求走 `repo-harness run architecture-queue` 的既有請求/事件面；kill list 與 migration state 投影進 contract 的 closure inventory（Module 1 消費）。
- Freedoms: 架構請求卡片的措辭與呈現。
- Normal path: route = `architecture_intervention` → 產生架構請求 → 人工 `accept` → 取得 receipt → 才允許物化與派工。
- Failure path 1: `unresolvedTargets` 非空 → `architecture_approval_required` 加缺口清單。
- Failure path 2: 判定為 product-visible → 退出 Refactor Mode，program 收口為 `blocked`，指向 `PRD → Sprint → Plan`。
- States: Empty（無 targetDelta）/ Loading（等待批准）/ Ready（receipt 已取得）/ Error（缺口或退出）。
- Dependencies: Module 5；`src/effects/architecture/projection-acceptance.ts`。
- Open decisions: None

### Module 8 — Execution binding 與 candidate verify

- Purpose: 把一次執行的全部證據不可變地綁回一條 recommendation，並在合入前做一次結構預驗。
- Hard Constraints:
  - `RefactorExecutionBindingV1` append-only，全欄位是不可變引用，**無任何狀態欄位**。
  - 驗證順序固定：`verify-contract` → Cutover Closure → candidate `archctx refactor verify` → AcceptanceReceipt。closure 失敗直接擋，不進 archctx verify。
  - verify 的請求面由 `0.5.1` 凍結的 `RefactorVerificationRequestV1` 決定，預期形狀 `archcontext.refactor-verification-request/v1 { recommendationId, expectedHeadSha, expectedWorktreeDigest?, executionEvidenceRefs? }`（`[UNVERIFIED until rf5b]`）；`executionEvidenceRefs` 正是 Module 1 產出的 `{ kind: 'cutover_closure', locator, sha256 }` 的落點。0.5.1 之前不得為此包絡撰寫 validator。
  - candidate verify 是**預驗**，其 `disposition` 不得寫入 board 的 architecture result 欄；權威 resolution 只能在 exact final main 上算（Module 9）。
  - refactor task profile 在 Module 1 落地後強制 `require_cutover_closure = true`。
  - 不得以 `cross-review --json` 的 `findings` 欄位判定外部審查通過；一律讀 transcript。
- Recommended Defaults: binding 落在 program 檔旁；`REFACTOR_PROGRAM_PROTOCOL = 1`；`bindingSha256` 用倉庫既有 canonical JSON digest。
- Freedoms: binding 的儲存分片策略；預驗結果的呈現。
- Normal path: worker 完成 → 四道驗證依序過 → 寫 binding → PR。
- Failure path 1: closure 失敗 → 停在 `verifying`，不呼叫 provider，findings 回派。
- Failure path 2: Stage 2 provider 不可用 → 預驗跳過並標註 `verify_stage_unavailable`，但**不得**因此放寬 closure 或 acceptance。
- States: Empty（未執行）/ Loading（verifying）/ Ready（binding 已寫）/ Error（任一道失敗）。
- Dependencies: Module 1、Module 6；上游 Stage 2（僅預驗）。
- Open decisions: None

### Module 9 — Post-merge resolution 與 joined Refactor Board

- Purpose: 在 exact final main 上取得權威 resolution，並把「發現—提案—執行—完成」四段 join 成一份純投影看板。
- Hard Constraints:
  - resolution 權威只在 ArchContext。repo-harness 觀察到 merge 只能標 `merged_pending_measurement`。refactor 類的 `resolved` 在 `0.5.0` 不可達（需 `0.5.1` 的 resolution evidence）。
  - board 兩份產出（`<program-id>.md` 人讀、`<program-id>.board.v1.json` 機讀）都是純投影，可從 authorities 完全重建，自身不持有狀態。
  - join key = `recommendationId` + `recommendationDigest`；digest 變更即新 recommendation，`superseded` 從 ArchContext `relations` 讀，不本地推斷。
  - 已 `resolved` 的 recommendation 不得被 campaign 重複 adopt；去重依據是 ArchContext 狀態讀回。
  - `partially_resolved` / `not_improved` / `regressed` 產生 follow-up，不自動關閉；`stale` → `reconciliation_required`。
- Recommended Defaults: 產出落 `tasks/workstreams/refactor/`；`REFACTOR_BOARD_PROTOCOL = 1`（沿用 `FLEET_BOARD_PROTOCOL` 的版本化投影形狀）；每格標註來源（`repo-harness` 或 `archctx`）。
- Freedoms: Markdown 表格欄位順序與措辭；投影快取。
- Normal path: merge 觀察到 → `merged_pending_measurement` → exact new main 跑 scan + verify → 取 `RefactorResolutionEvidenceV1` → 更新 board。
- Failure path 1: after-scan 未跑或 Stage 2 未就緒 → 停在 `merged_pending_measurement`，board 不得顯示 resolved。
- Failure path 2: 上游回 `stale`（base 漂移）→ `reconciliation_required`，要求重新 scan。
- States: Empty（無 program）/ Loading（post_merge_measuring）/ Ready（board 已產）/ Error（reconciliation）。
- Dependencies: Module 8；上游 Stage 2；`scripts/workstream-sync.sh` 的投影慣例。
- Open decisions: None

### Module 10 — Canary 與 activation ladder

- Purpose: 用固定 canary 集合把 mode 晉級變成有證據的動作，而不是配置開關。
- Hard Constraints:
  - 階梯 `off → shadow → active/module-only → active/cross-module`，不得跳級。
  - architecture intervention 在任何階段都保留人工批准。
  - 每級晉級需對應 canary 通過記錄。
- Recommended Defaults 十個 canary（源 `docs/researches/20260902-restructure.md` §十八 RH-RF6）:
  1. model-free module refactor（無 archctx，只驗 closure 與執行鏈）
  2. CodeGraph index 不完整 → `insufficient_evidence` → `proof_required`
  3. cross-module cutover
  4. ownership 變更 → architecture approval
  5. merged 但指標未改善 → `not_improved`
  6. exact final main resolved
  7. 回歸產生新 recommendation
  8. GPT Pro 不重開已 resolved 候選
  9. two-worker 併發（同 node 不並行）
  10. 版本 mismatch fail-closed
- Freedoms: canary fixture 的注入點與資料構造。
- Normal path: 逐級跑 canary → 記錄通過 → 晉級。
- Failure path 1: 跳級嘗試 → policy 校驗拒絕，指名缺失的前一級。
- Failure path 2: canary 失敗 → 不得晉級，且不得以「已在別的倉庫驗過」為由跳過。
- States: Empty（未跑）/ Loading（執行中）/ Ready（該級通過）/ Error（失敗）。
- Dependencies: Module 1-9。Canary 1 只依賴 Module 1，可在上游發布前先跑。
- Open decisions: None

## Data Model

```ts
// repo-harness 自有型別。archctx-contracts 中不存在。
export type RefactorWorkflowRoute =
  | 'module_refactor'
  | 'cross_module_refactor'
  | 'architecture_intervention'
  | 'proof_required'
  | 'no_action';

export const CUTOVER_CLOSURE_PROTOCOL = 1 as const;
export const CUTOVER_CLOSURE_KIND = 'repo-harness-cutover-closure' as const;

export type CutoverClosureCategory =
  | 'old_implementation' | 'callers' | 'fallback'
  | 'tests' | 'docs_and_projections' | 'compatibility_expiry';

export type CutoverClosureDisposition =
  | 'removed' | 'migrated' | 'retained_with_reason' | 'not_applicable';

export interface CutoverClosureEntryV1 {
  readonly category: CutoverClosureCategory;
  readonly disposition: CutoverClosureDisposition;
  // kind 對齊上游 REFACTOR_KILL_LIST_KINDS（refactor.ts:64）
  readonly selectors: readonly { readonly kind: 'path' | 'relation' | 'symbol'; readonly value: string }[];
  readonly reason: string | null;   // retained_with_reason 必填
  readonly expiry: string | null;   // retained_with_reason 必填
}

export interface CutoverClosureV1 {
  readonly protocol: typeof CUTOVER_CLOSURE_PROTOCOL;
  readonly kind: typeof CUTOVER_CLOSURE_KIND;
  readonly contractPath: string;
  readonly contractSha256: string;
  readonly headSha: string;
  readonly entries: readonly CutoverClosureEntryV1[];
  readonly residues: readonly { readonly selector: string; readonly foundAt: readonly string[] }[];
  readonly status: 'closed' | 'residue' | 'incomplete' | 'not_applicable';
  readonly closureSha256: string;
}

export const REFACTOR_PROGRAM_PROTOCOL = 1 as const;

export interface RefactorProgramV1 {
  readonly protocol: typeof REFACTOR_PROGRAM_PROTOCOL;
  readonly programId: string;
  readonly baseMainSha: string;
  readonly archctxVersion: string;               // 實際解析到的 package version
  readonly providerStage: 'scan' | 'verify';
  readonly statisticsSnapshotDigest: string;
  readonly assessmentDigest: string;
  readonly proposalDigest: string | null;        // null 表示純觀察掃描
  readonly proposalAuthor: { readonly kind: string; readonly source: string } | null;
  readonly scale: string | null;                 // 上游 RefactorScale，原樣保存；無 proposal 時為 null
  readonly routeReasonCodes: readonly string[];  // 上游 scaleReasonCodes，逐字保存
  readonly majorChangeReasons: readonly string[];
  readonly route: RefactorWorkflowRoute;         // 本地投影
  readonly affectedNodeIds: readonly string[];
  readonly bindings: readonly {
    readonly recommendationId: string;
    readonly recommendationDigest: string;
    readonly candidateAlias: string;             // C01.. 供外部作者引用，不外傳 digest
    readonly workPackageId: string;
    readonly taskRef: string;
    readonly executionBoundary: 'module' | 'cross_module_stage' | 'architecture_intervention';
  }[];
  readonly programDigest: string;
  // 明確不存在：recommendationStatus / resolved / done。狀態一律從 ArchContext 讀回。
}

// append-only。全部是不可變引用，沒有任何狀態欄位。
export interface RefactorExecutionBindingV1 {
  readonly recommendationId: string;
  readonly recommendationDigest: string;
  readonly taskId: string;
  readonly taskRevision: string;
  readonly planPath: string;
  readonly planSha256: string;
  readonly contractPath: string;
  readonly contractSha256: string;
  readonly cutoverClosureSha256: string;   // 餵給上游 REFACTOR_EXECUTION_EVIDENCE_KINDS 的 'cutover_closure'
  readonly acceptanceReceiptSha256: string;
  readonly pullRequestNumber: number;
  readonly pullRequestHeadSha: string;
  readonly mergeCommitSha: string;
  readonly bindingSha256: string;
}
```

Policy 片段（`.ai/harness/policy.json`）:

```jsonc
{
  "refactor": {
    "mode": "off",                         // off | shadow | active
    "provider": "archctx",
    "proposal_author": "local",            // local | gpt_pro | ask
    "stages": {
      "scan":   { "provider_version": "0.5.0", "required_features": ["module-statistics-v1", "refactor-assessment-v1", "recommendation-v3"] },
      "verify": { "provider_version": "0.5.1", "required_features": ["refactor-resolution-v1"] }
    },
    // 鍵是 RefactorWorkflowRoute 值，不是 ArchContext scale
    "workflow_routing": {
      "module_refactor": "work_package",
      "cross_module_refactor": "refactor_sprint",
      "architecture_intervention": "human_architecture_approval",
      "proof_required": "investigation_only",
      "no_action": "record_and_stop"
    },
    "maximum_modules_per_program": 10,
    "maximum_parallel_modules": 3,
    "require_cutover_closure": false,      // Module 1 落地後才可置 true
    "require_post_merge_measurement": false // verify stage 就緒後才可置 true
  }
}
```

## Delivery Order and Blocking

```text
Module 1（Cutover Closure Gate）+ policy reader 骨架（fail-closed 在 off）
  零 archctx 依賴 · 可立即落地 · 亦是 GPT Pro campaign Phase B 前置
  → First Proof Point 在此驗
       ↓
   archctx 0.5.0 發布（上游 RF1b → RF2 → RF3 → RF5a + npm readback）
       ↓
Module 3 → Module 4 → Module 2 → Module 5
       ↓
Module 6 ─┬─→ Module 7
          └─→ Module 8（closure 部分已就緒；candidate verify 待 Stage 2）
       ↓
   archctx 0.5.1 發布（上游 RF4 → RF5b + npm readback）
       ↓
Module 8 完整 → Module 9 → Module 10
```

阻塞事實：

- 上游 `main` 目前只完成 rf0 + rf1a（contract 凍結），無 core 計算、無 `archctx refactor` CLI、未發布。npm latest `archctx@0.4.8` 發布於 2026-09-02T08:32:49Z，早於 rf1a。
- Module 2-9 全部被上游阻塞；Module 1、policy reader 骨架與 canary 1 不被阻塞。
- 上游在 0.5.0 與 0.5.1 各自 npm readback 完成時以 session chat 通知，附 `capabilities --json` 的 features 清單與 readback 記錄路徑；收到後才開 Module 3 / Module 8。
- 本 PRD 不生成 Sprint，直到 Stage 1 在 npm 發布**且** campaign sprint 第 3 行 BRC3（`ProgramAuthorizationV1`）已清。
- 兩個倉庫不得在未發布協議上同時猜欄位開發；只允許 compile-only 型別準備。

## Performance Targets

| Target | Number | Measurement Method | Degradation Threshold |
|---|---:|---|---:|
| Cutover Closure gate 單次執行 | 15 秒 | 在本倉庫規模上計時 | 45 秒 |
| `refactor scan` 端到端（含 provider） | 120 秒 | 沿用 `projection_timeout_ms` 上限 | 硬上限 120 秒即失敗 |
| Board 從權威完全重建 | 10 秒 | 刪除目錄後重建計時 | 30 秒 |
| Program event chain 重放 | 2 秒 | 1000 event 的 projection 重建 | 8 秒 |

## Known Unknowns

| Item | Impact | Resolution Path | Owner |
|---|---|---|---|
| [UNKNOWN] `archctx refactor scan\|record\|verify` 的 CLI args、stdout 契約與退出碼 | Module 3 的 adapter 無法定稿 | 上游 RF5a/RF5b 完成後對照實作；在此之前只寫型別層 | 上游 Program A |
| [UNKNOWN] `archctx@0.5.0` / `0.5.1` 的 capabilities feature 實際命名 | 本 PRD 的 feature 名若與上游不同則 handshake 失效 | 等上游 readback 通知附帶的 `capabilities --json` | 上游 Program A |
| [RESOLVED 2026-09-03] GPT Pro 作為 proposal author 的合法 `authoredBy` 配對 | GPT Pro lane 的責任歸屬與可審計性已確定 | 上游定案：0.5.0 不新增 source 值；`authoredBy` 記的是**提交者與問責方**而非內容產地。人審閱署名 → `developer → manual`；harness agent 採納草稿後以己名提交 → `subagent → subagent`，來源寫進 `intent`。`cli → cli` 保留給操作者自提。GPT Pro 永不是任何 kind | 上游 Program A |
| [UNKNOWN] first-class provenance 欄位（例如 `provenance?: { provider, ref }`）的形狀與時程 | 0.5.x 期間 GPT Pro 來源只能是 `intent` 自由文字，無法機器查詢或聚合 | 上游列為 0.6.0 contract 變更的 Known Unknown；等上游提出欄位形狀後再評估是否消費 | 上游 Program A |
| [UNKNOWN] Cutover Closure inventory 能否在不做語義分析下確定性判定真實歷史 PR | 若不能，本 PRD 的獨占價值主張不成立（見 Falsifier） | First Proof Point：在真實歷史重構 PR 上跑 gate | Refactor Owner |
| [UNVERIFIED] `ProgramAuthorizationV1` 最終欄位 | Module 4 的授權實作可能缺鍵 | 等 BRC3 合入 main 後對照 | 並行 campaign session |
| [UNVERIFIED until rf5b] `RefactorVerificationRequestV1`（`archctx refactor verify --request-json` 的請求包絡） | Module 8/9 的 verify 呼叫面待定 | 上游定案：**會**在 `0.5.1`（RF4/RF5b）凍結，預期形狀 `archcontext.refactor-verification-request/v1 { recommendationId, expectedHeadSha, expectedWorktreeDigest?, executionEvidenceRefs? }`，核心 API 維持 `refactorVerifyInvariantIssues(afterSnapshot, evidence)`。最終欄位以 0.5.1 readback 通知為準；0.5.1 之前不得撰寫 validator | 上游 Program A |
| [UNVERIFIED] 上游 `AC_REFACTOR_*` 錯誤碼的實際觸發條件與呈現 | 錯誤映射可能不完整 | 上游實作落地後補 fixture | 上游 Program A |
| [ASSUMED] Stage 1 = `0.5.0`（scan/record）、Stage 2 = `0.5.1`（verify）。理由：讓 scan/materialization 不被 verify 能力阻塞 | 若上游一次發全部能力，兩階段是多餘複雜度 | PRD review 時確認或否決 | Refactor Owner |
| [ASSUMED] Closure inventory 六類 + 四種 disposition。理由：覆蓋「舊實現/引用/回退/測試/文檔/相容期限」六個實際殘留面 | 過細增加 contract 負擔，過粗會漏判 | First Proof Point 後按實測調整 | Refactor Owner |
| [ASSUMED] `retained_with_reason` 強制帶 `expiry`。理由：無期限的相容分支就是永久債 | 若某些保留確實無法定期限，會擋住合法情況 | PRD review 時確認或否決 | Refactor Owner |
| [ASSUMED] 驗證順序 closure 先於 `archctx refactor verify`。理由：closure 零成本且是硬前置，先擋可省 provider 呼叫 | 若 provider 預驗能更早發現嚴重問題，順序應反轉 | canary 3 實測後確認 | Refactor Owner |
| [ASSUMED] GPT Pro lane 預設走 (b) `subagent → subagent`，由採納草稿的 harness agent 具名提交，`intent` 帶 provenance `adopted from GPT Pro candidate <Cnn>`；policy knob 允許在人願意署名時切到 (a) `developer → manual`。理由：預設把問責留在能被本地驗收的 agent 身上，人工署名是升級而非常態 | 若預設為 (a)，每條 GPT Pro 提案都需要人在場，lane 退化成人工流程 | PRD review 時確認或否決 | Refactor Owner |
| [ASSUMED] `proposal_author` 預設 `local`，GPT Pro 只在需要時請。理由：外部調研成本與出境面都高於本地 subagent | 若本地作者質量不足，預設應改 `ask` | shadow canary 統計本地 proposal 的採納率後調整 | Refactor Owner |
| [ASSUMED] `scale = null` 時「有值得執行的 observation」的判定歸 Module 2 的候選排序，而非新增判定器 | 若這條線變成隱式判級器，就違反了非目標 | PRD review 時確認；實作時以「是否派出 authoring」為唯一分叉 | Refactor Owner |
| [ASSUMED] concurrency key = architecture node id。理由：與既有 capability 邊界一致且保守 | 粗粒度可能成為吞吐瓶頸 | 實測出現瓶頸後才細化到 allowed-path overlap | Refactor Owner |
| [ASSUMED] `maximum_modules_per_program = 10`、`maximum_parallel_modules = 3` | 上限過小會拆碎 program，過大會放大爆炸半徑 | canary 3 與 canary 9 後調整 | Refactor Owner |
| [ASSUMED] program 落 `plans/refactors/<stamp>-<slug>.refactor-program.v1.json`，board 落 `tasks/workstreams/refactor/<program-id>.{md,board.v1.json}` | 路徑影響 `.rgignore`、歸檔與 check-task-sync | PRD review 時確認或否決 | Refactor Owner |
| [ASSUMED] 三個新 protocol 常數均從 `1` 起（`CUTOVER_CLOSURE_PROTOCOL`、`REFACTOR_PROGRAM_PROTOCOL`、`REFACTOR_BOARD_PROTOCOL`） | 與既有 `FLEET_BOARD_PROTOCOL = 3` / `MERGE_READINESS_PROTOCOL = 1` 慣例一致 | 實作時確認 | 實作者 |
| [ASSUMED] `mode = off` 時 mutation 命令失敗退出而非靜默 no-op。理由：沿用 BRC3 對 `development_campaign.mode` 的既定形狀 | 與其他 mode gate 不一致會造成心智負擔 | PRD review 時確認 | Refactor Owner |
| [ASSUMED] Module 1 先於 provider 模組落地的交付順序 | 若 Cutover Closure 實際上必須依賴 archctx kill-list 驗證，順序不成立 | First Proof Point 直接驗 | Refactor Owner |
| [ASSUMED] store 落 `<git-common-dir>/repo-harness/refactor-programs/v1/`。理由：沿用 `src/effects/engineers/binding-store.ts` 的 git-common-dir 慣例，避免進 candidate branch | 若 program 需要進版控供人審，位置需改 | PRD review 時確認或否決 | Refactor Owner |
| [ASSUMED] candidate alias 沿用 campaign 的 `C01`.. 形狀 | 兩條 lane 若各用一套 alias 會造成 join 困難 | 與 campaign session 對齊後確認 | Refactor Owner |

## Developer Handoff

You are implementing this PRD.

- Build first: **Module 1（Cutover Closure Gate）與 `policy.refactor` reader 骨架（fail-closed 在 `off`）**，且只做這兩項。它們零 archctx 依賴、對普通重構 PR 立刻有價值、是 GPT Pro campaign Phase B 的前置，也是本 PRD 的 First Proof Point。上游 0.5.0 發布之前，其餘模組只允許 compile-only 型別準備與負向測試。
- Do not reinterpret:
  - 不要在 repo-harness 實作任何模組統計、依賴圖、cycle 偵測或 refactor 評分；不要直接讀 CodeGraph。
  - 不要把 `proof_required` / `no_action` 當成上游 `RefactorScale` 值。上游只有 `architecture | cross_module | insufficient_evidence | model_adoption_required | module`（`refactor.ts:28-34`）。
  - 不要讓無 proposal 的掃描產出 `scale`；validator `refactor.ts:545-547` 強制 `scale === null` 恰在 `proposalDigest === null` 時成立。
  - 不要讓 proposal author（含 GPT Pro）決定 scale、route 或狀態；不要從 Issue 標題推斷 scale。
  - 不要本地改寫 `authoredBy` 使非法配對變合法；`daemon` / `system` 永不能撰寫。
  - 不要把 `tests.callerCoverage` 當 essential evidence——v1 恆為 `null`。essential 恰為三項：每個相關 node `footprintDeclared`、每個 `scopePath` 有唯一最深 owner、`codeFacts.coverage === 'complete'`；`caller-coverage-unknown` 只影響 `scaleReasonCodes` 與 `confidence`。
  - 不要送目錄或 glob 當 `scopePaths`；提交前展開成檔案路徑，否則上游回 `model_adoption_required`。
  - 不要依賴 `node-added` / `lifecycle-changed` 這兩個 `majorChangeReasons`——v1 不推導它們，未解析的目標走 `targetDelta.unresolvedTargets`。
  - 不要把 `required_features` 寫成扁平列表；按 stage 分組。
  - 不要以 git link 或本地路徑在 runtime 依賴未發布 contract；不要為 `archctx refactor verify` 的請求包絡在 0.5.1 前寫 validator。
  - 不要新增 MCP 工具；0.5.x 只走 CLI。
  - 不要新增 `repo-harness execute` 命令；執行走既有 fleet acquire 鏈。
  - 不要新建授權型別；複用 `ProgramAuthorizationV1`。
  - 不要在 `RefactorProgramV1` 或 `RefactorExecutionBindingV1` 加任何狀態欄位。
  - 不要讓 closure gate 猜測未宣告的內容。
  - 不要另造 Sprint 行格式；六欄文法唯一權威在 `src/core/state/sprint-backlog-rows.ts`。
  - 不要用 `cross-review --json` 的 `findings` 欄位判定審查通過；讀 transcript。
- You may improve: closure 殘留掃描的實作手段、event chain 的分片與索引、board 的 Markdown 呈現、candidate 排序啟發式、canary fixture 的注入點、CLI 輸出措辭。
- Verify with:
  ```bash
  bun test --timeout 60000
  bash scripts/check-deploy-sql-order.sh
  bash scripts/check-architecture-sync.sh
  bash scripts/check-task-sync.sh
  repo-harness run check-task-workflow --strict
  bun scripts/inspect-project-state.ts --repo . --format text
  bun src/cli/index.ts init --repo . --dry-run
  ```

### Acceptance Scripts

1. **Canary 1（model-free，可立即執行）**：在一個真實歷史重構 PR 上跑 Cutover Closure Gate，覆蓋殘留 selector、未處置類別、無 kill list 三種情形。全部收斂到閉集錯誤碼，無一降級為 warning。零 archctx 依賴。
2. **Route 投影 property test**：遍歷 `REFACTOR_SCALES × majorChangeReasons 冪集 × 關鍵 scaleReasonCodes`，斷言三條保守性不變式恆成立；不存在任何輸入使 `architecture` 映射到 `module_refactor` / `cross_module_refactor`，或使 `cross_module` 映射到 `module_refactor`。
3. **無 proposal 掃描 fixture**：斷言 `scale === null && proposalDigest === null`，只產出 `structural_observation`，且不物化任何執行型任務。
4. **作者身份閘門 fixture**：遍歷 `(kind, source)` 全笛卡爾積，斷言只有 `REFACTOR_PROPOSAL_AUTHOR_PAIRS` 的四組通過，其餘回 `AC_REFACTOR_PROPOSAL_UNAUTHORED`。
5. **Version mismatch fail-closed**：提供 `archctx@0.4.8` fixture，斷言 `refactor_provider_version_mismatch` 且 `plans/refactors/` 與 `tasks/workstreams/refactor/` 零寫入。
6. **Shadow canary**：`mode = shadow`，在 disposable repository 跑完整 discovery → authoring → assess → record → board，斷言零 task/code/PR mutation。
7. **Board 重建**：刪除 `tasks/workstreams/refactor/` 後從 ArchContext + program + task state 重建，`git diff --exit-code` 為空。
8. **併發 canary**：兩個 worker 同時領同一 architecture node 的 module Work Package，斷言只有一個拿到 Lease。

## Adjacent Patterns

- **Provider adapter：port，不 build。** `src/effects/architecture/archctx-provider.ts` 已經是本倉庫驗證過的 exact-provider 消費模式——package-local 解析（不信 PATH）、Node runtime 檢查、`assertArchctxCapabilities`（`src/core/architecture/projection.ts:198`）的 feature superset handshake、exact repository/workspace/head/worktree identity 綁定、result readback。Refactor provider port 這個**呼叫模式**到 `src/effects/refactor/archctx-provider.ts`，共用解析與 runtime 檢查，但不複製 projection 的請求語義。理由：這條路徑已被 `projection_failure_gate: "strict"` 在生產上驗過，重寫只會多一份漂移面。上游 dispatch §2 也明確要求沿用這個 handshake 模式。
- **Policy 讀取：adopt per-section reader。** `readArchitectureProjectionPolicy`（`src/core/architecture/projection.ts:178-196`）示範了單一 section 的封閉校驗——未知值直接 throw、依賴關係在 reader 內強制。`readRefactorPolicy` adopt 同一形狀，把 mode/stage/feature 的依賴關係（例如 `require_post_merge_measurement` 不得在 verify stage 未就緒時為 `true`）壓在 reader 裡，而不是散在呼叫點。
- **人工架構批准：adopt，不 build 第二條。** `src/effects/architecture/projection-acceptance.ts` 的 `acceptArchitectureProjectionCandidate` / `reconcileArchitectureProjectionCandidate` 加上 `src/cli/commands/architecture-projection.ts` 的 `accept` / `reconcile` 已經是倉庫唯一的架構批准權威。`ARCHITECTURE_MAJOR_CHANGE_REASONS`（`src/core/architecture/projection.ts:23-28`）的 13 值閉集與上游 `ArchitectureMajorChangeReasonCode` 同源，可直接作為 route 判定輸入。Module 7 完全複用。
- **外部作者：adopt 既有 GPT Pro delegate 協議，不 build 第二條外包通道。** `assets/skills/repo-harness-chatgpt/references/delegate.md` 已經確立了本 PRD 需要的全部性質——GPT Pro 是外部資深工程師、本地持獨立驗收權、GPT Pro 自述已驗證不構成證據、PromptBundle 內容級出境掃描與允許讀路徑白名單。Module 2 的 GPT Pro lane 只是把「產出物」從 patch text 換成 `RefactorProposalV1`，協議本體不動。
- **Candidate alias：adopt campaign 慣例。** `plans/prds/20260902-2238-gpt-pro-seeded-repair-campaign.prd.md` 與研究文檔 §14.2 已確立短 alias（`C01`..）綁 exact id + digest 的形狀，外部作者只寫 alias。兩條 lane 共用同一套 alias，避免 join 時對不上。
- **版本化 JSON 投影：adopt 形狀。** `src/core/fleet/board.ts` 的 `FLEET_BOARD_PROTOCOL = 3` 與 `src/core/publication/merge-readiness.ts` 的 `MERGE_READINESS_PROTOCOL = 1` 已確立「protocol 常數 + kind 常數 + 純投影函式」形狀。Refactor board 與 closure 產出 adopt 同一形狀。
- **Sprint 行文法：wrap，不 build。** `src/core/state/sprint-backlog-rows.ts` 是六欄文法唯一權威，與 `scripts/sprint-backlog.sh` 的 awk 掃描綁定（`tests/sprint-backlog-grammar-drift.test.ts` 守著）。cross-module materialization 的 Sprint 行必須經該模組產出。
- **Workstream 投影：adopt。** `scripts/workstream-sync.sh` 已確立「durable capability 進度投影進本地 contract」的形狀。Refactor board 沿用同一心智：檔案是投影，權威在別處。
- **Cutover Closure：build，且必須自建。** 本 PRD 唯一沒有可 adopt 前例的模組——`scripts/cutover-closure.ts` 不存在，`assets/workflow-contract.v1.json` 無 `cutoverClosure` 鍵（已核）。但它並非憑空發明：上游凍結的 `REFACTOR_EXECUTION_EVIDENCE_KINDS` 已含 `cutover_closure`，`RefactorExecutionEvidenceRefV1` 為 `{ kind, locator, sha256 }`，等於上游已預留消費介面；上游 dispatch §2 第 2 項也把它列為「現在可做」。build 的理由是它需要 contract kill-list、diff 與 AcceptanceReceipt——這三樣只有 repo-harness 拿得到。
- **設計來源與權威順序**：`/Users/ancienttwo/Projects/arch-context/packages/contracts/src/{refactor,ledger,schema}.ts`（最高權威）> `/Users/ancienttwo/Projects/arch-context/docs/researches/20260903-program-b-dispatch.md`（派工單）> `docs/researches/20260902-restructure.md` §二十二 對齊記錄 > 該研究文檔正文。本 PRD 的每處欄位名均以 contract 檔為準。
- **共享邊界**：`plans/prds/20260902-2238-gpt-pro-seeded-repair-campaign.prd.md` 的 `## Deferred / Phase B` 明確把 Cutover Closure Gate 與 `refactor` issue kind 移出 Phase A。本 PRD 的 Module 1 就是那個被移出的能力；兩份 PRD 共用同一份 gate。
- [UNVERIFIED] 「上游測量權威 + 下游收口權威」這一分工與常見的「靜態分析工具報告 + 團隊定義 Definition of Done」流程同構；本 PRD 未引用任何具體外部產品作為依據。

## Backend Perspective

- **權威分層。** ArchContext 擁有結構事實、判級與 recommendation 生命週期；repo-harness 擁有提案作者身份、Task 身份（canonical Sprint）、priority/dependency/concurrency（Work Graph）、任務歸屬（Lease + ClaimActorReceipt + WorkEnvelope）、驗證結果（checks + AcceptanceReceipt）、收口事實（`CutoverClosureV1`）。`RefactorProgramV1` 只擁有「哪條 recommendation 對應哪個 Work Package」這一映射，**不擁有以上任何一項**。
- **判級與提案的職責倒置是這條鏈最容易做錯的地方。** 直覺會以為「分析工具給建議、執行方採納」，但上游 contract 的實際形狀相反：ArchContext 只給觀察與判級，**提案由 repo-harness 側的 agent 撰寫並送進去評估**。這意味著 proposal 的質量是 repo-harness 的責任，而 scale 的正確性是 ArchContext 的責任。任何把兩者混在一起的實作（例如本地先猜 scale 再去驗證）都會退化成第二個判定器。
- **「PR merged ≠ resolved」是資料模型層強制，不是文檔提醒。** `RefactorExecutionBindingV1` 結構上沒有狀態欄位，`RefactorProgramV1` 也沒有。repo-harness 在拿不到 ArchContext resolution 時，唯一能表達的就是 `merged_pending_measurement`——它結構上無法說謊。在只有 0.5.0 的階段這是常態，因為 refactor 類的 `resolved` 在 0.5.0 根本不可達。
- **10x 時最先失敗的三處。** 其一，program event chain 的線性掃描：program 數上升後 projection 重建會變慢，解法是 content-addressed 索引與 per-program 投影，GC 只清 terminal runtime cache、絕不刪 binding。其二，closure gate 的殘留掃描：selector 數 × 檔案數是乘積關係，解法是把掃描限縮在 contract allowed paths 與 diff 觸及檔案，而不是全倉庫掃。其三，`maximum_parallel_modules` 與 node 粒度 concurrency key 的組合會在大型 cross-module program 上成為吞吐瓶頸——正確解法是拆小 program，不是放寬 concurrency key。
- **provider 呼叫是外部 I/O，必須有預算。** scan 走既有 `projection_timeout_ms` 的 1000..120000 邊界；一次 program 的 provider 呼叫次數應有上限並記入 event chain，避免重試風暴打到上游。GPT Pro lane 的呼叫成本更高，`proposal_author = gpt_pro` 必須有每 program 的次數上限。
- **兩階段 provider 的代價是狀態空間變大。** Stage 2 不可用時 Module 8 的預驗跳過、Module 9 的測量停在 `merged_pending_measurement`——這兩條路徑必須有獨立測試，否則會退化成「Stage 2 永遠不可用也沒人發現」。
