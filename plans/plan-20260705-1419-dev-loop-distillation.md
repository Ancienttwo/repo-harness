# Plan: Dev loop distillation Phase 3: brief/prompt/preflight + engine integrity

> **Status**: Executing
> **Created**: 20260705-1419
> **Slug**: dev-loop-distillation
> **Planning Source**: codex-plan-or-waza-think
> **Orchestration Kind**: host-plan
> **Source Ref**: (none)
> **Artifact Level**: work-package
> **Promotion Reason**: merge_boundary
> **Verification Boundary**: Commands named in the captured planning output plus `repo-harness run verify-contract --contract tasks/contracts/20260705-1419-dev-loop-distillation.contract.md --strict`.
> **Rollback Surface**: Before execution remove `plans/plan-20260705-1419-dev-loop-distillation.md`; after execution revert branch `codex/dev-loop-distillation` or the explicitly reviewed diff.
> **Spec**: `docs/spec.md`
> **Research**: See `docs/researches/`
> **Task Contract**: `tasks/contracts/20260705-1419-dev-loop-distillation.contract.md`
> **Task Review**: `tasks/reviews/20260705-1419-dev-loop-distillation.review.md`
> **Implementation Notes**: `tasks/notes/20260705-1419-dev-loop-distillation.notes.md`

## Agentic Routing
- Selected route: planning
- Routing reason: Captured from codex-plan-or-waza-think planning output.
- Source ref: (none)
- Due diligence:
  - P1 map: See captured planning output below.
  - P2 trace: See captured planning output below.
  - P3 decision rationale: See captured planning output below.

## Workflow Inventory
Complete this inventory before implementation. If any line is unknown, keep the plan in Draft and fill it before projection.

- Active plan: `plans/plan-20260705-1419-dev-loop-distillation.md`
- Sprint contract: `tasks/contracts/20260705-1419-dev-loop-distillation.contract.md`
- Sprint review: `tasks/reviews/20260705-1419-dev-loop-distillation.review.md`
- Implementation notes: `tasks/notes/20260705-1419-dev-loop-distillation.notes.md`
- Deferred-goal ledger: `tasks/todos.md`
- Current checks: `.ai/harness/checks/latest.json`
- Run snapshots: `.ai/harness/runs/`
- Scope authority: `tasks/contracts/20260705-1419-dev-loop-distillation.contract.md` `allowed_paths`
- Concurrency rule: `.ai/harness/active-plan` selects the active plan for this worktree when present; `.ai/harness/active-worktree` records the owning worktree; `.claude/.active-plan` is a legacy fallback during transition. If another worktree already owns active work, open or switch to the matching worktree instead of serializing unrelated plans.
- Execution isolation: approved contract-level work projects through `repo-harness run plan-to-todo --plan plans/plan-20260705-1419-dev-loop-distillation.md` and may start `repo-harness run contract-worktree start --plan plans/plan-20260705-1419-dev-loop-distillation.md`.

## Approach
### Strategy
Use the captured planning output below as the execution source of truth.

### Trade-offs
| Option | Pros | Cons | Decision |
|--------|------|------|----------|
| Captured plan | Preserves the approved Codex Plan or Waza think decision | Requires the captured text to be concrete enough to execute | Use |

## Detailed Design
### File Changes
| File | Action | Description |
|------|--------|-------------|
| See captured planning output | Follow | Implement only the approved scope named below |

### Code Snippets
See captured planning output.

### Data Flow
See captured planning output.

## Risk Assessment
| Risk | Likelihood | Impact | Mitigation |
|------|------------|--------|------------|
| Captured plan lacks enough detail | Medium | Execution may need clarification | Stop before implementation if the captured output contradicts repo rules or lacks concrete file targets |

## Task Contracts
- Contract file: `tasks/contracts/20260705-1419-dev-loop-distillation.contract.md`
- Review file: `tasks/reviews/20260705-1419-dev-loop-distillation.review.md`
- Implementation notes file: `tasks/notes/20260705-1419-dev-loop-distillation.notes.md`
- Template: `.claude/templates/contract.template.md`
- Verification command: `repo-harness run verify-contract --contract tasks/contracts/20260705-1419-dev-loop-distillation.contract.md --strict`
- Active plan rule: this captured plan is written to `.ai/harness/active-plan`, the owning worktree is written to `.ai/harness/active-worktree`, and the plan is mirrored to `.claude/.active-plan` unless --no-active is used. Do not infer active execution from the latest non-archived plan.

## Handoff

- Checks file: `.ai/harness/checks/latest.json`
- Session handoff: `.ai/harness/handoff/current.md`

## Promotion Gate

- **Merge/PR unit**: Captured plan `plans/plan-20260705-1419-dev-loop-distillation.md` is the proposed mergeable execution unit; revise before execute if this is only a checklist step.
- **Rollback surface**: Before execution remove `plans/plan-20260705-1419-dev-loop-distillation.md`; after execution revert branch `codex/dev-loop-distillation` or the explicitly reviewed diff.
- **Verification boundary**: Commands named in the captured planning output plus `repo-harness run verify-contract --contract tasks/contracts/20260705-1419-dev-loop-distillation.contract.md --strict`.
- **Review/acceptance boundary**: `tasks/reviews/20260705-1419-dev-loop-distillation.review.md` must record pass against the captured acceptance criteria.
- **High-risk surface**: Risks named in captured planning output; keep the plan Draft if risk ownership is not concrete.
- **Why not checklist row**: merge_boundary

## Evidence Contract

- **State/progress path**: `plans/plan-20260705-1419-dev-loop-distillation.md` task breakdown, `tasks/todos.md` deferred-goal ledger, `tasks/contracts/20260705-1419-dev-loop-distillation.contract.md`, `tasks/reviews/20260705-1419-dev-loop-distillation.review.md`, and `tasks/notes/20260705-1419-dev-loop-distillation.notes.md`
- **Verification evidence**: `.ai/harness/checks/latest.json`, `.ai/harness/runs/`, and the commands named in the captured planning output
- **Evaluator rubric**: `tasks/reviews/20260705-1419-dev-loop-distillation.review.md` must record a passing Waza /check style recommendation
- **Stop condition**: all task breakdown items are complete, sprint verification passes, and the review recommends pass
- **Rollback surface**: Before execution remove `plans/plan-20260705-1419-dev-loop-distillation.md`; after execution revert branch `codex/dev-loop-distillation` or the explicitly reviewed diff.

## Captured Planning Output

# repo-harness dev loop 蒸餾重組計劃（Phase 3：交付 fast-worker 執行）

