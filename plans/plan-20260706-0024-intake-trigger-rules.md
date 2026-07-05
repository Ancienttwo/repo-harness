# Plan: Intake hardening: prior-art triggers, negative scenarios, canonical-term disciplines

> **Status**: Executing
> **Created**: 20260706-0024
> **Slug**: intake-trigger-rules
> **Planning Source**: waza-think
> **Orchestration Kind**: host-plan
> **Source Ref**: WP4 from intent-mismatch analysis 2026-07-05 + domain-modeling evaluation research note
> **Artifact Level**: work-package
> **Promotion Reason**: merge_boundary
> **Verification Boundary**: bun test + check-task-workflow --strict + migrate --dry-run + rg protocol-string checks
> **Rollback Surface**: Revert branch codex/intake-trigger-rules; no data migration.
> **Spec**: `docs/spec.md`
> **Research**: See `docs/researches/`
> **Task Contract**: `tasks/contracts/20260706-0024-intake-trigger-rules.contract.md`
> **Task Review**: `tasks/reviews/20260706-0024-intake-trigger-rules.review.md`
> **Implementation Notes**: `tasks/notes/20260706-0024-intake-trigger-rules.notes.md`

## Agentic Routing
- Selected route: planning
- Routing reason: Captured from waza-think planning output.
- Source ref: WP4 from intent-mismatch analysis 2026-07-05 + domain-modeling evaluation research note
- Due diligence:
  - P1 map: See captured planning output below.
  - P2 trace: See captured planning output below.
  - P3 decision rationale: See captured planning output below.

## Workflow Inventory
Complete this inventory before implementation. If any line is unknown, keep the plan in Draft and fill it before projection.

- Active plan: `plans/plan-20260706-0024-intake-trigger-rules.md`
- Sprint contract: `tasks/contracts/20260706-0024-intake-trigger-rules.contract.md`
- Sprint review: `tasks/reviews/20260706-0024-intake-trigger-rules.review.md`
- Implementation notes: `tasks/notes/20260706-0024-intake-trigger-rules.notes.md`
- Deferred-goal ledger: `tasks/todos.md`
- Current checks: `.ai/harness/checks/latest.json`
- Run snapshots: `.ai/harness/runs/`
- Scope authority: `tasks/contracts/20260706-0024-intake-trigger-rules.contract.md` `allowed_paths`
- Concurrency rule: `.ai/harness/active-plan` selects the active plan for this worktree when present; `.ai/harness/active-worktree` records the owning worktree; `.claude/.active-plan` is a legacy fallback during transition. If another worktree already owns active work, open or switch to the matching worktree instead of serializing unrelated plans.
- Execution isolation: approved contract-level work projects through `repo-harness run plan-to-todo --plan plans/plan-20260706-0024-intake-trigger-rules.md` and may start `repo-harness run contract-worktree start --plan plans/plan-20260706-0024-intake-trigger-rules.md`.

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
- Contract file: `tasks/contracts/20260706-0024-intake-trigger-rules.contract.md`
- Review file: `tasks/reviews/20260706-0024-intake-trigger-rules.review.md`
- Implementation notes file: `tasks/notes/20260706-0024-intake-trigger-rules.notes.md`
- Template: `.claude/templates/contract.template.md`
- Verification command: `repo-harness run verify-contract --contract tasks/contracts/20260706-0024-intake-trigger-rules.contract.md --strict`
- Active plan rule: this captured plan is written to `.ai/harness/active-plan`, the owning worktree is written to `.ai/harness/active-worktree`, and the plan is mirrored to `.claude/.active-plan` unless --no-active is used. Do not infer active execution from the latest non-archived plan.

## Handoff

- Checks file: `.ai/harness/checks/latest.json`
- Session handoff: `.ai/harness/handoff/current.md`

## Promotion Gate

- **Merge/PR unit**: Captured plan `plans/plan-20260706-0024-intake-trigger-rules.md` is the proposed mergeable execution unit; revise before execute if this is only a checklist step.
- **Rollback surface**: Revert branch codex/intake-trigger-rules; no data migration.
- **Verification boundary**: bun test + check-task-workflow --strict + migrate --dry-run + rg protocol-string checks
- **Review/acceptance boundary**: `tasks/reviews/20260706-0024-intake-trigger-rules.review.md` must record pass against the captured acceptance criteria.
- **High-risk surface**: Risks named in captured planning output; keep the plan Draft if risk ownership is not concrete.
- **Why not checklist row**: merge_boundary

## Evidence Contract

