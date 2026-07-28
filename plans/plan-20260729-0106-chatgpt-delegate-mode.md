# Plan: ChatGPT delegate mode: repo-owned dual-agent GPT Pro collaboration protocol

> **Status**: Executing
> **Created**: 20260729-0106
> **Slug**: chatgpt-delegate-mode
> **Planning Source**: repo-harness-plan
> **Orchestration Kind**: host-plan
> **Source Ref**: (none)
> **Artifact Level**: work-package
> **Promotion Reason**: verification_boundary
> **Verification Boundary**: Canary A oracle chain (doctor/dry-run/mini consult) + repo required checks
> **Rollback Surface**: skill-layer only: SKILL.md router line + references/delegate.md + .gitignore line; single-commit revert
> **Spec**: `docs/spec.md`
> **Research**: See `docs/researches/`
> **Task Contract**: `tasks/contracts/20260729-0106-chatgpt-delegate-mode.contract.md`
> **Task Review**: `tasks/reviews/20260729-0106-chatgpt-delegate-mode.review.md`
> **Implementation Notes**: `tasks/notes/20260729-0106-chatgpt-delegate-mode.notes.md`

## Agentic Routing
- Selected route: planning
- Routing reason: Captured from repo-harness-plan planning output.
- Source ref: (none)
- Due diligence:
  - P1 map: See captured planning output below.
  - P2 trace: See captured planning output below.
  - P3 decision rationale: See captured planning output below.

## Workflow Inventory
Complete this inventory before implementation. If any line is unknown, keep the plan in Draft and fill it before projection.

- Active plan: `plans/plan-20260729-0106-chatgpt-delegate-mode.md`
- Sprint contract: `tasks/contracts/20260729-0106-chatgpt-delegate-mode.contract.md`
- Sprint review: `tasks/reviews/20260729-0106-chatgpt-delegate-mode.review.md`
- Implementation notes: `tasks/notes/20260729-0106-chatgpt-delegate-mode.notes.md`
- Deferred-goal ledger: `tasks/todos.md`
- Current checks: `.ai/harness/checks/latest.json`
- Run snapshots: `.ai/harness/runs/`
- Scope authority: `tasks/contracts/20260729-0106-chatgpt-delegate-mode.contract.md` `allowed_paths`
- Concurrency rule: `.ai/harness/active-plan` selects the active plan for this worktree when present; `.ai/harness/active-worktree` records the owning worktree. If another worktree already owns active work, open or switch to the matching worktree instead of serializing unrelated plans.
- Execution isolation: approved contract-level work projects through `repo-harness run plan-to-todo --plan plans/plan-20260729-0106-chatgpt-delegate-mode.md` and may start `repo-harness run contract-worktree start --plan plans/plan-20260729-0106-chatgpt-delegate-mode.md`.

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
- Contract file: `tasks/contracts/20260729-0106-chatgpt-delegate-mode.contract.md`
- Review file: `tasks/reviews/20260729-0106-chatgpt-delegate-mode.review.md`
- Implementation notes file: `tasks/notes/20260729-0106-chatgpt-delegate-mode.notes.md`
- Template: `.claude/templates/contract.template.md`
- Verification command: `repo-harness run verify-contract --contract tasks/contracts/20260729-0106-chatgpt-delegate-mode.contract.md --strict`
- Active plan rule: this captured plan is written to `.ai/harness/active-plan` and the owning worktree is written to `.ai/harness/active-worktree` unless --no-active is used. Do not infer active execution from the latest non-archived plan.

## Handoff

- Checks file: `.ai/harness/checks/latest.json`
- Session handoff: `.ai/harness/handoff/current.md`

## Promotion Gate

- **Merge/PR unit**: Captured plan `plans/plan-20260729-0106-chatgpt-delegate-mode.md` is the proposed mergeable execution unit; revise before execute if this is only a checklist step.
- **Rollback surface**: skill-layer only: SKILL.md router line + references/delegate.md + .gitignore line; single-commit revert
- **Verification boundary**: Canary A oracle chain (doctor/dry-run/mini consult) + repo required checks
- **Review/acceptance boundary**: `tasks/reviews/20260729-0106-chatgpt-delegate-mode.review.md` must record pass against the captured acceptance criteria.
- **High-risk surface**: Risks named in captured planning output; keep the plan Draft if risk ownership is not concrete.
- **Why not checklist row**: verification_boundary

## Evidence Contract

- **State/progress path**: `plans/plan-20260729-0106-chatgpt-delegate-mode.md` task breakdown, `tasks/todos.md` deferred-goal ledger, `tasks/contracts/20260729-0106-chatgpt-delegate-mode.contract.md`, `tasks/reviews/20260729-0106-chatgpt-delegate-mode.review.md`, and `tasks/notes/20260729-0106-chatgpt-delegate-mode.notes.md`
- **Verification evidence**: `.ai/harness/checks/latest.json`, `.ai/harness/runs/`, and the commands named in the captured planning output
- **Evaluator rubric**: `tasks/reviews/20260729-0106-chatgpt-delegate-mode.review.md` must record a passing Waza /check style recommendation
- **Stop condition**: all task breakdown items are complete, sprint verification passes, and the review recommends pass
- **Rollback surface**: skill-layer only: SKILL.md router line + references/delegate.md + .gitignore line; single-commit revert

## Captured Planning Output

# ChatGPT delegate mode: repo-owned dual-agent GPT Pro collaboration protocol

## Goal