> 本檔即「把強模型思考方式蒸餾成弱模型可執行指令」的落地實例：由主循環（Fable）完成審計與設計判斷，產出這份自帶 why、檔案指標、字面改動、驗證命令與停止條件的計劃，交 fast-worker（Sonnet 5）逐片執行。
> 執行者注意：每個切片都有 **STOP 條件**。命中 STOP 就停下回報，不要即興發揮。

## Context（為什麼做這件事）

觸發：使用者引用文章《把最強模型的思考方式蒸餾成 Skill》，其 8 條原則是——(1) Why 先行、(2) 檔案化上下文、(3) 黃金範例、(4) 難度/能力路由、(5) 自主推進＋強制自驗、(6) 分身並行＋乾淨分身終驗、(7) 持久記憶、(8) 明確停止條件。

repo-harness 已擁有最難的地基：**file-coupled delegation**（brief 就是 `tasks/contracts/<stem>.contract.md` 檔案本身）與**跨廠商獨立終驗硬閘**（external acceptance + diff fingerprint 新鮮度）。但審計證實：被委派的弱模型 worker 今天拿到的只有「任務文字＋允許路徑」——看不到任務為何重要（1）、沒有範例可校準（3）、沒被要求回報前自跑驗證（5）、不知道何時該停下上報（8）、也沒有把所學寫回檔案的義務（7）。這些缺口不在架構，而在三個具體位置從未被教過：`writePrompt()`、contract 模板、`runBriefPreflight()`。本計劃就教這三處，外加修復審計發現的引擎完整性缺口。

## 審計結論（P1 / P2 / P3）

### P1 · 架構圖

- CLI 鏈：`repo-harness run <helper>` → `src/cli/runtime/helper-runner.ts` → 解析到 **`assets/templates/helpers/`（打包運行時）**；`scripts/` 是開發副本。hooks 有投影機制（`scripts/sync-hook-sources.ts --check`，接進 `bun run check:hooks` 與 `scripts/check-ci.sh`），**helper scripts 兩邊沒有任何同步檢查**。
- Contract 生命週期：`sprint-backlog start-task` → `capture-plan` → `plan-to-todo`（渲染 contract/review/notes，依 policy 自動 `contract-worktree start`）→ worktree 內執行（pre/post-edit-guard）→ `verify-sprint`（聚合 `verify-contract --strict`＋Human Review Card＋external acceptance＋allowed_paths diff 檢查）→ `contract-worktree finish`（硬閘＋archive＋ff-only merge）→ `ship-worktrees`。
- **`scripts/contract-run.ts`（file-coupled 委派 runner，565 行，與 `assets/templates/helpers/contract-run.ts` 位元組級鏡像）目前不被鏈上任何一步呼叫**；`plan-to-todo.sh` 與 `contract-worktree.sh` 0 處引用。
- 委派雙軌：(a) session 級（`codex-delegation-advisor.sh` 等 native-subagent hooks，Codex-only）；(b) contract 級（contract 內 `## Delegation Contract` YAML，僅 `contract-run.ts` 消費）。兩軌互不相通：native hooks 的品質約束（角色/證據/最終報告格式/薄回報攔截）架構上**到不了** `spawnSync` 出去的 `codex exec` 子行程（`docs/reference-configs/hook-operations.md:86`：hooks 不啟動長任務）。

### P2 · 具體路徑（一份 contract 被委派時弱模型拿到什麼）

`contract-run run --contract <file>` → `buildRun()`（`scripts/contract-run.ts:373`）讀 contract → `runBriefPreflight()`（:322）**只驗 4 項**（Goal 非佔位、Scope 非佔位、allowed_paths 非空、exit_criteria 區塊存在），run 模式 fail-closed（:478，`failure_class: incomplete_brief`）→ `writePrompt()`（:416-440）產出兩份 prompt：

- `worker-prompt.md`：指標行（`Plan:` 只給路徑，內容不內嵌）＋角色/權限＋字面句 **"Implement only the contract scope. Do not mark the task done; the verifier owns review."** ＋ contract 全文。→ 把驗證責任明文推走，無自驗指令、無停止條件、無 notes 義務、無範例。
- `verifier-prompt.md`：**只有 exit_criteria YAML**——verifier 連 Goal/Scope 都看不到。

→ `runChild()`（:339）`spawnSync` 執行 `--worker-command`/`--verifier-command`（runner 選擇＝呼叫者手傳的字面命令；policy 的 `preferred_runners`/`fallback_runner` **從未被 contract-run 讀取**）→ `manifest.json` 記錄結果。

### P3 · 設計判斷

現狀成因：Phase 1（`d3b24ba`）刻意最小交付「檢查＋宣告」，Phase 2 計劃（`plans/plan-20260705-0426-file-coupled-delegation-phase2.md`，Draft）負責接線——但其 slice 4「把 preflight 硬閘接進 plan-to-todo/contract-worktree start」**在架構上不成立**：投影時 contract 剛渲染、全是佔位符，投影點硬閘必然 100% 誤殺。閘必須留在**消費點**（`contract-run run`，Phase 1 已建），投影點只配 advisory 提示（切片 B5）。必須保存的不變量：external acceptance／verify-sprint／scope 檢查等硬閘**不得削弱**；`verify-contract` 的 exit_criteria-only 相容承諾不變；鏡像義務（`contract-run.ts` 兩份位元組級一致）逐片維持。最小一致改動 = 教會三個既有函數/模板，而不是新抽象層。

### 8 原則 × 現狀 × 缺口對照

| # | 原則 | 現狀 | 缺口 → 對應切片 |
|---|------|------|----------------|
| 1 | Why 先行 | contract Goal 是 WHAT；plan 的 Context 只以路徑指標傳遞；verifier 連 Goal 都沒有 | B1（`## Why` 欄）、B2（prompt 內嵌）、B3（preflight 強制） |
| 2 | 檔案化上下文 | 最強項（brief=contract 檔）；但 preflight 窄且 skills 完全不教 contract-run | B3、B5、G1 |
| 3 | 黃金範例 | 全缺 | B1（Exemplar 欄）、B4（範例檔＋守護測試） |
| 4 | 難度/能力路由 | runner 降級只宣告未機械化；advisor 硬編碼、無視 policy 與 contract | D1 |
| 5 | 自主＋強制自驗 | worker 被明文告知「驗證不歸你」 | B2（mandatory self-verification 段） |
| 6 | 分身＋乾淨終驗 | **已是硬閘**（跨廠商 external acceptance＋fingerprint）；但 native hooks 的品質要求到不了 file-coupled 路徑 | B2（把 hook 的要求蒸餾進 prompt 文字） |
| 7 | 持久記憶 | 幾乎全手動：lessons.md 僅 1 條真實記錄；maintenance-triage 只印不寫；notes 模板從未進 prompt | B2（notes 義務）、C1（finish 時 advisory）、A3（resume 自動刷新） |
| 8 | 停止條件 | schema/prompt/邏輯三處全無 | B1（`## Stop Conditions` 欄）、B2（stop/escalate 段） |