- **State/progress path**: `plans/plan-20260706-0024-intake-trigger-rules.md` task breakdown, `tasks/todos.md` deferred-goal ledger, `tasks/contracts/20260706-0024-intake-trigger-rules.contract.md`, `tasks/reviews/20260706-0024-intake-trigger-rules.review.md`, and `tasks/notes/20260706-0024-intake-trigger-rules.notes.md`
- **Verification evidence**: `.ai/harness/checks/latest.json`, `.ai/harness/runs/`, and the commands named in the captured planning output
- **Evaluator rubric**: `tasks/reviews/20260706-0024-intake-trigger-rules.review.md` must record a passing Waza /check style recommendation
- **Stop condition**: all task breakdown items are complete, sprint verification passes, and the review recommends pass
- **Rollback surface**: Revert branch codex/intake-trigger-rules; no data migration.

## Captured Planning Output

## Context

原始問題 1(用戶描述不清/沒想清楚)的上游半邊。所有設計決策已在 2026-07-05 三路分析與 `docs/researches/20260705-domain-modeling-skill-intake-evaluation.md` 定案(採納/窄採納/不採納表),本 plan 純執行。下游擋板(WP1/2/3:邊界進 runner、reviewer 可阻斷)已全部合併 main。

三塊決策回顧:
- **Prior-art 觸發制**(非全面硬閘):涉 UI/taste、市場慣例模式、library 選型、架構先例、`[UNVERIFIED]` 外部假設 → 必須引用 `docs/researches/*` 或填 Adjacent Patterns(具名成熟組件 + build-vs-adopt 理由);純 bugfix/純內部重構豁免。runner 用既有 `sidecar_research`(policy default true)。「查過成熟方案」不可機器驗證,硬閘會 fail-open 或擋真正新穎的工作——維持 advisory。
- **負向 scenario**:每個 P0 module ≥1 條 negative/non-goal Given/When/Then(斷言「不得發生什麼」),是 Non-Goal 的可執行形態,綁 PRD Non-goals。
- **Domain-modeling 五紀律**(源:mattpocock/skills@main domain-modeling,已裁決):對照 canonical terms 挑戰用語、模糊詞當場磨成 canonical term、具體邊界場景壓力測試、陳述拿代碼對質(引路徑)、定案術語即時寫入 glossary。Glossary 落點 = `docs/spec.md` 新 `## Canonical Terms` 段(不建 CONTEXT.md/docs/adr);ADR 三條件(難逆轉 × 無上下文會意外 × 真實 trade-off)作 notes→durable 的 promotion 過濾器。

## Scope / Non-scope

In scope:
- `assets/skill-commands/repo-harness-prd/SKILL.md`:新增三個協議步驟——(a) prior-art 觸發表與豁免、引用要求、sidecar_research 路由;(b) P0 module 負向 scenario 規則;(c) 五紀律(challenge 對象指向 `docs/spec.md` `## Canonical Terms`,定案術語 inline 回寫該段,glossary-only 一行一條)。
- PRD 模板(assets 源 + `.claude/templates/prd.template.md` 材化副本,保 parity;先確認 assets 側源檔實際路徑,若模板僅存在於 `.claude/templates/` 則同步其 scaffold 生成源):`## Acceptance Scenarios` 加負向 scenario 腳手架槽位(`Scenario N (negative): Given… When… Then <must NOT>… Machine-checkable evidence:`);`## Adjacent Patterns` 頭部註記「觸發表命中時必填」並回指 SKILL 協議。
- `docs/spec.md`:新增 `## Canonical Terms` 段,以本倉真實術語播種 3–5 條(如 plan / contract(=delegation brief)/ workstream / capability / task profile),一行一條,glossary-only。
- Notes 模板源(`plan-to-todo.sh` heredoc 或 assets 模板,以實際源為準,兩份 parity):`## Promotion Candidates` 加 ADR 三條件過濾行(三者全中才 promote,否則留 notes)。
- 測試:更新受影響的模板/scaffold 快照與斷言(bootstrap-files、scaffold-parity、helper-scripts 等,以 rg 掃描結果為準)。

Non-scope:
- `discover` skill 的五紀律整合(它住 user-level skill 家,不在本倉;獨立 follow-up)。
- `prd_ready_error` 對負向 scenario / prior-art 的機器硬閘(慣例先跑,證明價值後另開機器化小刀)。
- 新檔案類型(CONTEXT.md、docs/adr/——research note 已明確不採納)。
- Canonical Terms 的 hook 級 enforcement。
- WP5(frontend profile)。

## Approach

### Strategy
全部落在既有面:skill 協議文字、模板腳手架、spec 一個新段、notes 模板一行。零新腳本、零新 gate、零 schema。advisory 先行,機器化留給後續證明。

