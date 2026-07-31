# Plan: Support squash-merge merged-detection in contract-worktree cleanup

> **Status**: Executing
> **Created**: 20260731-0952
> **Slug**: contract-worktree-squash-cleanup
> **Planning Source**: codex-plan-or-waza-think
> **Orchestration Kind**: host-plan
> **Source Ref**: (none)
> **Artifact Level**: work-package
> **Promotion Reason**: merge_boundary
> **Verification Boundary**: Commands named in the captured planning output plus `repo-harness run verify-contract --contract tasks/contracts/20260731-0952-contract-worktree-squash-cleanup.contract.md --strict`.
> **Rollback Surface**: Before execution remove `plans/plan-20260731-0952-contract-worktree-squash-cleanup.md`; after execution revert branch `codex/contract-worktree-squash-cleanup` or the explicitly reviewed diff.
> **Spec**: `docs/spec.md`
> **Research**: See `docs/researches/`
> **Task Contract**: `tasks/contracts/20260731-0952-contract-worktree-squash-cleanup.contract.md`
> **Task Review**: `tasks/reviews/20260731-0952-contract-worktree-squash-cleanup.review.md`
> **Implementation Notes**: `tasks/notes/20260731-0952-contract-worktree-squash-cleanup.notes.md`

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

- Active plan: `plans/plan-20260731-0952-contract-worktree-squash-cleanup.md`
- Sprint contract: `tasks/contracts/20260731-0952-contract-worktree-squash-cleanup.contract.md`
- Sprint review: `tasks/reviews/20260731-0952-contract-worktree-squash-cleanup.review.md`
- Implementation notes: `tasks/notes/20260731-0952-contract-worktree-squash-cleanup.notes.md`
- Deferred-goal ledger: `tasks/todos.md`
- Current checks: `.ai/harness/checks/latest.json`
- Run snapshots: `.ai/harness/runs/`
- Scope authority: `tasks/contracts/20260731-0952-contract-worktree-squash-cleanup.contract.md` `allowed_paths`
- Concurrency rule: `.ai/harness/active-plan` selects the active plan for this worktree when present; `.ai/harness/active-worktree` records the owning worktree. If another worktree already owns active work, open or switch to the matching worktree instead of serializing unrelated plans.
- Execution isolation: approved contract-level work projects through `repo-harness run plan-to-todo --plan plans/plan-20260731-0952-contract-worktree-squash-cleanup.md` and may start `repo-harness run contract-worktree start --plan plans/plan-20260731-0952-contract-worktree-squash-cleanup.md`.

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
- Contract file: `tasks/contracts/20260731-0952-contract-worktree-squash-cleanup.contract.md`
- Review file: `tasks/reviews/20260731-0952-contract-worktree-squash-cleanup.review.md`
- Implementation notes file: `tasks/notes/20260731-0952-contract-worktree-squash-cleanup.notes.md`
- Template: `.claude/templates/contract.template.md`
- Verification command: `repo-harness run verify-contract --contract tasks/contracts/20260731-0952-contract-worktree-squash-cleanup.contract.md --strict`
- Active plan rule: this captured plan is written to `.ai/harness/active-plan` and the owning worktree is written to `.ai/harness/active-worktree` unless --no-active is used. Do not infer active execution from the latest non-archived plan.

## Handoff

- Checks file: `.ai/harness/checks/latest.json`
- Session handoff: `.ai/harness/handoff/current.md`

## Promotion Gate

- **Merge/PR unit**: Captured plan `plans/plan-20260731-0952-contract-worktree-squash-cleanup.md` is the proposed mergeable execution unit; revise before execute if this is only a checklist step.
- **Rollback surface**: Before execution remove `plans/plan-20260731-0952-contract-worktree-squash-cleanup.md`; after execution revert branch `codex/contract-worktree-squash-cleanup` or the explicitly reviewed diff.
- **Verification boundary**: Commands named in the captured planning output plus `repo-harness run verify-contract --contract tasks/contracts/20260731-0952-contract-worktree-squash-cleanup.contract.md --strict`.
- **Review/acceptance boundary**: `tasks/reviews/20260731-0952-contract-worktree-squash-cleanup.review.md` must record pass against the captured acceptance criteria.
- **High-risk surface**: Risks named in captured planning output; keep the plan Draft if risk ownership is not concrete.
- **Why not checklist row**: merge_boundary

## Evidence Contract

- **State/progress path**: `plans/plan-20260731-0952-contract-worktree-squash-cleanup.md` task breakdown, `tasks/todos.md` deferred-goal ledger, `tasks/contracts/20260731-0952-contract-worktree-squash-cleanup.contract.md`, `tasks/reviews/20260731-0952-contract-worktree-squash-cleanup.review.md`, and `tasks/notes/20260731-0952-contract-worktree-squash-cleanup.notes.md`
- **Verification evidence**: `.ai/harness/checks/latest.json`, `.ai/harness/runs/`, and the commands named in the captured planning output
- **Evaluator rubric**: `tasks/reviews/20260731-0952-contract-worktree-squash-cleanup.review.md` must record a passing Waza /check style recommendation
- **Stop condition**: all task breakdown items are complete, sprint verification passes, and the review recommends pass
- **Rollback surface**: Before execution remove `plans/plan-20260731-0952-contract-worktree-squash-cleanup.md`; after execution revert branch `codex/contract-worktree-squash-cleanup` or the explicitly reviewed diff.