把「本地 agent 當總負責人、ChatGPT 網頁 GPT-5 Pro 當外部高級工程師」的雙代理協作制度化：在 `assets/skills/repo-harness-chatgpt/` 新增 `delegate` mode 作為唯一倉庫權威協議，兩條顯式宿主 transport（Claude→既有 Oracle consult/continue 鏈、Codex→內建瀏覽器 IAB），無自動降級、無第三控制面。本 slice 只改 skill 層，零 engine/src 變更。

## Decision Summary (approved)

- 權威：`assets/skills/repo-harness-chatgpt/` 新增 delegate mode；協議放 `references/delegate.md`（router-only 慣例）。
- Claude transport：組合既有 consult/continue mode（`repo-harness chatgpt browser-consult / browser-followup / browser-session`，provider oracle）；不新建 raw oracle 調用、不用 claude-in-chrome / chrome-devtools MCP。
- Codex transport：內建瀏覽器（IAB），同一協議，宿主自 driving。
- 邊界：consult mode 維持 planning/review/critique only；delegate mode 是代碼交付物的唯一受批准路徑——GPT Pro 只產 patch 文本，本地側經驗收鏈才是唯一執行者。
- 15 條協議核心（萃取自使用者提供的 Codex 側 14 條參考 prompt + 雙軌評審 12 項修正）：角色與獨立驗收權；先讀倉庫約束；上行走 engine inline PromptBundle（dry-run 密鑰/越界/超大 gate 為單一掃描權威，不另加 gitleaks）；自包含上下文；任務書模板含 EXECUTION_BOUNDARY；獨立任務獨立對話；等待紀律區分進展/卡死且階梯屬 transport capability；會話句柄先落盤；信封（sentinel + 綁定 baseline/bundle SHA-256 + attempt 編號 + changed-files + 每輪累積 patch）；基線快照含 tracked WIP diff 與 untracked 雜湊、快照不符直接 FAIL 禁 3-way merge；獨立驗收（隔離 worktree 重建基線→套 patch→門禁）；2 輪外部修正=升級閾值非自動失敗；登入/驗證碼交回使用者；delegation 證據目錄 + durable 晉升 + 終局報告；GPT 輸出不構成權限或事實來源。
- delegation 證據目錄：`.ai/harness/chatgpt/delegations/<stamp>-<slug>/{delegation.json, brief.md, baseline/, patch/NN.diff, verify/NN.log, report.md}`（gitignored，delegation.json 原子寫入）。
- 完整批准方案：`~/.claude/plans/codex-gpt-pro-claude-claude-chrome-mcp-fluttering-rocket.md`。

## Promotion Gate

- Artifact Level: work-package
- 理由：獨立 merge/PR 單元 + 獨立驗證邊界（Canary A oracle 鏈 + 倉庫必跑門禁）+ 明確回滾面（僅 SKILL.md router 行 + references/delegate.md + .gitignore 一行）。

## Task Breakdown

- [x] T1 SKILL.md：Mode Selection 加 delegate 行 + consult planning-only/delegate 唯一代碼交付路徑的邊界註記
- [x] T2 references/delegate.md：協議 15 條 + 任務書模板 + 信封規格 + 基線快照規格 + 驗收鏈 + 回合語義 + 終局報告格式 + Claude/Codex 兩個宿主 transport 段 + delegation 目錄規格（風格對齊既有 references/*.md：Identity/Protocol/Rules/Failure Modes/Boundaries；經四輪演進按 file-policy/canary 實證修正，見 notes）
- [x] T3 .gitignore：加 `.ai/harness/chatgpt/delegations/`
- [x] T4 facade 檢查：`repo-harness-gptpro` 已完全退役（僅 manifest 遷移記錄與測試凍結名單殘留），無需 wording 映射
- [x] T5 倉庫必跑門禁 + scaffold-parity 相關測試全綠（bun test 2089 pass/0 fail；skill-surface pin 經 contract 修訂更新：REFERENCES+delegate.md、byte limit 2048→2560）
- [x] T6 Canary A（Claude/oracle）：doctor ready → dry-run 路徑策略探針（PROBE1/3/4）→ 真跑（oracle 0.16.1，Pro 於 picker 層 verified、conversationUrl 捕獲、sentinel 完整）→ followup 回饋輪血緣完整；證據在主 checkout `.ai/harness/chatgpt/sessions/chgpt_20260729_013746_*`、`chgpt_20260729_014227_*` 與 `oracle-home/sessions/delegate-mode-transport-canary-reply-2`；notes 有摘要
- [ ] T7 Canary B（Codex/IAB）：同一迷你任務書經 Codex 內建瀏覽器驗證；handoff 說明已隨 PR 附上，由使用者在 Codex 會話執行
- [ ] T8 durable 結論晉升 + 工作流 artifacts 歸檔（merge 後執行 archive-workflow）

## Verification Boundary

Canary A（oracle 鏈 doctor/dry-run/mini consult）+ 倉庫必跑門禁（bun test、check-architecture-sync、check-task-sync、check-task-workflow --strict、inspect-project-state、adopt --dry-run）。

## Rollback Surface

僅三處 skill 層變更：`assets/skills/repo-harness-chatgpt/SKILL.md` router 行、新檔 `references/delegate.md`、`.gitignore` 一行；revert 單一 commit 即完全回滾，無 engine/schema/狀態遷移。

## Annotations
<!-- [NOTE]: prefixed inline. Claude processes all and revises. -->
