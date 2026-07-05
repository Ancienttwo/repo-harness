# Plan: Review rubric: Scope fidelity dimension with P1 escalation carve-out

> **Status**: Executing
> **Created**: 20260705-2027
> **Slug**: review-scope-fidelity
> **Planning Source**: waza-think
> **Orchestration Kind**: host-plan
> **Source Ref**: WP3 from intent-mismatch analysis 2026-07-05; D2 diagnosis; re-created after worktree swept by parallel session-stop cleanup 20:23
> **Artifact Level**: work-package
> **Promotion Reason**: merge_boundary
> **Verification Boundary**: bun test (hook suites standalone + full) + check-task-workflow --strict + migrate --dry-run + rg sweeps for rubric version consumers
> **Rollback Surface**: Revert branch codex/review-scope-fidelity; no data migration.
> **Spec**: `docs/spec.md`
> **Research**: See `docs/researches/`
> **Task Contract**: `tasks/contracts/20260705-2027-review-scope-fidelity.contract.md`
> **Task Review**: `tasks/reviews/20260705-2027-review-scope-fidelity.review.md`
> **Implementation Notes**: `tasks/notes/20260705-2027-review-scope-fidelity.notes.md`

## Agentic Routing
- Selected route: planning
- Routing reason: Captured from waza-think planning output.
- Source ref: WP3 from intent-mismatch analysis 2026-07-05; D2 diagnosis; re-created after worktree swept by parallel session-stop cleanup 20:23
- Due diligence:
  - P1 map: See captured planning output below.
  - P2 trace: See captured planning output below.
  - P3 decision rationale: See captured planning output below.

## Workflow Inventory
Complete this inventory before implementation. If any line is unknown, keep the plan in Draft and fill it before projection.

- Active plan: `plans/plan-20260705-2027-review-scope-fidelity.md`
- Sprint contract: `tasks/contracts/20260705-2027-review-scope-fidelity.contract.md`
- Sprint review: `tasks/reviews/20260705-2027-review-scope-fidelity.review.md`
- Implementation notes: `tasks/notes/20260705-2027-review-scope-fidelity.notes.md`
- Deferred-goal ledger: `tasks/todos.md`
- Current checks: `.ai/harness/checks/latest.json`
- Run snapshots: `.ai/harness/runs/`
- Scope authority: `tasks/contracts/20260705-2027-review-scope-fidelity.contract.md` `allowed_paths`
- Concurrency rule: `.ai/harness/active-plan` selects the active plan for this worktree when present; `.ai/harness/active-worktree` records the owning worktree; `.claude/.active-plan` is a legacy fallback during transition. If another worktree already owns active work, open or switch to the matching worktree instead of serializing unrelated plans.
- Execution isolation: approved contract-level work projects through `repo-harness run plan-to-todo --plan plans/plan-20260705-2027-review-scope-fidelity.md` and may start `repo-harness run contract-worktree start --plan plans/plan-20260705-2027-review-scope-fidelity.md`.

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
- Contract file: `tasks/contracts/20260705-2027-review-scope-fidelity.contract.md`
- Review file: `tasks/reviews/20260705-2027-review-scope-fidelity.review.md`
- Implementation notes file: `tasks/notes/20260705-2027-review-scope-fidelity.notes.md`
- Template: `.claude/templates/contract.template.md`
- Verification command: `repo-harness run verify-contract --contract tasks/contracts/20260705-2027-review-scope-fidelity.contract.md --strict`
- Active plan rule: this captured plan is written to `.ai/harness/active-plan`, the owning worktree is written to `.ai/harness/active-worktree`, and the plan is mirrored to `.claude/.active-plan` unless --no-active is used. Do not infer active execution from the latest non-archived plan.

## Handoff

- Checks file: `.ai/harness/checks/latest.json`
- Session handoff: `.ai/harness/handoff/current.md`

## Promotion Gate

