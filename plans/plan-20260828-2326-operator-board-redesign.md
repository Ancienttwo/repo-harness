# Plan: Operator board redesign: worklist + detail pane + task message channel

> **Status**: Executing
> **Created**: 20260828-2326
> **Slug**: operator-board-redesign
> **Planning Source**: repo-harness-plan
> **Orchestration Kind**: host-plan
> **Source Ref**: (none)
> **Artifact Level**: work-package
> **Promotion Reason**: merge_boundary
> **Verification Boundary**: browser runtime + test contract + snapshot digest tests
> **Rollback Surface**: single feature branch revert; protocol bump atomic with UI
> **Spec**: `docs/spec.md`
> **Research**: See `docs/researches/`
> **Task Contract**: `tasks/contracts/20260828-2326-operator-board-redesign.contract.md`
> **Task Review**: `tasks/reviews/20260828-2326-operator-board-redesign.review.md`
> **Implementation Notes**: `tasks/notes/20260828-2326-operator-board-redesign.notes.md`

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

- Active plan: `plans/plan-20260828-2326-operator-board-redesign.md`
- Sprint contract: `tasks/contracts/20260828-2326-operator-board-redesign.contract.md`
- Sprint review: `tasks/reviews/20260828-2326-operator-board-redesign.review.md`
- Implementation notes: `tasks/notes/20260828-2326-operator-board-redesign.notes.md`
- Deferred-goal ledger: `tasks/todos.md`
- Current checks: `.ai/harness/checks/latest.json`
- Run snapshots: `.ai/harness/runs/`
- Scope authority: `tasks/contracts/20260828-2326-operator-board-redesign.contract.md` `allowed_paths`
- Concurrency rule: `.ai/harness/active-plan` selects the active plan for this worktree when present; `.ai/harness/active-worktree` records the owning worktree. If another worktree already owns active work, open or switch to the matching worktree instead of serializing unrelated plans.
- Execution isolation: approved contract-level work projects through `repo-harness run plan-to-todo --plan plans/plan-20260828-2326-operator-board-redesign.md` and may start `repo-harness run contract-worktree start --plan plans/plan-20260828-2326-operator-board-redesign.md`.

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
- Contract file: `tasks/contracts/20260828-2326-operator-board-redesign.contract.md`
- Review file: `tasks/reviews/20260828-2326-operator-board-redesign.review.md`
- Implementation notes file: `tasks/notes/20260828-2326-operator-board-redesign.notes.md`
- Template: `.claude/templates/contract.template.md`
- Verification command: `repo-harness run verify-contract --contract tasks/contracts/20260828-2326-operator-board-redesign.contract.md --strict`
- Active plan rule: this captured plan is written to `.ai/harness/active-plan` and the owning worktree is written to `.ai/harness/active-worktree` unless --no-active is used. Do not infer active execution from the latest non-archived plan.

## Handoff

- Checks file: `.ai/harness/checks/latest.json`
- Session handoff: `.ai/harness/handoff/current.md`

## Promotion Gate

- **Merge/PR unit**: Captured plan `plans/plan-20260828-2326-operator-board-redesign.md` is the proposed mergeable execution unit; revise before execute if this is only a checklist step.
- **Rollback surface**: single feature branch revert; protocol bump atomic with UI
- **Verification boundary**: browser runtime + test contract + snapshot digest tests
- **Review/acceptance boundary**: `tasks/reviews/20260828-2326-operator-board-redesign.review.md` must record pass against the captured acceptance criteria.
- **High-risk surface**: Risks named in captured planning output; keep the plan Draft if risk ownership is not concrete.
- **Why not checklist row**: merge_boundary

## Evidence Contract

- **State/progress path**: `plans/plan-20260828-2326-operator-board-redesign.md` task breakdown, `tasks/todos.md` deferred-goal ledger, `tasks/contracts/20260828-2326-operator-board-redesign.contract.md`, `tasks/reviews/20260828-2326-operator-board-redesign.review.md`, and `tasks/notes/20260828-2326-operator-board-redesign.notes.md`
- **Verification evidence**: `.ai/harness/checks/latest.json`, `.ai/harness/runs/`, and the commands named in the captured planning output
- **Evaluator rubric**: `tasks/reviews/20260828-2326-operator-board-redesign.review.md` must record a passing Waza /check style recommendation
- **Stop condition**: all task breakdown items are complete, sprint verification passes, and the review recommends pass
- **Rollback surface**: single feature branch revert; protocol bump atomic with UI

## Captured Planning Output

# Operator Board 重設計:worklist + 常駐 detail pane + task message 通道

## Goal

把 `src/operator-web/` 的 operator board 從「五欄 kanban 驗收殼」重建為 attention-first 決策面,並暴露既有 `fleet message` 效果為板上唯一寫動作。用戶已批准方案(artifact 070fd6ec),三個決策點按默認值:attention-first 分組順序、板端 `sender_kind: 'operator'`(固定 `sender_id: 'control-board'`)、契約 additive 增欄 + `FLEET_BOARD_PROTOCOL` bump。

