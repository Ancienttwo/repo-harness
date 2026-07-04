# Plan: File-coupled delegation Phase 2: policy runner degradation, advisor slim-down, preflight wiring

> **Status**: Draft
> **Created**: 20260705-0426
> **Slug**: file-coupled-delegation-phase2
> **Planning Source**: codex-plan-or-waza-think
> **Orchestration Kind**: host-plan
> **Source Ref**: (none)
> **Artifact Level**: work-package
> **Promotion Reason**: merge_boundary
> **Verification Boundary**: Commands named in the captured planning output plus `repo-harness run verify-contract --contract tasks/contracts/20260705-0426-file-coupled-delegation-phase2.contract.md --strict`.
> **Rollback Surface**: Before execution remove `plans/plan-20260705-0426-file-coupled-delegation-phase2.md`; after execution revert branch `codex/file-coupled-delegation-phase2` or the explicitly reviewed diff.
> **Spec**: `docs/spec.md`
> **Research**: See `docs/researches/`
> **Task Contract**: `tasks/contracts/20260705-0426-file-coupled-delegation-phase2.contract.md`
> **Task Review**: `tasks/reviews/20260705-0426-file-coupled-delegation-phase2.review.md`
> **Implementation Notes**: `tasks/notes/20260705-0426-file-coupled-delegation-phase2.notes.md`

## Agentic Routing
- Selected route: waza:think
- Routing reason: Captured from codex-plan-or-waza-think planning output.
- Source ref: (none)
- Due diligence:
  - P1 map: See captured planning output below.
  - P2 trace: See captured planning output below.
  - P3 decision rationale: See captured planning output below.

## Workflow Inventory
Complete this inventory before implementation. If any line is unknown, keep the plan in Draft and fill it before projection.

- Active plan: `plans/plan-20260705-0426-file-coupled-delegation-phase2.md`
- Sprint contract: `tasks/contracts/20260705-0426-file-coupled-delegation-phase2.contract.md`
- Sprint review: `tasks/reviews/20260705-0426-file-coupled-delegation-phase2.review.md`
- Implementation notes: `tasks/notes/20260705-0426-file-coupled-delegation-phase2.notes.md`
- Deferred-goal ledger: `tasks/todos.md`
- Current checks: `.ai/harness/checks/latest.json`
- Run snapshots: `.ai/harness/runs/`
- Scope authority: `tasks/contracts/20260705-0426-file-coupled-delegation-phase2.contract.md` `allowed_paths`
- Concurrency rule: `.ai/harness/active-plan` selects the active plan for this worktree when present; `.ai/harness/active-worktree` records the owning worktree; `.claude/.active-plan` is a legacy fallback during transition. If another worktree already owns active work, open or switch to the matching worktree instead of serializing unrelated plans.
- Execution isolation: approved contract-level work projects through `repo-harness run plan-to-todo --plan plans/plan-20260705-0426-file-coupled-delegation-phase2.md` and may start `repo-harness run contract-worktree start --plan plans/plan-20260705-0426-file-coupled-delegation-phase2.md`.

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
- Contract file: `tasks/contracts/20260705-0426-file-coupled-delegation-phase2.contract.md`
- Review file: `tasks/reviews/20260705-0426-file-coupled-delegation-phase2.review.md`
- Implementation notes file: `tasks/notes/20260705-0426-file-coupled-delegation-phase2.notes.md`
- Template: `.claude/templates/contract.template.md`
- Verification command: `repo-harness run verify-contract --contract tasks/contracts/20260705-0426-file-coupled-delegation-phase2.contract.md --strict`
- Active plan rule: this captured plan is written to `.ai/harness/active-plan`, the owning worktree is written to `.ai/harness/active-worktree`, and the plan is mirrored to `.claude/.active-plan` unless --no-active is used. Do not infer active execution from the latest non-archived plan.

## Handoff

- Checks file: `.ai/harness/checks/latest.json`
- Session handoff: `.ai/harness/handoff/current.md`

## Promotion Gate