### Trade-offs
| Option | Pros | Cons | Decision |
|--------|------|------|----------|
| Skill 協議 + 模板腳手架,advisory(本案) | 最小;不擋新穎工作;慣例可先驗證 | 依賴 agent 遵從 | 採用 |
| prd_ready_error 機器硬閘 | 強制 | 「查過成熟方案」不可機器驗證;負向 scenario 的 grep 檢查易假陽/假陰 | 拒絕(留後續) |
| 新 CONTEXT.md + docs/adr | 照搬上游 skill | 與 spec.md/plans/notes 職能重複 | 拒絕(已裁決) |

## Detailed Design

### File Changes
| File | Action | Description |
|------|--------|-------------|
| `assets/skill-commands/repo-harness-prd/SKILL.md` | modify | 三個協議步驟(觸發表/負向 scenario/五紀律) |
| PRD 模板(assets 源 + `.claude/templates/` 副本) | modify | 負向 scenario 槽位 + Adjacent Patterns 註記 |
| `docs/spec.md` | modify | `## Canonical Terms` 段 + 3–5 條種子術語 |
| Notes 模板源(兩份 parity) | modify | ADR 三條件 promotion 過濾行 |
| tests(掃描確定) | modify | 快照/斷言更新 |

### Prior-art 觸發表(寫進 SKILL 的原文要點)
觸發:UI/taste、市場慣例模式、library/framework 選型、架構先例、`[UNVERIFIED]` 外部假設。命中 → Adjacent Patterns 必填(具名成熟組件/專案 + adopt/port/wrap vs build 理由),或引用 `docs/researches/<file>`;調研走 sidecar_research。豁免:純 bugfix、純內部重構、觸發面全未命中。

## Risk Assessment
| Risk | Likelihood | Impact | Mitigation |
|------|------------|--------|------------|
| 模板 assets/.claude 兩份漂移 | 中 | 中 | 先定位真源;兩份同改;若有 parity 檢查納入驗證 |
| scaffold 快照測試紅 | 高 | 低 | 同 PR 更新快照;`migrate --dry-run` 驗證 |
| spec.md 是 human-owned 面 | 低 | 低 | 純增段,不動既有內容 |

## Promotion Gate
- **Merge/PR unit**: 是,單一 PR to main。
- **Rollback surface**: revert branch `codex/intake-trigger-rules`;無資料遷移。
- **Verification boundary**: `bun test` + `bash scripts/check-task-workflow.sh --strict` + `bash scripts/migrate-project-template.sh --repo . --dry-run` + rg 驗證新協議字串到位。
- **Review/acceptance boundary**: review 檔 recommend pass(merge 時)。
- **High-risk surface**: 模板雙份 parity;scaffold 測試。
- **Why not checklist row**: merge_boundary——跨 skill/模板/spec/notes 四面,獨立回退與驗證邊界。

## Evidence Contract
- **State/progress path**: 本 plan `## Task Breakdown` + `tasks/contracts/<stem>.contract.md`。
- **Verification evidence**: 上列命令輸出。
- **Evaluator rubric**: contract exit_criteria 通過。
- **Stop condition**: Task Breakdown 全勾 + 驗證綠。
- **Rollback surface**: revert 分支;無資料遷移。

## Task Breakdown
- [x] `repo-harness-prd/SKILL.md`:觸發表 + 負向 scenario 規則 + 五紀律(challenge 指向 spec Canonical Terms)
- [x] PRD 模板兩份:負向 scenario 槽位 + Adjacent Patterns 觸發註記
- [x] `docs/spec.md`:`## Canonical Terms` 段 + 種子術語
- [x] Notes 模板源:ADR 三條件 promotion 過濾行(兩份 parity;落點為新增 `## Promotion Filter` 小節,理由見 notes Open Questions)
- [x] 測試/快照更新 + 全量驗證

## Verification
```bash
bun test
bash scripts/check-task-workflow.sh --strict
bash scripts/migrate-project-template.sh --repo . --dry-run
rg -n "Canonical Terms" docs/spec.md assets/ .claude/
rg -n "negative" .claude/templates/prd.template.md
rg -n "prior-art|Adjacent Patterns" assets/skill-commands/repo-harness-prd/SKILL.md
```

## Annotations
<!-- [NOTE]: prefixed inline. Claude processes all and revises. -->

## Task Breakdown
- [x] `repo-harness-prd/SKILL.md`:觸發表 + 負向 scenario 規則 + 五紀律(challenge 指向 spec Canonical Terms)
- [x] PRD 模板兩份:負向 scenario 槽位 + Adjacent Patterns 觸發註記
- [x] `docs/spec.md`:`## Canonical Terms` 段 + 種子術語
- [x] Notes 模板源:ADR 三條件 promotion 過濾行(兩份 parity;落點為新增 `## Promotion Filter` 小節,理由見 notes Open Questions)
- [x] 測試/快照更新 + 全量驗證