## Decisions (frozen)

- 主視圖:單列優先序 worklist(需要你 → 可合併 → 不可讀 repo → agent 進行中 → external → done,後三組默認收合),不再渲染 kanban 五欄、左側 rail 錨點導航、獨立 Repositories 區塊。
- 右側 detail pane 常駐;未選取時顯示 repo × stage 矩陣 + repo 健康。
- 常駐狀態列:相對資料年齡、seq、一致性;stale 時整面去飽和 + 年齡轉紅;changed_during_read 標記狀態列與受影響行,不取代 stage 標籤。
- 人類標籤:`FleetBoardCardV1` 增 `task_label`(來自 `row.task`)與 `task_index`(來自 `row.index`),同一權威的原像投影;digest basis 隨之變化,`FLEET_BOARD_PROTOCOL` bump 為 2。
- composer 只在 detail pane 底部、默認收合;fence 即確認(claim/generation 併置,changed_during_read/stale/degraded 時禁發);`access_mode: 'read_only'` 為一等閘門;untrusted 語義文案;位元組計數(8 KiB);客戶端 message_id 冪等;delivery 回饋走權威 unread_count 迴路,不持久化本地已送出清單。
- server:`POST /api/v1/fleet/tasks/{repository_id}/{task_id}/messages`;POST 的 Origin 強制必填(GET 維持現狀);HTTP 層鏡像 body 上限;repository_id 經 registry 解析 + read_write 檢查。
- footer 契約修訂:`read-only / localhost` → `observe-only · one write: task message`;負向測試升級為「恰好一個寫入」。
- accent 色紀律:橙只表示人類寫入;attention 語義色修正(user=琥珀、agent=中性藍、external=紫、danger 只留給真錯誤)。
- i18n(2026-08-29 用戶追加):中英雙語。單一字典模組 `src/operator-web/i18n.ts`,不引第三方庫;語言切換在常駐狀態列,選擇存 localStorage(讀寫皆 try/catch),初始值跟 `navigator.language`;默認 locale 為 en,測試斷言錨定 en 字串;blocker code 人話翻譯兩語都要並旁附原碼;task_label、repo 名、id/SHA、blocker code 原碼不譯。

## Task Breakdown

- [x] WP-A 契約投影:`src/core/fleet/board.ts` 增 `task_label`/`task_index` 進 `FleetBoardCardV1` 與 input,`FLEET_BOARD_PROTOCOL` → 2;`src/effects/fleet/board.ts` 投影 `row.task`/`row.index`;operator types 同步解碼;更新 board 相關測試(commit 276292a6)
- [ ] WP-B UI 重建:`src/operator-web/` 按凍結決策重寫 App.tsx/styles.css(worklist + pane + 狀態列 + zh/en i18n),渲染 task_label/no_progress/repair_actions/blockers(per-blocker owner + 人話翻譯),修正 attention 語義色與對比度(≥4.5:1 文字、≥3:1 非文字),字級下限 11px;逐條修訂 tests/operator-web/*.test.tsx 的 UX 契約斷言
- [ ] WP-C 訊息通道:`src/effects/operator/server.ts` 新增 POST endpoint(Origin 必填 + registry 解析 + read_write 閘門 + 8 KiB 鏡像),`sender_kind: 'operator'`;composer UI 按凍結決策;負向測試升級為「恰好一個寫入」不變式

## Oracles

- `bun test --timeout 60000` 全綠(operator-web、board-projection、fleet board、task-inbox 相關測試面)
- `node node_modules/typescript/bin/tsc --noEmit` 無錯
- `bun run build:operator-web` 成功
- fixture 驗證:以真實形態 fixture(64-hex task_id + task_label)在瀏覽器實跑,截圖確認 worklist 分組排序、cause 行、composer fence 禁發條件(runtime 檢查,不以編譯通過代替)
- `repo-harness run check-task-workflow --strict` 通過

## Verification Boundary

UI 行為以瀏覽器實跑 + 測試斷言雙面驗證;契約變更以 board-projection/snapshot digest 測試驗證;POST 安全姿態以 server 測試(Origin 缺失 403、read_only 拒收、超限拒收)驗證。

## Rollback Surface

單一 feature branch(codex/operator-board-redesign);protocol bump 與 UI 重建同 branch 原子落地,revert 該 merge 即完整回退。無資料遷移、無持久狀態。

## Annotations
<!-- [NOTE]: prefixed inline. Claude processes all and revises. -->
<!-- 2026-08-29: 去重了模板追加的第二份 Task Breakdown;唯一權威是上方 ## Task Breakdown。 -->
<!-- 2026-08-29: 用戶追加 zh/en i18n 需求,已凍結進 Decisions;WP-B 範圍隨之擴大。 -->