### 引擎級發現（8 原則之外，必須先修）

- **E1（最危險）**：`scripts/` ↔ `assets/templates/helpers/` 雙向漂移共 7 檔，無檢查。5 檔打包版較新（portability 修正：`archive-workflow.sh`、`new-spec.sh`、`new-sprint.sh`、`switch-plan.sh`、`verify-sprint.sh`）；1 檔開發版較新（`inspect-project-state.ts` 的 `root-agent-context-divergent` 檢查沒進打包版，**發行版偵測不到 CLAUDE.md/AGENTS.md 漂移**）；1 檔為刻意分裂（`migrate-project-template.sh`：完整實作 vs 薄委派層，**不得調和**）。→ A1/A2
- **E2**：`check-task-workflow --strict` 今天就會 fail 一項：`resume.md`（Jul 4）舊於 `current.md`（Jul 5）。根因：`stop-orchestrator.sh` 每次 Stop 刷 `current.md`（`workflow_write_handoff`，`workflow-state.sh:1739-1935` 只寫 handoff 不寫 resume），`resume.md` 只有手動 prepare 腳本會刷。→ A3
- **E3**：Phase 2 plan 自身 bookkeeping 漂移：Status 仍 Draft、6 個核取方塊全空（slices 1-2 實際已入 `55d41fa`）、`## Task Breakdown` 全文重複兩次（~181-187 與 ~203-209）、`tasks/todos.md` 的 Phase-2 行未更新。slice 2 尾巴：`brief_source` 未被測試斷言。→ 0、D1
- **E4**：`.claude/templates/contract.template.md:30` 與 `assets/templates/contract.template.md:30` 一行措辭漂移（`scripts/verify-sprint.sh` vs `repo-harness run verify-sprint`）。→ B1 順手修
- **E5**：4 份 `repo-harness-{plan,sprint,check,review}/SKILL.md` 對 contract-run/brief/runner/delegation 0 提及。→ G1

## 治理決策（預設值，批准時可改）

> 原定以兩個問題向使用者確認，逾時未答，按推薦預設執行；批准本計劃前可推翻。

1. **分支治理（預設：先合併現分支，新開 worktree）**：`codex/file-coupled-delegation-phase2` 現有 3 commits（slices 1-2 功能＋plan 文檔）是自洽可審單元——先做切片 0（bookkeeping）並 commit，隨後將該分支 merge/PR 回 `main`（無 projected contract，走普通 PR 或本地 ff，由使用者在執行起點裁定方式）；蒸餾計劃以新 plan 在新 worktree `codex/dev-loop-distillation` 執行。
2. **範圍（預設：全量 13 切片）**：0、A1-A3、B1-B5、C1、D1、G1、F1。若需縮量：先砍 B4（黃金範例）再砍 C1（記憶 advisory），主幹 B1-B3/B5 不砍。
3. **Phase 2 處置**：剩餘 slices 3/5/6 被本計劃 D1/各片測試/F1 吸收；slice 4 以「消費點硬閘（已存在）＋投影點 advisory（B5）」的正確形式繼承，原「投影點硬閘」形式廢棄（理由見 P3）。Phase 2 plan 標記 Superseded By 本計劃。

## 全域執行規則（fast-worker 必讀）

1. **鏡像義務，逐片執行**：改 `scripts/<f>` 必同步 `assets/templates/helpers/<f>`（位元組級一致，`diff -q` 驗證）；改 contract 模板必同步三處（`assets/templates/contract.template.md`、`.claude/templates/contract.template.md`、`scripts/plan-to-todo.sh` 內 heredoc 425-525 行附近＋其鏡像 `assets/templates/helpers/plan-to-todo.sh`）；改 hooks 只改 `assets/hooks/` 再 `bun run sync:hooks` 投影，禁止直改 `.ai/hooks/`。
2. **fail-closed**：不加相容 fallback；權威值缺失就報錯停止。可選欄位（如 Exemplar）缺席＝功能不渲染，不是合成預設值的理由。
3. **不得削弱既有硬閘**：external acceptance、verify-sprint、scope 檢查、run 模式 preflight fail-closed。
4. **STOP 協議**：任何切片的 STOP 條件命中時——停止該切片，把實際觀察（檔案、行號、diff、命令輸出）寫進回報與 `tasks/notes/<stem>.notes.md` 的 Open Questions，繼續下一個**不依賴**它的切片或整體暫停等指示。禁止：繞過、猜測合併、放寬測試斷言來「弄綠」。
5. 每個切片完成即跑該片 Verify 命令並在回報中貼原始輸出；沒跑過的不得聲稱通過。
6. 涉及工作流規則整併時參照 `docs/reference-configs/handoff-protocol.md` 與 `docs/reference-configs/sprint-contracts.md`。

## 執行順序

```
0 → [merge 現分支回 main] → [capture 新 plan + worktree] →
A1 → A2 → A3 → B1 → B2 → B3 → B4 → B5 → (C1 ‖ D1 ‖ G1) → F1
```
Stage B 嚴格有序（模板 → prompt → preflight → 範例 → 投影提示），因後者依賴前者引入的節名。C1/D1/G1 檔案不相交，可並行。

---

## 切片詳表

### 切片 0 — Phase 2 plan bookkeeping 勘誤（純文檔，在現分支上做）

**Why**：計劃檔是 file-backed source of truth；它與 git 事實脫節會讓後續所有讀它的代理誤判狀態。

- 檔案：`plans/plan-20260705-0426-file-coupled-delegation-phase2.md`、`tasks/todos.md`
- 改動：
  1. 刪除重複的第二個 `## Task Breakdown` 區塊（~203-209 行；保留 ~181-187 的第一份）。
  2. 前兩行核取方塊改 `- [x]`（`git show 55d41fa --stat` 佐證 policy 欄位與共維護面已入庫）。
  3. Status 行下加：`> **Superseded By**: plans/plan-<新時戳>-dev-loop-distillation.md（Phase 3 吸收剩餘 slices 3-6；slice 4 以消費點閘＋投影 advisory 形式繼承）`。
  4. `tasks/todos.md`：**先讀全檔**。找到 Phase-2 delegation 行，改註為 absorbed-by 新計劃；**其他無關的 deferred 行原樣保留**，禁止整檔重置。