- **Merge/PR unit**: Captured plan `plans/plan-20260705-0426-file-coupled-delegation-phase2.md` is the proposed mergeable execution unit; revise before execute if this is only a checklist step.
- **Rollback surface**: Before execution remove `plans/plan-20260705-0426-file-coupled-delegation-phase2.md`; after execution revert branch `codex/file-coupled-delegation-phase2` or the explicitly reviewed diff.
- **Verification boundary**: Commands named in the captured planning output plus `repo-harness run verify-contract --contract tasks/contracts/20260705-0426-file-coupled-delegation-phase2.contract.md --strict`.
- **Review/acceptance boundary**: `tasks/reviews/20260705-0426-file-coupled-delegation-phase2.review.md` must record pass against the captured acceptance criteria.
- **High-risk surface**: Risks named in captured planning output; keep the plan Draft if risk ownership is not concrete.
- **Why not checklist row**: merge_boundary

## Evidence Contract

- **State/progress path**: `plans/plan-20260705-0426-file-coupled-delegation-phase2.md` task breakdown, `tasks/todos.md` deferred-goal ledger, `tasks/contracts/20260705-0426-file-coupled-delegation-phase2.contract.md`, `tasks/reviews/20260705-0426-file-coupled-delegation-phase2.review.md`, and `tasks/notes/20260705-0426-file-coupled-delegation-phase2.notes.md`
- **Verification evidence**: `.ai/harness/checks/latest.json`, `.ai/harness/runs/`, and the commands named in the captured planning output
- **Evaluator rubric**: `tasks/reviews/20260705-0426-file-coupled-delegation-phase2.review.md` must record a passing Waza /check style recommendation
- **Stop condition**: all task breakdown items are complete, sprint verification passes, and the review recommends pass
- **Rollback surface**: Before execution remove `plans/plan-20260705-0426-file-coupled-delegation-phase2.md`; after execution revert branch `codex/file-coupled-delegation-phase2` or the explicitly reviewed diff.

## Captured Planning Output

## Context

