# Plan: Frontend Task Profile: design-brief gate via closed enum extension

> **Status**: Archived
> **Created**: 20260706-0140
> **Slug**: frontend-task-profile
> **Planning Source**: waza-think
> **Orchestration Kind**: host-plan
> **Source Ref**: WP5 from intent-mismatch analysis 2026-07-05; Jackywxsz DESIGN.md flow adaptation
> **Artifact Level**: work-package
> **Promotion Reason**: merge_boundary
> **Verification Boundary**: bun test + check-task-workflow --strict + migrate --dry-run + parity diffs + manual verify-contract probes (frontend with/without design brief)
> **Rollback Surface**: Revert branch codex/frontend-task-profile; no data migration.
> **Spec**: `docs/spec.md`
> **Research**: See `docs/researches/`
> **Task Contract**: `tasks/contracts/20260706-0140-frontend-task-profile.contract.md`
> **Task Review**: `tasks/reviews/20260706-0140-frontend-task-profile.review.md`
> **Implementation Notes**: `tasks/notes/20260706-0140-frontend-task-profile.notes.md`

## Agentic Routing
- Selected route: planning
- Routing reason: Captured from waza-think planning output.
- Source ref: WP5 from intent-mismatch analysis 2026-07-05; Jackywxsz DESIGN.md flow adaptation
- Due diligence:
  - P1 map: See captured planning output below.
  - P2 trace: See captured planning output below.
  - P3 decision rationale: See captured planning output below.

## Workflow Inventory
Complete this inventory before implementation. If any line is unknown, keep the plan in Draft and fill it before projection.

- Active plan: `plans/plan-20260706-0140-frontend-task-profile.md`
- Sprint contract: `tasks/contracts/20260706-0140-frontend-task-profile.contract.md`
- Sprint review: `tasks/reviews/20260706-0140-frontend-task-profile.review.md`
- Implementation notes: `tasks/notes/20260706-0140-frontend-task-profile.notes.md`
- Deferred-goal ledger: `tasks/todos.md`
- Current checks: `.ai/harness/checks/latest.json`
- Run snapshots: `.ai/harness/runs/`
- Scope authority: `tasks/contracts/20260706-0140-frontend-task-profile.contract.md` `allowed_paths`
- Concurrency rule: `.ai/harness/active-plan` selects the active plan for this worktree when present; `.ai/harness/active-worktree` records the owning worktree; `.claude/.active-plan` is a legacy fallback during transition. If another worktree already owns active work, open or switch to the matching worktree instead of serializing unrelated plans.
- Execution isolation: approved contract-level work projects through `repo-harness run plan-to-todo --plan plans/plan-20260706-0140-frontend-task-profile.md` and may start `repo-harness run contract-worktree start --plan plans/plan-20260706-0140-frontend-task-profile.md`.

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
- Contract file: `tasks/contracts/20260706-0140-frontend-task-profile.contract.md`
- Review file: `tasks/reviews/20260706-0140-frontend-task-profile.review.md`
- Implementation notes file: `tasks/notes/20260706-0140-frontend-task-profile.notes.md`
- Template: `.claude/templates/contract.template.md`
- Verification command: `repo-harness run verify-contract --contract tasks/contracts/20260706-0140-frontend-task-profile.contract.md --strict`
- Active plan rule: this captured plan is written to `.ai/harness/active-plan`, the owning worktree is written to `.ai/harness/active-worktree`, and the plan is mirrored to `.claude/.active-plan` unless --no-active is used. Do not infer active execution from the latest non-archived plan.

## Handoff

- Checks file: `.ai/harness/checks/latest.json`
- Session handoff: `.ai/harness/handoff/current.md`

## Promotion Gate

- **Merge/PR unit**: Captured plan `plans/plan-20260706-0140-frontend-task-profile.md` is the proposed mergeable execution unit; revise before execute if this is only a checklist step.
- **Rollback surface**: Revert branch codex/frontend-task-profile; no data migration.
- **Verification boundary**: bun test + check-task-workflow --strict + migrate --dry-run + parity diffs + manual verify-contract probes (frontend with/without design brief)
- **Review/acceptance boundary**: `tasks/reviews/20260706-0140-frontend-task-profile.review.md` must record pass against the captured acceptance criteria.
- **High-risk surface**: Risks named in captured planning output; keep the plan Draft if risk ownership is not concrete.
- **Why not checklist row**: merge_boundary

## Evidence Contract