- 測試：無（文檔）。
- Verify：`grep -c "^## Task Breakdown" plans/plan-20260705-0426-file-coupled-delegation-phase2.md` 輸出 `1`；`repo-harness run check-task-workflow`（非 strict；strict 的 resume 項到 A3 才修）。
- **STOP**：兩個 Task Breakdown 區塊內容若不完全相同（審計說相同），停止並回報差異行；不得猜測合併。`tasks/todos.md` 若無 Phase-2 行或結構與 Deferred Goal Ledger 形狀不符，停止回報。

### 切片 A1 — 調和 6 檔 helper 漂移；標記 1 檔刻意分裂

**Why**：`repo-harness run` 執行的是打包副本；兩邊不一致=開發測的與使用者跑的不是同一份程式。這是後續所有切片可信度的地基。

- 方向一（打包 → 開發，5 檔）：`archive-workflow.sh`、`new-spec.sh`、`new-sprint.sh`、`switch-plan.sh`、`verify-sprint.sh` ——打包版多一段 `REPO_HARNESS_TARGET_REPO_ROOT` portability 序言（把 `if REPO_ROOT="$(git -C "$SCRIPT_DIR" rev-parse --show-toplevel ...)"` 換成先檢查 `REPO_HARNESS_TARGET_REPO_ROOT` 的分支）。逐檔先 `diff scripts/<f> assets/templates/helpers/<f>` 確認**差異僅此序言**，然後以打包版覆蓋開發版，達成位元組級一致。
- 方向二（開發 → 打包，1 檔）：`inspect-project-state.ts` ——開發版（292 行）含 `root-agent-context-divergent` 檢查（約 178-213 行），打包版（280 行）缺。以開發版覆蓋打包版。
- **不動**：`migrate-project-template.sh`（開發版=完整遷移實作；打包版=薄委派層，檔內有 "Delegate workflow migrations to the canonical upstream repo-harness" 字樣佐證）。兩邊都不改。
- 測試：無新增（A2 上鎖）。
- Verify：
  ```bash
  for f in archive-workflow.sh new-spec.sh new-sprint.sh switch-plan.sh verify-sprint.sh inspect-project-state.ts; do
    diff -q scripts/$f assets/templates/helpers/$f || echo "DRIFT: $f"
  done   # 期望零輸出
  bun scripts/inspect-project-state.ts --repo . --format text >/dev/null
  bash scripts/migrate-project-template.sh --repo . --dry-run >/dev/null
  bun test tests/migration-script.test.ts tests/helper-scripts.test.ts
  ```
- **STOP**：5 檔中任一檔 diff 顯示**序言以外**的差異（邏輯改動）→ 停止並貼出多出的 hunks，不得盲目覆蓋。`inspect-project-state.ts` 回灌後若 `tests/migration-script.test.ts` 變紅 → 停止回報。

### 切片 A2 — 泛化既有鏡像一致性測試（上鎖）

**Why**：`tests/helper-scripts.test.ts:404` 已有 parity 測試但硬編碼只保 3 檔；泛化它=零新檔案、零 CI 佈線就把整個鏡像面納入必跑檢查（`bun test` 已是 Required Check）。

- 檔案：`tests/helper-scripts.test.ts`（:404 起的 `"core workflow helpers match their distributed template mirrors"`）。
- 改動：改為動態枚舉 `assets/templates/helpers/` 中同時存在於 `scripts/` 的所有檔案，排除檔內常量 `const INTENTIONALLY_DIVERGENT = ["migrate-project-template.sh"];`（附註解說明自host完整實作 vs 打包薄委派層的原因），逐檔斷言位元組相等。測試改名 `"scripts/ helpers are byte-identical to assets/templates/helpers/ mirrors (except intentional splits)"`。
- Verify：`bun test tests/helper-scripts.test.ts`（A1 之後應綠）。
- **STOP**：泛化後若有 `migrate-project-template.sh` 以外的檔案報漂移 → A1 有遺漏或存在未知的刻意分裂，停止回報；**禁止**把它塞進 `INTENTIONALLY_DIVERGENT` 滅音。

### 切片 A3 — resume.md 隨 Stop 自動刷新（修掉今天唯一的 strict 失敗）

**Why**：resume packet 是長任務 rollover 的記憶資產（原則 7）；它恆舊於 current.md 意味每次會話結束後恢復包都是過期的，且 `check-task-workflow --strict` 永遠紅一項。

- 檔案（正典）：`assets/hooks/lib/workflow-state.sh` 的 `workflow_write_handoff`（:1739 起；函數已計算 `resume_file` 於 :1750 但從未寫入）。
- 改動：在寫 `$handoff_file` 的 `EOF_HANDOFF` heredoc（~:1931）之後，追加一段 ≤25 行的緊湊 resume-packet heredoc 寫 `$resume_file`，重用函數已算好的變數（goal、active_plan、active_contract、active_notes、checks_file 等；`research_dir` 不在作用域就用既有 `workflow_policy_get '.tasks.research_dir' 'docs/researches'` 取）。節構仿 `scripts/codex-handoff-resume.sh` 產物（`# Codex Resume Packet` 標題、`> **Generated**`、`## Resume Prompt`、`## Source Artifacts`），確保 `check-task-workflow.sh` 的 `check_handoff_resume_pair` 與 resume-references-plan 檢查滿足。**不要**重構 `codex-handoff-resume.sh`（接受暫時雙寫者；去重列入後續清理）。
- 然後：`bun run sync:hooks` 投影到 `.ai/hooks/lib/workflow-state.sh`。
- 測試：先 `ls tests/ | grep -i -E "hook|workflow-state"` 找現有 hook 測試檔（設計預期 `tests/hook-runtime.test.ts`，若名稱不同用實際檔）。在既有驅動 Stop/handoff 的測試中加斷言：刷新後 `resume.md` 存在且 mtime ≥ `current.md`。
- Verify：
  ```bash
  bun run sync:hooks && bun run check:hooks
  diff -q .ai/hooks/lib/workflow-state.sh assets/hooks/lib/workflow-state.sh
  repo-harness run check-task-workflow --strict   # 期望 0 issues
  bun test <實際 hook 測試檔>
  ```
- **STOP**：`$resume_file` 在函數作用域內解析不到，或投影後 `check:hooks` 報無法用 `sync:hooks` 清除的漂移 → 停止回報；**禁止**改弱 `check_current_resume_freshness` 來過關。

