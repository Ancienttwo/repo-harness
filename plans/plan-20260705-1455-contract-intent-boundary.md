# Plan: Contract intent-boundary hardening: Non-scope carry-forward, split brief preflight, anti-extras injection

> **Status**: Executing
> **Created**: 20260705-1455
> **Slug**: contract-intent-boundary
> **Planning Source**: waza-think
> **Orchestration Kind**: host-plan
> **Source Ref**: dual-track analysis 2026-07-05 (harness archaeology + Opus deep-reasoner + Codex peer review)
> **Artifact Level**: work-package
> **Promotion Reason**: merge_boundary
> **Verification Boundary**: bun test + migrate --dry-run + check-task-workflow --strict + contract-run/plan-to-todo helper parity diffs + manual probes: fail-closed incomplete_brief on blank Out-of-scope, Non-scope carry-forward on projection, advisor additionalContext contains execution-boundary clause
> **Rollback Surface**: Before execution remove the captured plan file; after execution revert branch codex/contract-intent-boundary. No data migration.
> **Spec**: `docs/spec.md`
> **Research**: See `docs/researches/`
> **Task Contract**: `tasks/contracts/20260705-1455-contract-intent-boundary.contract.md`
> **Task Review**: `tasks/reviews/20260705-1455-contract-intent-boundary.review.md`
> **Implementation Notes**: `tasks/notes/20260705-1455-contract-intent-boundary.notes.md`

## Agentic Routing
- Selected route: planning
- Routing reason: Captured from waza-think planning output.
- Source ref: dual-track analysis 2026-07-05 (harness archaeology + Opus deep-reasoner + Codex peer review)
- Due diligence:
  - P1 map: See captured planning output below.
  - P2 trace: See captured planning output below.
  - P3 decision rationale: See captured planning output below.

## Workflow Inventory
Complete this inventory before implementation. If any line is unknown, keep the plan in Draft and fill it before projection.

- Active plan: `plans/plan-20260705-1455-contract-intent-boundary.md`
- Sprint contract: `tasks/contracts/20260705-1455-contract-intent-boundary.contract.md`
- Sprint review: `tasks/reviews/20260705-1455-contract-intent-boundary.review.md`
- Implementation notes: `tasks/notes/20260705-1455-contract-intent-boundary.notes.md`
- Deferred-goal ledger: `tasks/todos.md`
- Current checks: `.ai/harness/checks/latest.json`
- Run snapshots: `.ai/harness/runs/`
- Scope authority: `tasks/contracts/20260705-1455-contract-intent-boundary.contract.md` `allowed_paths`
- Concurrency rule: `.ai/harness/active-plan` selects the active plan for this worktree when present; `.ai/harness/active-worktree` records the owning worktree; `.claude/.active-plan` is a legacy fallback during transition. If another worktree already owns active work, open or switch to the matching worktree instead of serializing unrelated plans.
- Execution isolation: approved contract-level work projects through `repo-harness run plan-to-todo --plan plans/plan-20260705-1455-contract-intent-boundary.md` and may start `repo-harness run contract-worktree start --plan plans/plan-20260705-1455-contract-intent-boundary.md`.

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
- Contract file: `tasks/contracts/20260705-1455-contract-intent-boundary.contract.md`
- Review file: `tasks/reviews/20260705-1455-contract-intent-boundary.review.md`
- Implementation notes file: `tasks/notes/20260705-1455-contract-intent-boundary.notes.md`
- Template: `.claude/templates/contract.template.md`
- Verification command: `repo-harness run verify-contract --contract tasks/contracts/20260705-1455-contract-intent-boundary.contract.md --strict`
- Active plan rule: this captured plan is written to `.ai/harness/active-plan`, the owning worktree is written to `.ai/harness/active-worktree`, and the plan is mirrored to `.claude/.active-plan` unless --no-active is used. Do not infer active execution from the latest non-archived plan.

## Handoff

- Checks file: `.ai/harness/checks/latest.json`
- Session handoff: `.ai/harness/handoff/current.md`

## Promotion Gate