- **State/progress path**: `plans/plan-20260706-0140-frontend-task-profile.md` task breakdown, `tasks/todos.md` deferred-goal ledger, `tasks/contracts/20260706-0140-frontend-task-profile.contract.md`, `tasks/reviews/20260706-0140-frontend-task-profile.review.md`, and `tasks/notes/20260706-0140-frontend-task-profile.notes.md`
- **Verification evidence**: `.ai/harness/checks/latest.json`, `.ai/harness/runs/`, and the commands named in the captured planning output
- **Evaluator rubric**: `tasks/reviews/20260706-0140-frontend-task-profile.review.md` must record a passing Waza /check style recommendation
- **Stop condition**: all task breakdown items are complete, sprint verification passes, and the review recommends pass
- **Rollback surface**: Revert branch codex/frontend-task-profile; no data migration.

## Captured Planning Output

## Context

回答「要不要開一個 profile 專門應付 Codex 前端」(2026-07-05):結論是開,落點用既有的 Task Profile 封閉 enum + profile 條件約束模式(HE-04 先例;`verify-contract.sh:526-553` 已有 docs-only/eval-only/ledger-closeout 的條件 case)。@Jackywxsz 的「先 DESIGN.md、後寫碼、五條標準人工確認」流程作為 skill 側慣例掛載;harness 只做兩件機器事:enum 認得 `frontend`,frontend contract 必須引用 design brief artifact。imagegen 類 skill(`imagegen-frontend-web`、`design-taste-frontend` 等,user-level 已裝)是 DESIGN.md 的可選增強,不進 harness。

## Scope / Non-scope