### 切片 B1 — contract 模板三欄位（why-first / 停止條件 / 範例指標）

**Why**：brief 是弱模型唯一保證讀到的檔案；原則 1、3、8 必須欄位化才能被 B2 渲染、被 B3 把關。

- 檔案（四處同改）：`assets/templates/contract.template.md`、`.claude/templates/contract.template.md`、`scripts/plan-to-todo.sh` 的 heredoc（`render_contract_file`，~425-525）、`assets/templates/helpers/plan-to-todo.sh` 鏡像。
- 改動：
  1. **必填節** `## Why`，插在 header 引用塊與 `## Goal` 之間，佔位句逐字為（B3 的剔除清單依賴此原文）：
     ```markdown
     ## Why

     Why this task matters and what breaks downstream if it ships wrong or is skipped.
     ```
  2. **選填節** `## Stop Conditions`，插在 `## Scope` 之後：
     ```markdown
     ## Stop Conditions

     - Stop and hand back to the parent if the change would require editing a path outside Allowed Paths.
     - Stop if an Exit Criteria command cannot be run in this environment.
     - Stop if Goal, Scope, or Exit Criteria are internally contradictory.
     ```
  3. **選填 header 欄**（`> **Notes File**` 之後）：`> **Exemplar**: `docs/reference-configs/contract-brief-example.md``
  4. 順手修 E4：`.claude/templates/contract.template.md:30` 的 `` `scripts/verify-sprint.sh` must… `` 改成 `` `repo-harness run verify-sprint` must… ``，與 assets 版對齊。修完 `.claude` 與 `assets` 兩份模板應完全一致。
- 遷移影響（已分析，執行時複核）：已歸檔 contract 不受影響（`verify-contract` 只讀 exit_criteria）；新投影的 contract 帶佔位符是正常的（B3 閘在消費點）；`ensure-task-workflow.sh`/`project-init-lib.sh` 不渲染 contract，無需改，但跑 `tests/create-project-dirs.runtime.test.ts` 確認無模板內容斷言炸掉。
- 測試：`tests/helper-scripts.test.ts` 中 plan-to-todo 渲染斷言（~:1096-1104）加 `toContain("## Why")`、`toContain("## Stop Conditions")`；檢查 `tests/scaffold-parity.test.ts`（~:139 讀 `.claude/templates/contract.template.md`）是否需要同步更新斷言。
- Verify：
  ```bash
  diff -q .claude/templates/contract.template.md assets/templates/contract.template.md   # 一致
  diff -q scripts/plan-to-todo.sh assets/templates/helpers/plan-to-todo.sh               # 一致
  bun test tests/helper-scripts.test.ts tests/scaffold-parity.test.ts tests/create-project-dirs.runtime.test.ts
  ```
- **STOP**：開工前兩份 `contract.template.md` 若在 line 30 之外還有差異（審計說僅此一行）→ 停止回報，不得整檔互覆。

### 切片 B2 — `writePrompt()` 升級（蒸餾核心）

**Why**：這兩份 prompt 是弱模型執行時的直接視野。把原則 1/5/6/7/8 與 native hooks 到不了的品質要求（證據、反薄回報）蒸餾成 prompt 字面文字。

- 檔案：`scripts/contract-run.ts`（`buildRun` :373 內兩處 `writePrompt` 呼叫 :416-440）＋位元組鏡像 `assets/templates/helpers/contract-run.ts`。
- 前置抽取（用既有 helpers，不新增抽象）：
  ```ts
  const why = sectionBody(contractText, "Why");
  const goal = sectionBody(contractText, "Goal");
  const scope = sectionBody(contractText, "Scope");
  const stopConds = sectionBody(contractText, "Stop Conditions");
  const exemplar = readHeader(contractText, "Exemplar");
  ```
- **worker-prompt.md 新結構**（字面內容；`<...>` 為既有變數插值）：
  ```
  Contract: <repoRelative contract>
  Plan: <plan 或 (none)>
  Notes: <notesFile 或 (none)>
  Exemplar: <exemplar>                 ← 僅 exemplar 非空時輸出此行
  Role mode: <worker.mode>
  Role purpose: <worker.purpose>
  Permission scope: <permission_scope.mode>
  Writable paths: <writable_paths 或 allowed_paths>

  ## Why this task matters

  <why 節內容，trim 後>

  Implement only the contract scope. Do not widen it. Do not mark the task done; the verifier owns the verdict.

  ## Before you finish (mandatory self-verification)

  Run every command listed under exit_criteria.commands_succeed and every test under exit_criteria.tests_pass yourself, in this worktree, before reporting. Paste the exact command line and its output/exit status into your final report. Do not report a criterion as satisfied if you did not run it. If a command fails and you cannot fix it within scope, STOP and report the failure instead of claiming completion. If the contract lists no tests_pass or commands_succeed items, state that explicitly in your report instead of inventing checks.

  ## Record what you learned

  Before finishing, append to the Notes file above: Design Decisions, Deviations From Plan Or Spec, Tradeoffs Considered, and Open Questions. List anything reusable beyond this task under Promotion Candidates.

  ## Stop / escalate

  Hand back to the parent (do not improvise) if the contract Goal, Scope, Allowed Paths, or Exit Criteria are missing or contradictory, if the work requires editing a path outside Allowed Paths, or if any condition under "Stop Conditions" in the contract triggers.
  <stopConds 非空時,以縮排 bullet 附在上行之下>

  ## Contract

  <contractText 全文,原樣——維持檔案化上下文>
  ```
- **verifier-prompt.md 新結構**（修「verifier 盲飛」缺口，但裁決仍嚴格限 exit_criteria）：
  ```
  Contract: <repoRelative contract>
  Review file: <reviewFile 或 (none)>
  Role mode: <verifier.mode>
  Role purpose: <verifier.purpose>

  ## Intent (context only)

  Goal: <goal，trim>
  Scope: <scope，trim>
  Why: <why，trim——僅非空時輸出>

  Use the Intent above only to understand what the worker was asked to do. Score PASS or FAIL strictly against the Exit Criteria below; do not invent another rubric or grade work outside these criteria. Before scoring, confirm from the worker's report that it actually ran the tests_pass and commands_succeed items; re-run any item whose evidence you cannot confirm.

  ## Exit Criteria

  <exitCriteria 或 (none)>
  ```