- **Merge/PR unit**: Captured plan `plans/plan-20260705-1455-contract-intent-boundary.md` is the proposed mergeable execution unit; revise before execute if this is only a checklist step.
- **Rollback surface**: Before execution remove the captured plan file; after execution revert branch codex/contract-intent-boundary. No data migration.
- **Verification boundary**: bun test + migrate --dry-run + check-task-workflow --strict + contract-run/plan-to-todo helper parity diffs + manual probes: fail-closed incomplete_brief on blank Out-of-scope, Non-scope carry-forward on projection, advisor additionalContext contains execution-boundary clause
- **Review/acceptance boundary**: `tasks/reviews/20260705-1455-contract-intent-boundary.review.md` must record pass against the captured acceptance criteria.
- **High-risk surface**: Risks named in captured planning output; keep the plan Draft if risk ownership is not concrete.
- **Why not checklist row**: merge_boundary

## Evidence Contract

- **State/progress path**: `plans/plan-20260705-1455-contract-intent-boundary.md` task breakdown, `tasks/todos.md` deferred-goal ledger, `tasks/contracts/20260705-1455-contract-intent-boundary.contract.md`, `tasks/reviews/20260705-1455-contract-intent-boundary.review.md`, and `tasks/notes/20260705-1455-contract-intent-boundary.notes.md`
- **Verification evidence**: `.ai/harness/checks/latest.json`, `.ai/harness/runs/`, and the commands named in the captured planning output
- **Evaluator rubric**: `tasks/reviews/20260705-1455-contract-intent-boundary.review.md` must record a passing Waza /check style recommendation
- **Stop condition**: all task breakdown items are complete, sprint verification passes, and the review recommends pass
- **Rollback surface**: Before execution remove the captured plan file; after execution revert branch codex/contract-intent-boundary. No data migration.

## Captured Planning Output

## Context

三路研究(harness 全鏈路考古 + Opus deep-reasoner 診斷 + Codex 獨立第二方案,2026-07-05 對話)收斂到同一判定:`tasks/contracts/*.contract.md` 是強排程/權限物件、弱意圖物件。兩個結構性缺口:

1. **負向邊界在投影時蒸發**:PRD/sprint/plan 三層都有 Non-goals/Non-scope,`plan-to-todo` 渲染 contract 後只剩空的 `Out of scope:` bullet;`contract-run.ts` 的 `isConcreteBrief` 把 In/Out scope 混在一個 Scope 段判定,**邊界留白也能通過 file-coupled run 閘**。
2. **全鏈路無 anti-extras 條款**:worker prompt 只有「Implement only the contract scope」,沒定義 scope 之外算什麼;advisor 的 Rules 只約束派發過程(agent 數/深度/角色),不約束輸出內容;review rubric 第 8 維(YAGNI)被封頂「never P0/P1」,overreach 結構上不可 block(rubric 收緊另開 WP3)。另外 `src/cli/mcp/tools.ts` 的 codex-goal 路徑(`renderCodexGoalFromSprint`)完全繞過 contract-run,同樣無邊界條款。

本 plan 把兩個缺口合成一個合併單元,全部複用 Phase 2 已定案的閘拓撲(投影 advisory、`contract-run run` fail-closed `failure_class: incomplete_brief`;見 Phase 2 plan「閘拓撲修正」段)。

**執行前置**:必須等 Phase 2 slice 3(branch `codex/projection-brief-advisory`)合併 main 後開工並 rebase——本 plan 共改 `plan-to-todo.sh`、`contract-run.ts`、`codex-delegation-advisor.sh` 同一批檔。

## Scope / Non-scope