In scope:
- `scripts/verify-contract.sh` + `assets/templates/helpers/verify-contract.sh`:task_profile enum 加 `frontend`;新增 frontend 條件 case——`exit_criteria.files_exist` 必須含至少一個 design-brief 路徑(匹配 `docs/design/` 前綴或檔名含 `DESIGN`/`design-brief`),缺失 → fail(訊息指名補 design brief)。
- `scripts/harness-trace-grade.sh` + helper 副本:profile 合法值清單同步加 `frontend`(rg 全倉掃描 enum 字串,所有硬編清單一致更新)。
- `assets/templates/design-brief.template.md` + `.claude/templates/design-brief.template.md`(新檔,兩份 parity):sections——頁面目的/受眾、參考來源(學什麼/避什麼)、色彩、字型排印、佈局、動效、明確 anti-patterns 清單、五條人工確認標準 checklist(價值主張清晰/主參考已定/色彩準確/明確的 don't/動效規格)、可選 preview 圖附件位。
- 新模板的 scaffold 註冊:`scripts/ensure-task-workflow.sh`(+helper)與 `scripts/lib/project-init-lib.sh` 的模板安裝面,以及 `assets/workflow-contract.v1.json` + `.ai/harness/workflow-contract.json`(若模板檔在其中列名;兩份保持同步)。
- `assets/skill-commands/repo-harness-prd/SKILL.md`:frontend 路由短註——PRD 含 Frontend Perspective 或工作將以 frontend profile 執行時,先從 design-brief 模板產 `docs/design/DESIGN-<slug>.md`,人工按五條標準確認後才進 sprint/contract;imagegen skills 為可選增強。
- 測試:frontend profile pass/fail 兩型(含 design brief → pass;缺 → fail)、unknown profile 仍 fail、enum 同步斷言、新模板的 bootstrap/scaffold 快照更新。

Non-scope:
- `contract-run.ts` brief preflight 的 per-profile 擴展(如需另開)。
- imagegen 的任何自動化管線(skill 引用文字即止)。
- frontend profile 的 allowed_paths 限制條件(無自然限制,不發明)。
- `verify-sprint.sh` 變更(change_type==profile 的等值比較已泛化覆蓋)。
- WP4 已合面(PRD 模板/spec)之外的 intake 改動。

## Approach

### Strategy
完全複製既有 profile 模式:enum 一個值、一個條件 case、一份模板、一段 skill 慣例。機器面只驗「artifact 存在且被引用」;設計品質判斷留給人(五條確認標準)與 skill 流程。

### Trade-offs
| Option | Pros | Cons | Decision |
|--------|------|------|----------|
| enum + files_exist 條件 + 模板 + skill 慣例(本案) | 同構既有模式;機器面最小 | 設計品質不機器驗 | 採用 |
| brief preflight per-profile 硬閘 | 更早擋 | 觸 contract-run 共維護面,超出需要 | 拒絕(留後續) |
| 不進 harness,純 skill 慣例 | 零改動 | 「frontend 工作必有 design brief」無任何機器錨點,回到問題 1 | 拒絕 |

## Detailed Design

### File Changes
| File | Action | Description |
|------|--------|-------------|
| `scripts/verify-contract.sh` + helper | modify | enum + frontend 條件 case(files_exist 含 design-brief 路徑) |
| `scripts/harness-trace-grade.sh` + helper | modify | profile 合法值同步 |
| `assets/templates/design-brief.template.md` + `.claude/templates/` 副本 | add | 上述 sections + 五條確認 checklist |
| scaffold 註冊面(ensure-task-workflow ×2、project-init-lib、workflow-contract ×2,以實際列名為準) | modify | 新模板進安裝/清單 |
| `assets/skill-commands/repo-harness-prd/SKILL.md` | modify | frontend 路由短註 |
| tests | modify/add | 見 In scope |

### frontend 條件 case 語義
`files_exist` 任一路徑匹配 `docs/design/` 前綴、或 basename 含 `DESIGN` / `design-brief`(大小寫不敏感)即滿足;全不匹配 → `fail "files_exist" "(frontend)" "frontend profile requires a design brief artifact in files_exist"`。沿用既有 pass/fail 記錄函數,不新增輸出形態。

## Risk Assessment
| Risk | Likelihood | Impact | Mitigation |
|------|------------|--------|------------|
| enum 硬編點散落漏改 | 中 | 中 | rg 全倉掃描 `code-change|docs-only|ledger-closeout` 字串定位全部清單 |
| 新模板未進 scaffold 清單,downstream 拿不到 | 中 | 中 | bootstrap/scaffold 測試 + `migrate --dry-run` 驗證 |
| workflow-contract 兩份漂移 | 低 | 中 | root 規則要求同步;測試斷言 |

## Promotion Gate
- **Merge/PR unit**: 是,單一 PR to main。
- **Rollback surface**: revert branch `codex/frontend-task-profile`;無資料遷移。
- **Verification boundary**: `bun test` + `check-task-workflow --strict` + `migrate --dry-run` + 兩組 helper parity + 手測(frontend contract 含/缺 design brief 的 verify-contract 行為)。
- **Review/acceptance boundary**: review 檔 recommend pass(merge 時)。
- **High-risk surface**: enum 多點同步;scaffold 註冊面。
- **Why not checklist row**: merge_boundary——跨驗證腳本/模板/scaffold/skill 四面 + 新檔案類型,獨立回退與驗證邊界。

## Evidence Contract
- **State/progress path**: 本 plan `## Task Breakdown` + `tasks/contracts/<stem>.contract.md`。
- **Verification evidence**: 上列命令輸出 + 手測記錄。
- **Evaluator rubric**: contract exit_criteria 通過。
- **Stop condition**: Task Breakdown 全勾 + 驗證綠。
- **Rollback surface**: revert 分支;無資料遷移。

## Task Breakdown
- [x] verify-contract(兩份):enum + frontend 條件 case
- [x] harness-trace-grade(兩份)+ rg 掃描的其他 enum 硬編點:同步 `frontend`
- [x] design-brief 模板(兩份)+ scaffold 註冊面
- [x] `repo-harness-prd/SKILL.md` frontend 路由短註
- [x] 測試(pass/fail 兩型、enum 同步、快照)+ 手測兩則
- [x] 全量驗證:`bun test`、`check-task-workflow --strict`、`migrate --dry-run`、parity diffs

## Verification
```bash
bun test
bash scripts/check-task-workflow.sh --strict
bash scripts/migrate-project-template.sh --repo . --dry-run
diff -q scripts/verify-contract.sh assets/templates/helpers/verify-contract.sh
diff -q scripts/harness-trace-grade.sh assets/templates/helpers/harness-trace-grade.sh
diff -q assets/templates/design-brief.template.md .claude/templates/design-brief.template.md
# 手測 1:frontend profile contract,files_exist 含 docs/design/DESIGN-x.md → verify-contract pass 該項
# 手測 2:同 contract 移除 design-brief 條目 → fail 且訊息指名補 design brief
```

## Annotations
<!-- [NOTE]: prefixed inline. Claude processes all and revises. -->

## Task Breakdown
- [x] verify-contract(兩份):enum + frontend 條件 case
- [x] harness-trace-grade(兩份)+ rg 掃描的其他 enum 硬編點:同步 `frontend`
- [x] design-brief 模板(兩份)+ scaffold 註冊面
- [x] `repo-harness-prd/SKILL.md` frontend 路由短註
- [x] 測試(pass/fail 兩型、enum 同步、快照)+ 手測兩則
- [x] 全量驗證:`bun test`、`check-task-workflow --strict`、`migrate --dry-run`、parity diffs