- 測試（`tests/contract-run.test.ts`）：
  - **既有斷言 :171-173** `toContain("Review only against the contract exit criteria")` 的字串已不存在——改為 `toContain("Score PASS or FAIL strictly against the Exit Criteria")` 並加 `toContain("## Intent (context only)")`。
  - dry-run 測試加 worker prompt 斷言：`"## Why this task matters"`、`"## Before you finish (mandatory self-verification)"`、`"## Record what you learned"`、`"## Stop / escalate"`。
  - `writePilotContract` fixture 需先具備具體 `## Why`（在 B3 一併做）。
- Verify：
  ```bash
  diff -q scripts/contract-run.ts assets/templates/helpers/contract-run.ts
  bun test tests/contract-run.test.ts
  ```
- **STOP**：對無 `## Stop Conditions` 標題的 contract，`sectionBody(contractText, "Stop Conditions")` 若返回非空 → 標題正則有誤，停止回報。編輯後兩份 `contract-run.ts` 非位元組一致 → 停止。

### 切片 B3 — `runBriefPreflight()` 新增唯一必檢：`## Why`

**Why**：why 是 8 原則裡唯一「缺了弱模型必然降智」且可機器驗證的欄位。其餘新欄位保持選填（避免破壞既有 contracts 與測試 fixtures，遵守 fail-closed 但不過度把關）。

- 檔案：`scripts/contract-run.ts`（`runBriefPreflight` :322、`isConcreteBrief` :310）＋鏡像。
- 改動：
  1. `runBriefPreflight` 在 Scope 檢查後加：
     ```ts
     if (!isConcreteBrief(sectionBody(markdown, "Why"))) {
       issues.push("Why section is empty or still a template placeholder");
     }
     ```
  2. `isConcreteBrief` 的剔除鏈加一條 `.replace(/Why this task matters and what breaks downstream if it ships wrong or is skipped\./g, "")`（與 B1 佔位句逐字一致）。
  3. **只有 `## Why` 升為必檢**。`## Stop Conditions`、`Exemplar`、自驗均為 prompt 渲染層，不進 preflight。
- 測試（`tests/contract-run.test.ts`）：
  - `writePilotContract` 在 header 與 `## Goal` 間插具體 Why（例：`This pilot proves the worker→verifier file-coupled loop; without it the runner ships unverified.`）→ 既有 preflight-pass/run/runner-metadata/budget/dry-run 各測試保持綠。
  - 新增 `"preflight fails closed when Why is a placeholder"`：其餘齊全、`## Why` 保留佔位句的 contract → 期望 `status: "fail"`、`failure_class: "incomplete_brief"`、issues 含 Why 訊息。
  - 既有兩個 fail 型 fixtures（:380、:432 附近）本無 Why → 仍 fail，且 :426 的 `issues.length >= 2` 斷言仍成立（多了 Why issue 只會更多）。
- Verify：`bun test tests/contract-run.test.ts` ＋ 兩份 `contract-run.ts` `diff -q`。
- **STOP**：Why 必檢若導致**預期 fixtures 之外**的測試變紅（例如吃真實 contract 的整合測試）→ 停止回報是哪個測試；正解是給該 fixture 補 `## Why`，**不是**放寬閘。

### 切片 B4 — 黃金範例檔＋守護測試

**Why**：原則 3——一個完整可驗證的好例子勝過十條規則；守護測試讓範例永遠誠實（有人把它改壞 CI 就紅）。

- 新檔：`docs/reference-configs/contract-brief-example.md` ——一份**填寫完整、內部自洽**的 contract 實例（不是模板）：具體 `## Why`、具體 Goal/Scope、真實 `allowed_paths`、完整 `delegation` 塊、可執行的 `exit_criteria`（commands_succeed/tests_pass 用本 repo 真實命令）、填妥的 `## Stop Conditions`，附短註「what good looks like」。以 `tests/contract-run.test.ts` 的 `writePilotContract` fixture 為底擴寫（它已是可過閘的已知形狀）。
- 佈線：B1 的 `> **Exemplar**` 已指向此檔；B2 的 writePrompt 在欄位存在時渲染指標。**不在** `contract-run.ts` 硬編碼此路徑（下游 repo 缺此檔=欄位空=不渲染，符合選填語義）。
- 單副本：位於 `docs/reference-configs/`（既有參考面），非模板，無鏡像義務。
- 測試：`tests/contract-run.test.ts` 加守護測試——複製該檔到 tmp 後跑 `contract-run preflight`，斷言 `preflight_pass`。
- Verify：`bun scripts/contract-run.ts preflight --contract docs/reference-configs/contract-brief-example.md --json` → `"status": "preflight_pass"`。
- **STOP**：範例過不了自己的 preflight → 修範例；**禁止**停用守護測試。（範圍收縮時本片第一個被延後：Exemplar 欄空著即可，無破壞。）

### 切片 B5 — plan-to-todo 投影後 advisory 提示（Phase-2 slice 4 的正確形式）

**Why**：投影點不能硬閘（佔位符必炸），但投影完成的那一刻是教「填 brief → 跑 preflight」的最佳時機（原則 2/5 的入口教學）。

- 檔案：`scripts/plan-to-todo.sh`（`render_contract_file` 成功寫出 contract 之後）＋鏡像 `assets/templates/helpers/plan-to-todo.sh`。
- 改動：向 stderr 印兩行 advisory（`|| true` 護住，**不改 exit code**）：
  ```
  [Brief] Contract rendered with template placeholders: <contract-path>
  [Brief] Fill ## Why / ## Goal / ## Scope / allowed_paths / exit_criteria, then run: repo-harness run contract-run preflight --contract <contract-path>
  ```
- 測試：`tests/helper-scripts.test.ts` 的 plan-to-todo 案例加 stderr 含 `[Brief]` 斷言，且 exit code 不變。
- Verify：`diff -q scripts/plan-to-todo.sh assets/templates/helpers/plan-to-todo.sh`；`bun test tests/helper-scripts.test.ts`。
- **STOP**：加印後任何既有 plan-to-todo 測試 exit code 變化 → 停止（advisory 必須零副作用）。

### 切片 C1 — finish 時記憶 advisory（不寫檔、不擋閘）

**Why**：記憶鏈全手動、lessons.md 只有 1 條——瓶頸在「無人在正確時機被提醒」。contract 收官那刻把既有兩個信號浮上來，是不建重機械的最小閉環（原則 7）。