## Captured Planning Output

# contract-worktree cleanup 支援 squash-merge 的已合併判定

## Context

本 repo 的既定 ship 方式是 squash merge(#134 起一路如此,本輪 #138–#141 四包皆是)。squash 後分支 commit 不是 main 的祖先,`contract-worktree cleanup` 的安全檢查用純 ancestry 判定「fully merged」,於是對每個已完整合入的分支都拒絕清理(2026-07-31 實證:四個 worktree 的 `cleanup --dry-run` 全部拒絕,逐檔核過內容全在 main)。兩者結構性互斥,安全閘長期失效,只能靠人工 `git worktree remove` 繞過。

## 凍結設計:雙判定,fail-closed

`scripts/contract-worktree.sh` cleanup 分支的 merged 判定改為兩級:

1. **快路(保留)**:ancestry——分支 tip 是 target(main)祖先 → merged。
2. **吸收判定(新增)**:`git merge-tree --write-tree <target> <branch>` 成功(無衝突)且輸出 tree OID == `git rev-parse <target>^{tree}` → 分支內容已被 target 完整吸收(squash 或等效),視為 merged。
3. 其餘一律照舊拒絕(merge-tree 衝突、tree 不相等、指令失敗都算未合併)——fail-closed 不放寬。

拒絕/通過訊息註明命中哪個判定(`ancestor` / `absorbed` / 拒絕原因),dry-run 行為不變(通過判定後列出待刪項)。

被否決的替代方案(記 notes):`git cherry` 按 patch-id 逐 commit 比對——多 commit squash 成單一 commit 後 patch-id 對不上,誤判未合併;`git diff target...branch` 是 merge-base 到 tip 的 diff,squash 後恆非空,不能證明已吸收。

## 修復面

- `scripts/contract-worktree.sh`:cleanup 分支的「not fully merged into main」判定段(唯一生產改動)。
- 鏡像 `assets/templates/helpers/contract-worktree.sh`:`bun run sync:helpers` 重生(不手改)。

## 步驟(TDD:RED → GREEN)

1. **落點勘察**:先找 contract-worktree cleanup 的既有測試位置(可能在 `tests/helper-scripts.test.ts` 的 contract-worktree 段)。guard 落新檔 `tests/contract-worktree-squash-cleanup.test.ts`(targeted RED capture 需要便宜的單檔跑;fixture 模式照 helper-scripts.test.ts 既有的 tmpWorkspace + copyHelpers 慣例)。
2. **RED**:guard 兩個 test——
   - 正向:fixture repo 開 codex/<slug> 分支改一檔,squash merge 回 main(`git merge --squash` + commit),`cleanup --slug <slug> --dry-run` 必須**通過判定並列出待刪項**(未修碼上 fail)。
   - 負向(fail-closed 對照,未修碼上就綠、修後必須仍綠):分支上有一個未進 main 的額外 commit → dry-run 必須仍拒絕。
   capture:`bun test tests/contract-worktree-squash-cleanup.test.ts > tasks/notes/20260731-worktree-squash-cleanup.pre-fix.log 2>&1; s=$?; echo "PRE_FIX_EXIT=$s" >> 同檔`,確認 `PRE_FIX_EXIT=1`。commit。
3. **GREEN**:改判定段,guard 全綠;`bun run sync:helpers` + `bun run check:helpers`。
4. **驗證**:
   - guard 單檔、`bun test` 全量(log 檔形式)、`bun run check:type`、`bun run check:helpers`
   - **實地 smoke(唯讀)**:用本 worktree 修好的腳本對現存四個已 ship worktree 跑 `cleanup --slug <slug> --dry-run`,四個都應從拒絕轉為列出待刪項(**只 dry-run,不實刪**——實刪等本包 merge 後由調度統一執行);輸出貼回報。
5. notes 記:否決方案、雙判定語義、實地 smoke 結果。RED/GREEN 分 commit,push。

## 明確不做(EXECUTION_BOUNDARY)

- 不實際刪除任何現存 worktree(smoke 只 dry-run)。
- 不動 contract-worktree 的 start/finish/status 分支、不動 merge-gate、不動其他 helper。
- 不改 cleanup 的其餘安全檢查(未提交改動、未推送 commit 等既有防護原樣保留)。

## Annotations
<!-- [NOTE]: prefixed inline. Claude processes all and revises. -->

## Task Breakdown
- [ ] Execute captured plan: Support squash-merge merged-detection in contract-worktree cleanup
