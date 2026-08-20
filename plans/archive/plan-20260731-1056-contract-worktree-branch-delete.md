# Plan: Align cleanup branch deletion with the absorption predicate

> **Status**: Archived
> **Created**: 20260731-1056
> **Slug**: contract-worktree-branch-delete
> **Planning Source**: codex-plan-or-waza-think
> **Orchestration Kind**: host-plan
> **Source Ref**: (none)
> **Artifact Level**: work-package
> **Promotion Reason**: merge_boundary
> **Verification Boundary**: Commands named in the captured planning output plus `repo-harness run verify-contract --contract tasks/contracts/20260731-1056-contract-worktree-branch-delete.contract.md --strict`.
> **Rollback Surface**: Before execution remove `plans/plan-20260731-1056-contract-worktree-branch-delete.md`; after execution revert branch `codex/contract-worktree-branch-delete` or the explicitly reviewed diff.
> **Spec**: `docs/spec.md`
> **Research**: See `docs/researches/`
> **Task Contract**: `tasks/contracts/20260731-1056-contract-worktree-branch-delete.contract.md`
> **Task Review**: `tasks/reviews/20260731-1056-contract-worktree-branch-delete.review.md`
> **Implementation Notes**: `tasks/notes/20260731-1056-contract-worktree-branch-delete.notes.md`

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

- Active plan: `plans/plan-20260731-1056-contract-worktree-branch-delete.md`
- Sprint contract: `tasks/contracts/20260731-1056-contract-worktree-branch-delete.contract.md`
- Sprint review: `tasks/reviews/20260731-1056-contract-worktree-branch-delete.review.md`
- Implementation notes: `tasks/notes/20260731-1056-contract-worktree-branch-delete.notes.md`
- Deferred-goal ledger: `tasks/todos.md`
- Current checks: `.ai/harness/checks/latest.json`
- Run snapshots: `.ai/harness/runs/`
- Scope authority: `tasks/contracts/20260731-1056-contract-worktree-branch-delete.contract.md` `allowed_paths`
- Concurrency rule: `.ai/harness/active-plan` selects the active plan for this worktree when present; `.ai/harness/active-worktree` records the owning worktree. If another worktree already owns active work, open or switch to the matching worktree instead of serializing unrelated plans.
- Execution isolation: approved contract-level work projects through `repo-harness run plan-to-todo --plan plans/plan-20260731-1056-contract-worktree-branch-delete.md` and may start `repo-harness run contract-worktree start --plan plans/plan-20260731-1056-contract-worktree-branch-delete.md`.

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
- Contract file: `tasks/contracts/20260731-1056-contract-worktree-branch-delete.contract.md`
- Review file: `tasks/reviews/20260731-1056-contract-worktree-branch-delete.review.md`
- Implementation notes file: `tasks/notes/20260731-1056-contract-worktree-branch-delete.notes.md`
- Template: `.claude/templates/contract.template.md`
- Verification command: `repo-harness run verify-contract --contract tasks/contracts/20260731-1056-contract-worktree-branch-delete.contract.md --strict`
- Active plan rule: this captured plan is written to `.ai/harness/active-plan` and the owning worktree is written to `.ai/harness/active-worktree` unless --no-active is used. Do not infer active execution from the latest non-archived plan.

## Handoff

- Checks file: `.ai/harness/checks/latest.json`
- Session handoff: `.ai/harness/handoff/current.md`

## Promotion Gate

- **Merge/PR unit**: Captured plan `plans/plan-20260731-1056-contract-worktree-branch-delete.md` is the proposed mergeable execution unit; revise before execute if this is only a checklist step.
- **Rollback surface**: Before execution remove `plans/plan-20260731-1056-contract-worktree-branch-delete.md`; after execution revert branch `codex/contract-worktree-branch-delete` or the explicitly reviewed diff.
- **Verification boundary**: Commands named in the captured planning output plus `repo-harness run verify-contract --contract tasks/contracts/20260731-1056-contract-worktree-branch-delete.contract.md --strict`.
- **Review/acceptance boundary**: `tasks/reviews/20260731-1056-contract-worktree-branch-delete.review.md` must record pass against the captured acceptance criteria.
- **High-risk surface**: Risks named in captured planning output; keep the plan Draft if risk ownership is not concrete.
- **Why not checklist row**: merge_boundary

## Evidence Contract