In scope:
- `assets/templates/contract.template.md`:`## Scope` 段增加 `Taste constraints:` 標籤清單(advisory,不設 run 閘;品味預設住在 AGENTS.md / minimal-change policy,此欄位只給 per-task 覆寫一個家)。
- `scripts/plan-to-todo.sh` + `assets/templates/helpers/plan-to-todo.sh`:渲染 contract 時解析 plan 的 `Non-scope:` / `Out of scope:` bullet 清單,投影進 contract 的 `Out of scope:`。**只搬運上游權威值,不本地合成**;plan 缺該段時維持占位並沿用既有 `[BriefPreflight]` advisory。
- `scripts/contract-run.ts` + `assets/templates/helpers/contract-run.ts`:`runBriefPreflight`/`isConcreteBrief` 拆分判定——`In scope:` 之後至少一個非空非占位 bullet、`Out of scope:` 之後至少一個非空非占位 bullet,**各自獨立**;run 模式缺任一 → fail-closed `incomplete_brief`(訊息指名缺哪個);`preflight`/`dry-run` 維持 advisory。
- anti-extras 條款(EXECUTION_BOUNDARY 常量,文本見 Detailed Design)注入五個到達面:
  1. `contract-run.ts` worker prompt scaffold(隨 `CONTRACT_RUN_PROMPT` 到達 runner);
  2. `assets/hooks/codex-delegation-advisor.sh` context 陣列(`hookSpecificOutput.additionalContext` 通道;禁用 prompt-guard stdout,Codex 會吞);
  3. `assets/hooks/subagent-start-context.sh`;
  4. `src/cli/mcp/tools.ts`:`renderCodexGoalFromSprint` 注入 `## Execution boundary` 段,`validateGoal` 把該段列為 required section(封掉 codex-goal 旁路);
  5. root `AGENTS.md` / `CLAUDE.md` Operating Rules 一行摘要(覆蓋非委派 session)。
- hook 修改後 `bun run sync:hooks` 投影 `.ai/hooks`。
- 測試:preflight 拆分判定(缺 Out-of-scope 單獨觸發 fail)、投影 carry-forward(有/無 Non-scope 兩型)、五個注入面各自斷言條款到達(`tests/cli/hook.test.ts`、`tests/contract-run.test.ts`、`tests/helper-scripts.test.ts`)、條款文本 parity(三處常量一致)。

Non-scope(各自獨立成刀,不在本合併單元):
- review rubric 第 9 維「Scope fidelity」+ YAGNI 封頂豁免 + verify 面 changed-files vs allowed_paths 報告(WP3)。
- `frontend` Task Profile(enum + 條件化 design-brief 要求,WP5)。
- PRD prior-art 觸發規則與負向 scenario 要求(WP4)。
- handoff/`prepare-handoff.sh` fallback 補 contract 指針(獨立小刀;contract 補齊欄位後指針制已覆蓋主要 rollover 路徑)。
- 任何 handoff 抄寫邊界的設計(拒絕:第二意圖副本會漂移,違反 `brief_is_authoritative`)。

## Approach

### Strategy
兩個動作一個單元:**投影帶邊界**(上游 Non-scope 搬進 contract,run 閘獨立驗它)+ **條款注入**(EXECUTION_BOUNDARY 常量鋪滿五個 runner 到達面)。前者讓負向邊界成為權威 brief 的必備部分並可 fail-closed;後者讓「scope 之外=禁區」的語義隨每次委派機械到達。均不新建子系統、不改 `verify-contract` 的 exit_criteria-only 相容承諾。

### Trade-offs
| Option | Pros | Cons | Decision |
|--------|------|------|----------|
| 投影 carry-forward + 拆分 preflight + 常量注入(本案) | 修蒸發根因;複用 Phase 2 拓撲;意圖單一事實來源不變 | 觸達 template/腳本/hook/MCP/測試 >10 檔 | 採用 |
| 只加必填欄位讓人手填 | 改動小 | 不修蒸發根因,徒增填表儀式 | 拒絕 |
| 新 `## Intent Boundary` 五子欄段(Owner intent/Non-goals/Taste/Forbidden extras/Open questions) | 表達力強 | 與 Goal、PRD Known Unknowns 重複;欄位膨脹沖淡關鍵(Codex 版,裁決不採) | 拒絕 |
| handoff 抄寫 Boundaries carried forward | rollover 直讀 | 第二副本漂移;contract 已是權威 brief | 拒絕 |

## Detailed Design