- **Merge/PR unit**: Captured plan `plans/plan-20260705-2027-review-scope-fidelity.md` is the proposed mergeable execution unit; revise before execute if this is only a checklist step.
- **Rollback surface**: Revert branch codex/review-scope-fidelity; no data migration.
- **Verification boundary**: bun test (hook suites standalone + full) + check-task-workflow --strict + migrate --dry-run + rg sweeps for rubric version consumers
- **Review/acceptance boundary**: `tasks/reviews/20260705-2027-review-scope-fidelity.review.md` must record pass against the captured acceptance criteria.
- **High-risk surface**: Risks named in captured planning output; keep the plan Draft if risk ownership is not concrete.
- **Why not checklist row**: merge_boundary

## Evidence Contract

- **State/progress path**: `plans/plan-20260705-2027-review-scope-fidelity.md` task breakdown, `tasks/todos.md` deferred-goal ledger, `tasks/contracts/20260705-2027-review-scope-fidelity.contract.md`, `tasks/reviews/20260705-2027-review-scope-fidelity.review.md`, and `tasks/notes/20260705-2027-review-scope-fidelity.notes.md`
- **Verification evidence**: `.ai/harness/checks/latest.json`, `.ai/harness/runs/`, and the commands named in the captured planning output
- **Evaluator rubric**: `tasks/reviews/20260705-2027-review-scope-fidelity.review.md` must record a passing Waza /check style recommendation
- **Stop condition**: all task breakdown items are complete, sprint verification passes, and the review recommends pass
- **Rollback surface**: Revert branch codex/review-scope-fidelity; no data migration.

## Captured Planning Output

## Context

原始診斷 D2(2026-07-05 三路分析):overreach 在 review 體系裡結構上不可 block——rubric 第 8 維(minimal-change/YAGNI)被規則行明文封頂「never upgrade it to P0/P1 by itself」(`src/cli/hook/review-rubric.ts`),verifier 被指示只對 exit_criteria 審,scorecard 又獎勵 Product depth。WP1+WP2 已合併 main(`a409656`):負向邊界(Out of scope)現在機械到達 runner,EXECUTION_BOUNDARY 已是 root 契約規則。本 plan(WP3)補最後一環:讓 reviewer 有權把 scope 違規升到可 block 的等級。

Rubric 是雙面槓桿:同一段文字由 hook 注入本地 /check 與 Codex external acceptance 的 prompt,改一處、兩個 reviewer 同時生效。

## Scope / Non-scope

In scope:
- `src/cli/hook/review-rubric.ts`:
  - `REVIEW_DIMENSIONS` 加第 9 維:`Scope fidelity: changes outside the contract In-scope, touching declared Out-of-scope/Non-Goals, or unrequested features/options/commentary`。
  - 規則行加豁免:scope-fidelity violation(觸及聲明的 Out-of-scope/Non-Goals、或無授權的新功能/選項/加戲)**可升 P1**;一般 minimal-change/YAGNI 維持「never P0/P1 by itself」不變。
  - Rubric 版本 1 → 2,並以 `rg -n "Rubric Version|rubric.*v1|REVIEW_RUBRIC"` 全倉掃描,一致更新所有 emitter/模板/測試/文檔消費點(review 檔 frontmatter 記錄的 `Review Rubric Version` 期望值、hook 輸出斷言、reference-configs 若有記載)。
- 測試:`tests/cli/hook.test.ts`(或 rubric 所屬測試檔)斷言第 9 維文字出現在注入輸出、版本號為 2、豁免句與封頂句並存且指向明確。
- 若 rubric 文字在 assets/ 或 helper 有鏡像副本,同步並保 parity。

Non-scope:
- `verify-contract.sh`/`verify-sprint.sh` 的 changed-files vs allowed_paths 機器報告餵入 Human Review Card「Intended vs Actual」(獨立後續小刀,rubric 第 9 維已指示 reviewer 人工核對)。
- Scorecard 維度調整(Product depth 保留)。
- 任何 hook 觸發/路由邏輯變更(只改 rubric 文字與版本)。
- WP4(intake)、WP5(frontend profile)。

## Approach

### Strategy
最小改動:一個維度、一句豁免、一次版本 bump、消費點一致化。豁免措辭必須把「可升級」嚴格限定在 scope-fidelity 一類,避免 YAGNI 全面升級把 review 淹進假 blocker——原封頂句保留原文,豁免作為其後的限定補句。