- **State/progress path**: `plans/plan-20260731-1056-contract-worktree-branch-delete.md` task breakdown, `tasks/todos.md` deferred-goal ledger, `tasks/contracts/20260731-1056-contract-worktree-branch-delete.contract.md`, `tasks/reviews/20260731-1056-contract-worktree-branch-delete.review.md`, and `tasks/notes/20260731-1056-contract-worktree-branch-delete.notes.md`
- **Verification evidence**: `.ai/harness/checks/latest.json`, `.ai/harness/runs/`, and the commands named in the captured planning output
- **Evaluator rubric**: `tasks/reviews/20260731-1056-contract-worktree-branch-delete.review.md` must record a passing Waza /check style recommendation
- **Stop condition**: all task breakdown items are complete, sprint verification passes, and the review recommends pass
- **Rollback surface**: Before execution remove `plans/plan-20260731-1056-contract-worktree-branch-delete.md`; after execution revert branch `codex/contract-worktree-branch-delete` or the explicitly reviewed diff.

## Captured Planning Output

# contract-worktree cleanup 的分支刪除與吸收判定對齊(contract-worktree.sh:1091)

## Context

#142 讓 cleanup 的 merge 閘認得 squash 吸收(`absorbed`),但後續刪分支仍是 `git branch -d`——git 自己的 ancestry 安全刪除,對 squash 吸收的分支照樣拒絕。2026-07-31 closeout 實證:三個 absorbed 的包(receipt-fingerprint-normalization、reference-configs-projection、contract-worktree-squash-cleanup)cleanup 都半途而廢——worktree 與 metadata 刪了、分支報 `error: the branch '…' is not fully merged` 留下,退出碼非零,要人工 `git branch -D` 收尾。每個 squash 包都會重演,`-D` 變習慣動作反而蛀空安全閘。

## 凍結設計

merge 閘(#142 加入的雙判定段,`scripts/contract-worktree.sh:1029-1053`)已經知道命中哪個判定。把該結果(如 `absorbed=1` 旗標)傳遞到 `:1091` 的刪除步:

- 命中 `absorbed` → `git branch -D`(安全依據:吸收判定剛證明該分支對 main 零增量,git 的 ancestry 檢查在此必然誤報)。
- 命中 `ancestor` → 照舊 `git branch -d`(git 自身檢查有效,保留雙保險)。
- 分支不存在本地 → 照舊跳過。
- 閘拒絕的分支根本到不了刪除步,fail-closed 語意不變。

刪除成功訊息可註明用了哪個模式(對齊 #142 的判定日誌風格)。

## 修復面

- `scripts/contract-worktree.sh`:merge 閘旗標傳遞 + `:1091` 刪除分支(唯一生產改動)。
- 鏡像 `assets/templates/helpers/contract-worktree.sh`:`bun run sync:helpers` 重生,不手改。

## 步驟(TDD:RED → GREEN)

1. **RED**:擴充 #142 的 guard `tests/contract-worktree-squash-cleanup.test.ts`——正向 case 從「dry-run 通過」升級為「**實跑 cleanup 一次清淨**」:squash 合入的分支跑 `cleanup --slug <slug>`(非 dry-run),斷言 worktree 目錄消失 + metadata 消失 + **分支消失** + 退出碼 0。未修碼上此斷言組必紅(分支殘留、exit 非 0)。既有負向對照(未合併分支在閘就被拒)保留不動。另加一個 ancestor case:普通 merge(非 squash)合入的分支,cleanup 後分支同樣消失(走 `-d` 路徑,證明未破壞既有雙保險)。
   capture:`bun test tests/contract-worktree-squash-cleanup.test.ts > tasks/notes/20260731-branch-delete.pre-fix.log 2>&1; s=$?; echo "PRE_FIX_EXIT=$s" >> 同檔`,確認 `PRE_FIX_EXIT=1`。commit。
2. **GREEN**:實作旗標傳遞與條件刪除;guard 全綠;`bun run sync:helpers` + `bun run check:helpers`。
3. **驗證**:guard 單檔、`bun test` 全量(log 檔形式)、`bun run check:type`、`bun run check:helpers`。
4. notes 記:`-D` 的安全論證(吸收判定為前置)、ancestor 路徑保留 `-d` 的理由(雙保險)。RED/GREEN 分 commit,push。

## 明確不做(EXECUTION_BOUNDARY)

- 不動 merge 閘判定邏輯本身(#142 的段落只加旗標導出,不改判定)。
- 不動 start/finish/status、其他安全檢查、其他 helper。
- 不清理任何真實 worktree(本輪 closeout 已完成,無現存對象)。

## Annotations
<!-- [NOTE]: prefixed inline. Claude processes all and revises. -->

## Task Breakdown
- [ ] Execute captured plan: Align cleanup branch deletion with the absorption predicate