### File Changes
| File | Action | Description |
|------|--------|-------------|
| `assets/templates/contract.template.md` | modify | `## Scope` 加 `Taste constraints:` 清單與說明註釋 |
| `scripts/plan-to-todo.sh` + `assets/templates/helpers/plan-to-todo.sh` | modify | 解析 plan `Non-scope:`/`Out of scope:` bullets → 投影進 contract `Out of scope:`;解析不到維持占位(advisory),不猜 |
| `scripts/contract-run.ts` + `assets/templates/helpers/contract-run.ts` | modify | In/Out scope 獨立 preflight 判定;run 模式 fail-closed `incomplete_brief`;新增 EXECUTION_BOUNDARY 常量注入 worker prompt |
| `assets/hooks/codex-delegation-advisor.sh` | modify | context 陣列附加條款(不刪既有行);sync:hooks |
| `assets/hooks/subagent-start-context.sh` | modify | 同上 |
| `src/cli/mcp/tools.ts` | modify | `renderCodexGoalFromSprint` 注入 `## Execution boundary`;`validateGoal` required section |
| `AGENTS.md` / `CLAUDE.md`(root) | modify | Operating Rules 一行 boundary 摘要 |
| `tests/cli/hook.test.ts`、`tests/contract-run.test.ts`、`tests/helper-scripts.test.ts` 等 | modify/add | 見 In scope 測試清單 |

### EXECUTION_BOUNDARY 條款文本(canonical,Codex 撰寫)
```text
Execution boundary: implement exactly the Goal, In scope items, Allowed Paths, and Exit Criteria in this brief. Treat absent requirements as forbidden design space, not as permission to improve.

Do not add optional features, alternate UX, extra integrations, migration paths, compatibility behavior, fallback behavior, telemetry, broad cleanup, refactors, new abstractions, extra docs, or polish unless that work is explicitly listed under In scope or required by Exit Criteria.

If you discover useful additional work, record it under Out of scope / Future work in the notes or review artifact. Do not implement it. Do not end with unsolicited offers to do more work.

If the requested outcome cannot be completed without expanding scope, fail closed: stop, name the missing decision, and cite the exact file/section that blocks execution.
```
常量在 `contract-run.ts`(自包含,受 helper parity 約束)、`tools.ts`、advisor bash 三處重複;以 parity 測試斷言同一 canonical 句子(第一段首句)出現在三處輸出,防漂移。

### 關鍵語義
- 投影 carry-forward 是上游權威值的搬運(同 `{{TASK_PROFILE}}` 替換),不是本地合成;缺值不發明,維持占位 → run 閘擋。符合 No-Fallback 規則。
- `Out of scope` 獨立判定後,「邊界留白」不可能通過 file-coupled run;與 Phase 2 `incomplete_brief` failure class 同構,不新增 failure class。
- `Taste constraints:` 不進 run 閘;preflight 對它只做存在性 advisory。

## Risk Assessment
| Risk | Likelihood | Impact | Mitigation |
|------|------------|--------|------------|
| plan 的 Non-scope 標題形態漂移(`Non-scope:` vs `Out of scope:` vs `### Non-goals`) | 中 | 中 | 只認列舉的標籤形態;解析不到維持占位 + advisory,不猜 |
| preflight 收緊使存量 contract 的 file-coupled 重跑被擋 | 低 | 中 | fail-closed 訊息指名補 `Out of scope:`;非 file-coupled 路徑(verify-contract/dry-run)不受影響 |
| 條款文本三處漂移 | 中 | 低 | canonical 句 parity 測試 |
| advisor/subagent hook 文案變動 → Codex 委派行為回歸 | 中 | 中 | 附加不刪行;`tests/cli/hook.test.ts` 斷言 additionalContext 完整內容 |
| 與 Phase 2 slice 3 改動衝突 | 高(若提前開工) | 高 | 硬前置:slice 3 合併 main 後 rebase 再開工 |