- 檔案：`scripts/verify-sprint.sh`（聚合結果算完後、`verify-contract` 呼叫附近 ~:372）＋鏡像。
- 第一步（先讀後接）：讀 `scripts/maintenance-triage.sh` 確認其輸出介面（是否有 `--json`）。無法無損解析就把 triage 部分縮掉、只做 notes 檢查，並在回報中說明。
- 改動（全部 advisory、stderr、`|| true`，**絕不**改 exit code）：
  1. active notes 檔的 `## Promotion Candidates` 下存在非樣板條目 → 印 `[Maintenance] Notes list promotion candidates — review before archive: <notes-file>`。
  2. maintenance-triage 有可解析輸出且 guard/eval/skill_proposal 任一非空 → 印 `[Maintenance] Repeated lessons ready to promote: guard=<n> eval=<n> skill_proposal=<n> (see tasks/lessons.md)`。
- 明確不做（YAGNI）：`maintenance-triage --write` 自動落地、自動編輯 `tasks/lessons.md`、重置 `tasks/todos.md`。
- 測試：`tests/helper-scripts.test.ts` 加 verify-sprint 案例——notes 含真實 Promotion Candidate 時 stderr 出現 advisory 行、exit code 不變。
- Verify：`diff -q scripts/verify-sprint.sh assets/templates/helpers/verify-sprint.sh`；`bun test tests/helper-scripts.test.ts`。
- **STOP**：advisory 導致任何既有 verify-sprint 測試 exit code 變化 → 停止。

### 切片 D1 — advisor 瘦身＋runner 使用記錄（吸收 Phase-2 slice 3；含設計裁決 D）

**Why**：原則 4——路由智慧放 advisor（讀 policy、指向 contract），contract-run 只負責如實記錄用了哪個 runner。裁決：**不做**跨 runner 自動嘗試（contract-run 只跑單一字面命令、native subagent 對其 spawnSync 子行程不可達——自動降級是假的），只補「記錄＋非靜默」以兌現 `policy.runner_rule` 的承諾。

- 檔案 1（正典）：`assets/hooks/codex-delegation-advisor.sh`（改後 `bun run sync:hooks` 投影；維持 Codex-only）。
  - 改動：移除硬編碼 `max_agents: 3` / `max_depth: 1` 字面值（~:108-111）與泛用 spawn nudge（~:130-149）；改為讀 `.ai/harness/policy.json` 的 `.delegation.max_agents/.max_depth`；注入文字指向 active contract（由 `.ai/harness/active-plan` 推導 `tasks/contracts/<stem>.contract.md`）作為 authoritative brief；敘明依 `.delegation.preferred_runners` 選 runner、依 `.fallback_runner` 降級且「降級必須記錄於 contract-run manifest、不得靜默成功」。hook 僅注入上下文，**不啟動任何 runner**。
- 檔案 2：`scripts/contract-run.ts`（＋鏡像）。
  - 改動（~12 行）：新增選項 `--runner <label>`；預設取 contract 自身 `runner.preferred[0]`（`parseRunner` 已解析，**不**讀 policy.json，維持 brief authoritative）；manifest 增記 `runner_usage: { used: <label>, off_policy: <label 不在 preferred 且 ≠ fallback 時 true> }`（鍵名避免與既有 `delegation.runner` 宣告欄位混淆）。無行為變化，純記錄。
- 測試：
  - advisor：現有 hook 測試檔加斷言——注入文字含 active contract 路徑；policy 值改動時不再出現字面 `max_agents: 3` 硬編碼；快照 nudge。
  - `tests/contract-run.test.ts`：runner-metadata 測試擴展斷言 `manifest.runner_usage.used` 與 `off_policy`（dry-run 即可驗）。
  - 收 Phase-2 slice 2 尾巴：`tests/create-project-dirs.runtime.test.ts`（~:396 附近）加 `expect(policy.delegation.brief_source).toBe("tasks/contracts/<stem>.contract.md")`。
- Verify：
  ```bash
  bun run sync:hooks && bun run check:hooks
  diff -q scripts/contract-run.ts assets/templates/helpers/contract-run.ts
  bun test tests/contract-run.test.ts tests/create-project-dirs.runtime.test.ts <hook測試檔>
  ```
- **STOP**：hook 環境讀 policy 所需工具與現有假設不符（它現行已依賴的工具鏈之外還要新依賴）→ 停止回報，**禁止**悄悄退回硬編碼。

### 切片 G1 — Skills 教學面（4 份 SKILL.md）

**Why**：原則 2/4 要觸達人類入口——操作者按文檔走完規劃流程卻從不知道 preflight/brief/runner 存在（E5）。

- 檔案：`assets/skill-commands/repo-harness-plan/SKILL.md`、`repo-harness-sprint/SKILL.md`、`repo-harness-check/SKILL.md`、`repo-harness-review/SKILL.md`。
- 改動：各加一段 ≤6 行、貼合角色的段落——plan/sprint：「`tasks/contracts/<stem>.contract.md` 是 authoritative delegation brief；交付 file-coupled 執行前填妥 `## Why`/`## Goal`/`## Scope`/`## Stop Conditions`/`allowed_paths`/`exit_criteria`，以 `repo-harness run contract-run preflight` 驗完整性」；check/review：「file-coupled run 的 worker 須自跑 exit_criteria 並貼證據，verifier 僅按 exit_criteria 裁決；審查時核對 worker 貼出的命令證據」。
- 測試：無必需（文檔）；若存在 skills manifest/lint 測試則跑之。
- Verify：`grep -l contract-run assets/skill-commands/repo-harness-*/SKILL.md` 列出 4 檔；`bun test` 整體仍綠。
- **STOP**：任一 SKILL.md 帶「generated / do not edit」標記 → 停止，改其源頭。

### 切片 F1 — 全量驗證（吸收 Phase-2 slice 6）

無檔案改動。依序執行，全綠才算收官；任何一紅就停在該項回報（不得補「計劃外修復 commit」矇混）：

```bash
bun test
# typecheck：先查 package.json scripts 實名（check:type 或 typecheck），用實名跑；兩者皆無則回報跳過
bun run check:hooks
bash scripts/check-deploy-sql-order.sh
bash scripts/check-architecture-sync.sh
bash scripts/check-task-sync.sh
repo-harness run check-task-workflow --strict
bun scripts/inspect-project-state.ts --repo . --format text >/dev/null
bash scripts/migrate-project-template.sh --repo . --dry-run >/dev/null
diff -q scripts/contract-run.ts assets/templates/helpers/contract-run.ts
# 煙囪測試:黃金範例過閘、佔位 contract 被擋
bun scripts/contract-run.ts preflight --contract docs/reference-configs/contract-brief-example.md --json   # preflight_pass
# 對一份新投影的佔位 contract 跑 preflight,確認 fail-closed + incomplete_brief
```