### Trade-offs
| Option | Pros | Cons | Decision |
|--------|------|------|----------|
| 第 9 維 + 豁免補句(本案) | reviewer 獲得 block 權;雙 reviewer 同時生效;改動極小 | 版本 bump 需掃全部消費點 | 採用 |
| 把封頂句整句刪除 | 更簡單 | YAGNI 假 blocker 淹沒 review(原診斷明確反對) | 拒絕 |
| 只在 external acceptance prompt 加、不動 rubric | 不碰版本 | 兩個 reviewer 標準分裂 | 拒絕 |

## Detailed Design

### File Changes
| File | Action | Description |
|------|--------|-------------|
| `src/cli/hook/review-rubric.ts` | modify | 第 9 維 + 豁免補句 + 版本 2 |
| 版本/文字消費點(rg 掃描結果為準) | modify | 一致更新 |
| `tests/cli/hook.test.ts` 等 | modify | 斷言新維度、版本、豁免句 |

### 豁免句(規則行追加,原句保留)
> Exception: a Scope fidelity violation — changes touching declared Out-of-scope/Non-Goals items or adding unrequested features, options, or commentary — may be rated up to P1.

## Risk Assessment
| Risk | Likelihood | Impact | Mitigation |
|------|------------|--------|------------|
| 版本字串消費點散落,漏改導致斷言/凍結檢查紅 | 中 | 中 | rg 全倉掃描(含 `rg -uu` 檔案審計);全量 bun test |
| 豁免措辭被理解為 YAGNI 全面升級 | 低 | 中 | 豁免句顯式限定於列舉的 violation 類型;測試斷言兩句並存 |

## Promotion Gate
- **Merge/PR unit**: 是,單一 PR to main。
- **Rollback surface**: revert branch `codex/review-scope-fidelity`;無資料遷移。
- **Verification boundary**: `bun test`(hook 相關測試單檔 + 全量;`hook-runtime`/`skill-hooks` 已知 combined-run-fragile,必要時單檔覆核)+ `bash scripts/check-task-workflow.sh --strict` + `bash scripts/migrate-project-template.sh --repo . --dry-run`。
- **Review/acceptance boundary**: review 檔 recommend pass(merge 時)。
- **High-risk surface**: rubric 文字同時餵兩個 reviewer;版本一致性。
- **Why not checklist row**: merge_boundary——獨立回退面與驗證面,觸及 review 契約(雙 reviewer 共用)。

## Evidence Contract
- **State/progress path**: 本 plan `## Task Breakdown` + `tasks/contracts/<stem>.contract.md`。
- **Verification evidence**: 上列命令輸出。
- **Evaluator rubric**: contract exit_criteria 通過。
- **Stop condition**: Task Breakdown 全勾 + 驗證綠。
- **Rollback surface**: revert 分支;無資料遷移。

## Task Breakdown
- [x] `review-rubric.ts`:第 9 維 + 豁免補句 + 版本 2
- [x] rg 全倉掃描版本/文字消費點並一致更新(含 assets/helper 鏡像若存在)
- [x] 測試:新維度注入斷言、版本 2、封頂句與豁免句並存
- [x] 驗證:hook 測試單檔 + `bun test` 全量 + `check-task-workflow --strict` + `migrate --dry-run`

## Verification
```bash
bun test tests/cli/hook.test.ts
bun test
bash scripts/check-task-workflow.sh --strict
bash scripts/migrate-project-template.sh --repo . --dry-run
rg -n "Scope fidelity" src/ assets/ tests/
rg -n "Rubric Version" --no-ignore
```

## Annotations
<!-- [NOTE]: prefixed inline. Claude processes all and revises. -->

## Task Breakdown
- [x] `review-rubric.ts`:第 9 維 + 豁免補句 + 版本 2
- [x] rg 全倉掃描版本/文字消費點並一致更新(含 assets/helper 鏡像若存在)
- [x] 測試:新維度注入斷言、版本 2、封頂句與豁免句並存
- [x] 驗證:hook 測試單檔 + `bun test` 全量 + `check-task-workflow --strict` + `migrate --dry-run`