## Promotion Gate
- **Merge/PR unit**: 是,單一 PR(template + 投影 + preflight + 五面注入 + 測試)。
- **Rollback surface**: revert 本 plan 分支;Phase 2 行為不受影響(僅附加欄位與條款)。
- **Verification boundary**: `bun test` 全綠 + `migrate --dry-run` + `check-task-workflow --strict` + 兩組 helper parity diff + 手測三則(見 Verification)。
- **Review/acceptance boundary**: review 檔 recommend pass + 外部驗收。
- **High-risk surface**: hook 文案觸達 Codex 委派行為;plan-to-todo/contract-run 共維護 parity 面。
- **Why not checklist row**: merge_boundary——觸達 template/腳本/hook/MCP/root 契約/測試 >10 檔,跨兩個 capability(workflow-engine-contract-assets、runtime-harness-hook-adapters),有獨立回退與驗證邊界。

## Evidence Contract
- **State/progress path**: 本 plan `## Task Breakdown` + `tasks/contracts/<stem>.contract.md` 狀態。
- **Verification evidence**: `bun test`、`migrate --dry-run`、`check-architecture-sync`、`check-task-workflow --strict`、parity diff、`.ai/harness/runs/*/manifest.json`(fail-closed 手測留痕)。
- **Evaluator rubric**: contract exit_criteria 通過 + review recommend pass + 手測三則有記錄。
- **Stop condition**: Task Breakdown 全勾 + 上列驗證全綠。
- **Rollback surface**: revert 本 plan 分支;無資料遷移。

## Task Breakdown
- [x] `contract.template.md` 加 `Taste constraints:` 清單(advisory)
- [x] `plan-to-todo.sh`(兩份)投影 plan Non-scope → contract `Out of scope:`;無來源維持占位 + advisory
- [x] `contract-run.ts`(兩份)拆分 In/Out scope 獨立 preflight;run 模式 fail-closed;EXECUTION_BOUNDARY 常量注入 worker prompt
- [x] advisor + `subagent-start-context.sh` 注入條款;`bun run sync:hooks`;hook 測試斷言到達
- [x] `tools.ts`:codex-goal 注入 `## Execution boundary` + `validateGoal` required section + 測試
- [x] root `AGENTS.md`/`CLAUDE.md` 一行 boundary 摘要
- [x] 條款 canonical 句 parity 測試(三處常量一致)
- [ ] 全量驗證:`bun test`、`migrate --dry-run`、`check-architecture-sync`、`check-task-workflow --strict`、contract-run/plan-to-todo 兩組 parity

## Verification
```bash
bun test
bash scripts/migrate-project-template.sh --repo . --dry-run
bash scripts/check-architecture-sync.sh
repo-harness run check-task-workflow --strict
diff -q scripts/contract-run.ts assets/templates/helpers/contract-run.ts
diff -q scripts/plan-to-todo.sh assets/templates/helpers/plan-to-todo.sh
# 手測 1:占位 contract 跑 file-coupled run → fail-closed,incomplete_brief 訊息指名缺 Out of scope
# 手測 2:帶 Non-scope 的 plan 投影 → contract Out of scope 已帶上游內容
# 手測 3:advisor 觸發(/delegate)→ additionalContext 含 execution boundary 條款
```

## Annotations
<!-- [NOTE]: prefixed inline. Claude processes all and revises. -->

## Task Breakdown
- [x] `contract.template.md` 加 `Taste constraints:` 清單(advisory)
- [x] `plan-to-todo.sh`(兩份)投影 plan Non-scope → contract `Out of scope:`;無來源維持占位 + advisory
- [x] `contract-run.ts`(兩份)拆分 In/Out scope 獨立 preflight;run 模式 fail-closed;EXECUTION_BOUNDARY 常量注入 worker prompt
- [x] advisor + `subagent-start-context.sh` 注入條款;`bun run sync:hooks`;hook 測試斷言到達
- [x] `tools.ts`:codex-goal 注入 `## Execution boundary` + `validateGoal` required section + 測試
- [x] root `AGENTS.md`/`CLAUDE.md` 一行 boundary 摘要
- [x] 條款 canonical 句 parity 測試(三處常量一致)
- [ ] 全量驗證:`bun test`、`migrate --dry-run`、`check-architecture-sync`、`check-task-workflow --strict`、contract-run/plan-to-todo 兩組 parity