---

## YAGNI 殺單（明確不做，附理由）

1. **contract-run 內跨 runner 自動嘗試/降級**——單字面命令架構下是假降級；以 manifest 記錄取代（D1）。
2. **maintenance-triage --write 自動落地 guard/eval/skill**——重機械且易寫入低信號規則；以 finish 時 advisory 取代（C1）。
3. **把 Stop Conditions / Exemplar / 自驗升為 preflight 必檢**——會誤殺歸檔 contracts 與 fixtures，安全收益為零；只 `## Why` 必檢（B3）。
4. **把 plan 的 Context/Trade-offs 刮進 worker prompt**——脆弱的跨檔抓取，違反檔案化上下文原則；改為 contract 內作者親寫 `## Why`（B1）。
5. **新建 helper-parity 檢查腳本＋CI 佈線**——`tests/helper-scripts.test.ts:404` 已有模式，泛化即可（A2）。
6. **A3 順手把 codex-handoff-resume.sh 重構到共用 writer**——對弱執行者是碰撞風險；接受暫時雙寫者，去重另列清理。
7. **Phase-2 slice 4 原形式（投影點硬閘）**——佔位符必炸；以消費點閘（已有）＋B5 advisory 繼承其意圖。
8. **把 native-subagent 品質 hooks 移植到 contract-run 可達**——Phase-2 明列 non-scope 且違反 hooks 不啟動長任務；其要求已蒸餾進 B2 prompt 文字。

## 風險與回滾

| 風險 | 可能性 | 影響 | 緩解 |
|------|--------|------|------|
| B2 打破 :171-173 精確字串斷言 | 高（預期內） | 低 | 已列為 B2 的一部分，同步更新 |
| A3 動 1935 行共享 lib＋hook 投影 | 中 | 中 | 單函數尾部追加、重用既有變數；`sync:hooks`+`check:hooks` 驗證；緊 STOP |
| A1 覆蓋掉未審計的第二處差異 | 低 | 中 | 逐檔 diff 的 STOP 前置；A2 測試上鎖複驗 |
| Why 必檢誤傷在途真實 contract | 低 | 低 | preflight 只在消費點跑；contract-run 目前不在活鏈上；fixtures 全部更新 |
| `migrate-project-template.sh` 被誤調和 | 低 | 高 | A1 明文排除＋A2 `INTENTIONALLY_DIVERGENT` 唯一成員＋檔內註解 |
| 雙 resume 寫者外觀漂移 | 低 | 低 | 兩者皆產合法 packet；檢查按 mtime；去重列後續 |
| 下游 repo 無範例檔 | 中 | 低 | Exemplar 選填；缺席=不渲染 |

回滾：全部切片無資料遷移、可獨立 `git revert`。鏡像對（contract-run.ts、plan-to-todo.sh、verify-sprint.sh）必須成對 revert 保持位元組一致。A3 revert 後僅回到今天已知的 resume staleness。分支級：新 worktree `codex/dev-loop-distillation` 整支可棄，main 不受影響。

## 執行路由（批准後）

1. 現分支 `codex/file-coupled-delegation-phase2` 上完成切片 0，commit。
2. 該分支 merge/PR 回 `main`（方式由使用者裁定；分支無 projected contract，走普通 PR 即可）。
3. 在 `main` 上以本檔為 body 捕獲新計劃：
   ```bash
   repo-harness run capture-plan --artifact-level work-package --slug dev-loop-distillation \
     --title "Dev loop distillation Phase 3: brief/prompt/preflight + engine integrity" \
     --status Approved --execute --promotion-reason merge_boundary --body-file <本計劃內容>
   ```
   （`--execute` 依 policy 自動 `plan-to-todo` → `contract-worktree start`，worktree 分支 `codex/dev-loop-distillation`。）
4. Contract 投影後，把本檔的 F1 命令填進 contract 的 `exit_criteria.commands_succeed`，`## Why` 從本檔 Context 濃縮親寫，然後 `repo-harness run contract-run preflight` 自證過閘——**讓本計劃成為第一份吃自己狗糧的蒸餾 brief**。
5. 切片執行交 fast-worker（Sonnet 5）；每片完成貼 Verify 輸出。收官走標準閘：Waza `/check` → external acceptance（Claude host 用 codex-review）→ `contract-worktree finish`。

## Task Breakdown
- [x] 0 Phase-2 plan bookkeeping 勘誤（slice-0 commit 完成；advisor 行由 ca76def 交付）
- [x] A1 調和 6 檔 helper 漂移（migrate-project-template.sh 除外）
- [x] A2 泛化鏡像 parity 測試（INTENTIONALLY_DIVERGENT 唯一成員）
- [x] A3 resume.md 隨 Stop 自動刷新（workflow_write_handoff 尾部）
- [x] B1 contract 模板三欄位（Why / Stop Conditions / Exemplar，四處同改）
- [x] B2 writePrompt() 蒸餾升級（worker 自驗+notes+stop；verifier 得 Intent）
- [x] B3 preflight 新增唯一必檢 ## Why
- [x] B4 黃金範例 docs/reference-configs/contract-brief-example.md＋守護測試
- [ ] B5 plan-to-todo 投影後 advisory —— 改由平行分支 codex/projection-brief-advisory 交付中（其實作直接呼叫 contract-run preflight，優於本計劃的靜態提示）；本分支不實作以免雙重 advisory 與合併衝突。若該分支未落地，重啟此列。
- [x] C1 verify-sprint 收官記憶 advisory（不改 exit code）
- [ ] D1 縮減版：contract-run --runner 選項＋manifest runner_usage 記錄＋brief_source 測試斷言（advisor 半邊已由 ca76def 交付，本分支不碰 advisor 檔案）
- [ ] G1 4 份 repo-harness SKILL.md 教學段落
- [ ] F1 全量驗證 battery

## Deviations From Approved Plan
- 分支治理改為 stack 疊加：發現 live stacked-PR 流（#39/#40 + codex/advisor-file-coupled-nudge 已推 origin），本地 merge main 會與遠端 PR 流脫鉤。本分支 codex/dev-loop-distillation 疊在 ca76def 之上；stack 自底向上合併後與原計劃等價。
- D1 縮減：advisor 瘦身已由 ca76def 交付（讀 policy limits、指向 active contract、降級留痕、tests/cli/hook.test.ts 覆蓋）。D1 只剩 contract-run 側。

## Annotations
<!-- [NOTE]: prefixed inline. Claude processes all and revises. -->