Phase 1(PR #39)讓 `scripts/contract-run.ts` 以 brief 完整性閘 file-coupled delegation,並加了 per-contract `runner` metadata。它交付了「檢查 + 每份 contract 的 runner 宣告」,但兩個缺口留給 Phase 2:

1. 閘只在 `contract-run` 被呼叫時觸發,**沒接進工作流**(plan-to-todo / verify-sprint),所以不完整的 brief 仍可能繞過它進到 file-coupled run。
2. 只有 per-contract runner metadata,**沒有全域 policy 預設**的 runner 偏好與可用性降級;`codex-delegation-advisor.sh` 仍硬編 max_agents/max_depth 且命令原生 `spawn_agent`。

Phase 2 把 file-coupled runner 變成**跨宿主的預設降級路徑**:policy 宣告 runner 偏好 + fallback 語義,advisor 改成指向 contract brief 而非命令原生 spawn,preflight 閘接進工作流強制執行。根因回顧見 `docs/researches/20260705-superpowers-evaluation-file-coupled-delegation.md`。

## Scope / Non-scope

In scope:
- `.ai/harness/policy.json` `delegation`:加 `preferred_runners`(如 `["subagent","codex-exec","main-thread"]`)+ `fallback_runner` + rule 字串。**語義嚴格 = 同一份 contract 下的 runner「可用性」降級,必須寫進 run manifest,不得靜默成功**;不是產品語義的 compatibility fallback(不違反 No-Fallback rule)。
- policy 共維護面:寫/驗 policy.json 的 `scripts/ensure-task-workflow.sh`、`scripts/lib/project-init-lib.sh`、`assets/templates/helpers/*`、以及 migration/bootstrap 測試,全部要 emit 並 assert 新欄位。
- `.ai/hooks/codex-delegation-advisor.sh`(產品源 `assets/hooks/`,經 `bun run sync:hooks` 投影):瘦身成 nudge——(a) 從 policy 讀 max_agents/max_depth,(b) 指向 active `tasks/contracts/<stem>.contract.md` 當 brief,(c) 依 `policy.delegation.preferred_runners` 選 runner、依 `fallback_runner` 降級。維持 Codex-only。
- 把 Phase 1 preflight 接成**強制閘**:`plan-to-todo`(或 `contract-worktree start`)在 contract 將被當 file-coupled 執行 brief 時跑 `contract-run preflight`,不完整就 fail-closed。**不動** `verify-contract` 的 exit_criteria-only 相容承諾。

Non-scope:
- `subagent-stop-quality` host-agnostic 化(獨立品質閘改善,另開)。
- 在 hook 裡自動選/啟動 runner(hooks 不啟動長任務,見 `docs/reference-configs/hook-operations.md`)。
- Codex 原生編排可靠性(非本倉能修)。
- 任何 superpowers 進口。

## Approach

### Strategy
policy 宣告「偏好 + 降級」,advisor 從「命令原生 spawn」轉為「指向 contract + 依 policy 選 runner」,preflight 接進工作流當硬閘。三者合起來讓「不完整 brief 進不了 file-coupled run」且「runner 降級一定留痕」。原生 `spawn_agent` 保留為 `preferred_runners` 的首選,行為向後相容。

### Trade-offs
| Option | Pros | Cons | Decision |
|--------|------|------|----------|
| policy 全域 preferred_runners + advisor 指向 contract(本案) | file-coupled 成為預設降級;跨宿主一致;留痕 | 觸達 policy 共維護面(>8 檔) | 採用 |
| 只留 Phase 1 per-contract metadata,不加全域 policy | 改動最小 | 每份 contract 要自己宣告;advisor 仍命令原生 spawn,Codex 仍弱 | 拒絕 |
| 在 hook 內自動 `codex exec` | 全自動 | 違反「hook 不啟動長任務」;失敗難留痕 | 拒絕 |

## Detailed Design

### File Changes
| File | Action | Description |
|------|--------|-------------|
| `.ai/harness/policy.json` | modify | `delegation` 加 `preferred_runners`、`fallback_runner`、rule(語義=runner 可用性降級、必寫 manifest、不得靜默) |
| `scripts/ensure-task-workflow.sh` | modify | 生成/校驗 policy.json 時 emit 新欄位 |
| `scripts/lib/project-init-lib.sh` | modify | 下游 repo 初始化的 policy 預設含新欄位 |
| `assets/templates/helpers/*`(policy 相關) | modify | 與上同步 |
| `.ai/hooks/codex-delegation-advisor.sh` + `assets/hooks/…` | modify | 瘦身為 contract-指向 nudge;`bun run sync:hooks` |
| `scripts/plan-to-todo.sh`(或 `contract-worktree.sh start`) | modify | 接 `contract-run preflight` 硬閘 |
| `tests/*`(policy shape、advisor、preflight-wiring、migration) | modify/add | 斷言新欄位、fail-closed、manifest 留痕 |

### 關鍵語義:fallback_runner 不是 compatibility fallback
`fallback_runner` 只表達「preferred runner 不可用時,換另一個 runner 執行**同一份 contract**」。它**不**改變任何產品語義、不再推導授權值。每次降級必須在 `manifest.json` 記錄實際使用的 runner 與降級原因,測試斷言「降級 → 非靜默」。

### advisor before/after
- Before:硬編 `max_agents:3/max_depth:1`,注入不指名 contract 的泛用 explorer/worker/reviewer 角色,命令「先 call spawn_agent」。
- After:從 policy 讀 limits;注入「你的 brief 是當前 contract 檔;依 policy.preferred_runners 選 runner;spawn 不穩就依 fallback_runner 降級並在 manifest 記錄」。

### preflight wiring point
`plan-to-todo`(或 `contract-worktree start`)在把 contract 交付為 file-coupled 執行 brief 前呼叫 `contract-run preflight --contract <file>`;非零則 fail-closed 並提示補齊 Goal/Scope/Allowed Paths/Exit Criteria。normal `verify-contract`/`dry-run` 路徑不受影響。

## Risk Assessment
| Risk | Likelihood | Impact | Mitigation |
|------|------------|--------|------------|
| policy schema 漂移,共維護面不同步 → migration 測試炸 | 中 | 高 | 同一 PR 更新所有 generator + 測試;跑 `migrate --dry-run` + `check-architecture-sync` |
| preflight 接得太前面,擋掉合法 WIP 流程 | 中 | 中 | 只在 file-coupled RUN 交付路徑強制,不碰 dry-run/normal verify;既有 contract 已帶 Goal/Scope |
| `fallback` 被誤解為產品 compatibility fallback | 低 | 中 | rule 字串 + manifest 留痕 + 測試斷言非靜默 |
| advisor 改動影響 Codex 現行 delegation 行為 | 中 | 中 | 保 Codex-only;快照/測試 advisor 輸出;native 仍是 preferred 首選 |

## Promotion Gate
- **Merge/PR unit**: 是,單一 PR(policy + advisor + wiring + sync)。
- **Rollback surface**: revert 本 Phase 2 分支;Phase 1(native 為 preferred 首選)仍可運作。
- **Verification boundary**: `bun test` 全綠 + `migrate --dry-run` + `contract-run` manifest 顯示 runner/fallback。
- **Review/acceptance boundary**: review 檔 recommend pass + 外部驗收。
- **High-risk surface**: policy 共維護面 + 遷移相容。
- **Why not checklist row**: 觸達 >8 檔、跨 policy/hook/工作流、有獨立驗證與回退邊界。

## Evidence Contract
- **State/progress path**: 本 plan `## Task Breakdown` + `tasks/contracts/<stem>.contract.md` 狀態 + `.ai/harness/runs/*/manifest.json` 的 runner/fallback 欄位。
- **Verification evidence**: 全量 `bun test`、`migrate-project-template.sh --dry-run`、`contract-run run/preflight` manifest。
- **Evaluator rubric**: contract exit_criteria 通過 + review recommend pass + 降級非靜默(manifest 有記錄實際 runner)。
- **Stop condition**: policy 新欄位就位並全共維護面同步、advisor 瘦身、preflight 接進工作流、所有相關測試 + 全量套件綠。
- **Rollback surface**: revert Phase 2 分支;無資料遷移。

## Task Breakdown
- [ ] `.ai/harness/policy.json` `delegation` 加 `preferred_runners` / `fallback_runner` / rule(runner 可用性降級、必寫 manifest、不得靜默)
- [ ] 同步 policy 共維護面:`ensure-task-workflow.sh`、`project-init-lib.sh`、`assets/templates/helpers/*` + migration/bootstrap 測試 emit 並 assert 新欄位
- [ ] 瘦身 `codex-delegation-advisor.sh`:從 policy 讀 limits、指向 active contract、runner-per-policy;`bun run sync:hooks` 投影 `.ai/hooks`
- [ ] 把 `contract-run preflight` 接進 `plan-to-todo`(或 `contract-worktree start`)當 fail-closed 硬閘,`verify-contract` 相容承諾不變
- [ ] 測試:policy shape、advisor 輸出、preflight-wiring fail-closed、manifest 記錄 runner+fallback 非靜默
- [ ] 全量驗證:`bun test`、`migrate --dry-run`、`check-architecture-sync`、`check-task-workflow --strict`、`contract-run.ts` 兩份 parity

## Verification
```bash
bun test
bash scripts/migrate-project-template.sh --repo . --dry-run
bash scripts/check-architecture-sync.sh
repo-harness run check-task-workflow --strict
diff -q scripts/contract-run.ts assets/templates/helpers/contract-run.ts
# 手測:對一份完整 contract 跑 file-coupled run,確認 manifest 記錄實際 runner;
# 對佔位 contract 走 plan-to-todo 交付路徑,確認 preflight fail-closed。
```

## Annotations
<!-- [NOTE]: prefixed inline. Claude processes all and revises. -->

## Task Breakdown
- [ ] `.ai/harness/policy.json` `delegation` 加 `preferred_runners` / `fallback_runner` / rule(runner 可用性降級、必寫 manifest、不得靜默)
- [ ] 同步 policy 共維護面:`ensure-task-workflow.sh`、`project-init-lib.sh`、`assets/templates/helpers/*` + migration/bootstrap 測試 emit 並 assert 新欄位
- [ ] 瘦身 `codex-delegation-advisor.sh`:從 policy 讀 limits、指向 active contract、runner-per-policy;`bun run sync:hooks` 投影 `.ai/hooks`
- [ ] 把 `contract-run preflight` 接進 `plan-to-todo`(或 `contract-worktree start`)當 fail-closed 硬閘,`verify-contract` 相容承諾不變
- [ ] 測試:policy shape、advisor 輸出、preflight-wiring fail-closed、manifest 記錄 runner+fallback 非靜默
- [ ] 全量驗證:`bun test`、`migrate --dry-run`、`check-architecture-sync`、`check-task-workflow --strict`、`contract-run.ts` 兩份 parity
