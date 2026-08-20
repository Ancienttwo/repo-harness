# Plan: obsidian-memory skill-surface 收編：manifest 註冊 + installer 雙側投影 + 邊界測試

> **Status**: Archived
> **Created**: 20260816-0411
> **Slug**: obsidian-memory-skill-surface
> **Planning Source**: repo-harness-plan
> **Orchestration Kind**: host-plan
> **Source Ref**: (none)
> **Artifact Level**: work-package
> **Promotion Reason**: merge_boundary
> **Verification Boundary**: Commands named in the captured planning output plus `repo-harness run verify-contract --contract tasks/contracts/20260816-0411-obsidian-memory-skill-surface.contract.md --strict`.
> **Rollback Surface**: Before execution remove `plans/plan-20260816-0411-obsidian-memory-skill-surface.md`; after execution revert branch `codex/obsidian-memory-skill-surface` or the explicitly reviewed diff.
> **Spec**: `docs/spec.md`
> **Research**: See `docs/researches/`
> **Task Contract**: `tasks/contracts/20260816-0411-obsidian-memory-skill-surface.contract.md`
> **Task Review**: `tasks/reviews/20260816-0411-obsidian-memory-skill-surface.review.md`
> **Implementation Notes**: `tasks/notes/20260816-0411-obsidian-memory-skill-surface.notes.md`

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

- Active plan: `plans/plan-20260816-0411-obsidian-memory-skill-surface.md`
- Sprint contract: `tasks/contracts/20260816-0411-obsidian-memory-skill-surface.contract.md`
- Sprint review: `tasks/reviews/20260816-0411-obsidian-memory-skill-surface.review.md`
- Implementation notes: `tasks/notes/20260816-0411-obsidian-memory-skill-surface.notes.md`
- Deferred-goal ledger: `tasks/todos.md`
- Current checks: `.ai/harness/checks/latest.json`
- Run snapshots: `.ai/harness/runs/`
- Scope authority: `tasks/contracts/20260816-0411-obsidian-memory-skill-surface.contract.md` `allowed_paths`
- Concurrency rule: `.ai/harness/active-plan` selects the active plan for this worktree when present; `.ai/harness/active-worktree` records the owning worktree. If another worktree already owns active work, open or switch to the matching worktree instead of serializing unrelated plans.
- Execution isolation: approved contract-level work projects through `repo-harness run plan-to-todo --plan plans/plan-20260816-0411-obsidian-memory-skill-surface.md` and may start `repo-harness run contract-worktree start --plan plans/plan-20260816-0411-obsidian-memory-skill-surface.md`.

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
- Contract file: `tasks/contracts/20260816-0411-obsidian-memory-skill-surface.contract.md`
- Review file: `tasks/reviews/20260816-0411-obsidian-memory-skill-surface.review.md`
- Implementation notes file: `tasks/notes/20260816-0411-obsidian-memory-skill-surface.notes.md`
- Template: `.claude/templates/contract.template.md`
- Verification command: `repo-harness run verify-contract --contract tasks/contracts/20260816-0411-obsidian-memory-skill-surface.contract.md --strict`
- Active plan rule: this captured plan is written to `.ai/harness/active-plan` and the owning worktree is written to `.ai/harness/active-worktree` unless --no-active is used. Do not infer active execution from the latest non-archived plan.

## Handoff

- Checks file: `.ai/harness/checks/latest.json`
- Session handoff: `.ai/harness/handoff/current.md`

## Promotion Gate

- **Merge/PR unit**: Captured plan `plans/plan-20260816-0411-obsidian-memory-skill-surface.md` is the proposed mergeable execution unit; revise before execute if this is only a checklist step.
- **Rollback surface**: Before execution remove `plans/plan-20260816-0411-obsidian-memory-skill-surface.md`; after execution revert branch `codex/obsidian-memory-skill-surface` or the explicitly reviewed diff.
- **Verification boundary**: Commands named in the captured planning output plus `repo-harness run verify-contract --contract tasks/contracts/20260816-0411-obsidian-memory-skill-surface.contract.md --strict`.
- **Review/acceptance boundary**: `tasks/reviews/20260816-0411-obsidian-memory-skill-surface.review.md` must record pass against the captured acceptance criteria.
- **High-risk surface**: Risks named in captured planning output; keep the plan Draft if risk ownership is not concrete.
- **Why not checklist row**: merge_boundary

## Evidence Contract

- **State/progress path**: `plans/plan-20260816-0411-obsidian-memory-skill-surface.md` task breakdown, `tasks/todos.md` deferred-goal ledger, `tasks/contracts/20260816-0411-obsidian-memory-skill-surface.contract.md`, `tasks/reviews/20260816-0411-obsidian-memory-skill-surface.review.md`, and `tasks/notes/20260816-0411-obsidian-memory-skill-surface.notes.md`
- **Verification evidence**: `.ai/harness/checks/latest.json`, `.ai/harness/runs/`, and the commands named in the captured planning output
- **Evaluator rubric**: `tasks/reviews/20260816-0411-obsidian-memory-skill-surface.review.md` must record a passing Waza /check style recommendation
- **Stop condition**: all task breakdown items are complete, sprint verification passes, and the review recommends pass
- **Rollback surface**: Before execution remove `plans/plan-20260816-0411-obsidian-memory-skill-surface.md`; after execution revert branch `codex/obsidian-memory-skill-surface` or the explicitly reviewed diff.

## Captured Planning Output

# obsidian-memory skill-surface 收編：manifest 註冊 + installer 雙側投影 + 邊界測試

## Goal

把手工安裝的 `obsidian-memory` skill（跨項目 Obsidian 長期記憶：recall/persist/init 判斷層）收編為 repo-harness repo-owned skill：源碼落 `assets/skills/obsidian-memory/SKILL.md`，在 skill-surface manifest 註冊為 `kind:"facade"`，經既有 installer 鏈投影到 `~/.claude/skills` 與 `~/.codex/skills`，官方 Obsidian skills 聲明為 runtime-referenced 依賴並掛環境檢查，authority 邊界（repo → brain 單向、hooks 永不調用）由測試固化。

## P1 Architecture Map

- 發佈鏈：`assets/skill-commands/manifest.json`（packages[] v2）→ `src/core/skill-surface/catalog.ts`（`SkillSurfacePackage`，catalog.ts:49-65）→ `scripts/skill-surface-select.ts` `facade-sources`/`profile-projection` → `scripts/sync-codex-installed-copies.sh` `sync_command_facades()`（:385-414，對兩個 host root symlink/rsync）→ `src/cli/commands/global-runtime.ts` `syncRuntimeSkill()`（:607-620）。
- 防漂移：`.repo-harness-owner.json` owner marker + `managed_tree_hash`，unowned/modified dest fail-closed（sync-codex-installed-copies.sh:197-257）。
- 既有測試面：`tests/skill-surface/catalog.test.ts`、`mutation-path-coverage.test.ts`（新 package 自動被 `mutationPathSkillNames()` 拾取）、`retired-names-scan.test.ts`、`tests/installed-copy-sync.test.ts`（端到端 shell 同步）、`tests/hook-contracts.test.ts:233`（workflow 驗證禁 gate 外部 vault 狀態）。
- runtime-referenced 依賴模式：`scripts/check-agent-tooling.sh` `CODEX_AUTOMATION_SKILLS`（:103）+ `inspectCodexAutomationSkill`（:822）+ `required_skills` 報告（:835）。
- 倉庫現況：`rg -i obsidian` 零匹配，全新能力面。
- Out of scope：`sync-brain-docs`/brain-manifest 鏈路（已存在且正確）、hook 層任何 vault 讀寫、SessionStart 提示行（見 Non-Goals）。

## P2 Concrete Trace

manifest 加 facade 條目（`source:"assets/skills/obsidian-memory"`，`provider:null`，hosts 兩側，profiles 對齊 `repo-harness-plan` 條目 [ASSUMED：同屬「規劃/知識輔助」類]）→ `facadeSources()` 無條件收錄 → `facade_selected` 按 profile 過濾 → `sync_command_facades()` 投影到 `$CLAUDE_SKILLS_ROOT/obsidian-memory` 與 `$CODEX_SKILLS_ROOT/obsidian-memory` 並寫 owner marker → `tests/installed-copy-sync.test.ts` 既有用例（遍歷所有 facade）自動覆蓋新條目 → `expectedProjections` 自一致塊（manifest.json:321-359）必須同步加入，否則 catalog 一致性校驗失敗。壓力點：本機兩側已有**手工無 marker 副本**，installer 對 unowned dest fail-closed——這是設計正確行為，本機收編步驟必須先刪手工副本再跑 installer（記入 notes，屬本機操作非代碼）。

## P3 Design Decision

- 為何 facade：需要對稱雙側投影 + owner-marker 防漂移 + profile 門控，`sync_command_facades` 全部現成；`integration`/`provider-skill` 走非對稱 host placement，不符合。不新增任何抽象。
- 為何 runtime-referenced 而非 vendor 官方 skills：倉庫慣例（root CLAUDE.md「runtime-referenced, not vendored」，health/check/diagram-design 先例）；vendor 背上游同步與授權負擔。
- 必守 invariant：hooks 與 workflow checks 永不讀寫外部 vault 狀態（hook-contracts.test.ts:233 已固化）；本 skill 只能由模型/用戶顯式調用；authority 方向恒為 repo → brain。
- 10x：facade 數量增長由既有 manifest/測試面線性承載，無新失效點；vault 內容規模與本鏈路無耦合。

## Scope

1. `assets/skills/obsidian-memory/SKILL.md`：收編現行 `~/.claude/skills/obsidian-memory/SKILL.md` 內容（雙讀者契約、fail-closed vault 解析、官方 skill 硬依賴、authority 邊界、價值/敏感閘門）。
2. `assets/skill-commands/manifest.json`：新增 facade 條目 + `expectedProjections` 同步。
3. `scripts/check-agent-tooling.sh`：新增 `OBSIDIAN_RUNTIME_SKILLS = ["obsidian-markdown", "obsidian-cli"]` 常量、兩側 host 的 inspect 探測與 `required_skills` 類報告條目，鏡像 `CODEX_AUTOMATION_SKILLS` 形狀；缺失時報告 gap（與既有行為一致），不硬阻斷。
4. 測試：新增 `tests/skill-surface/obsidian-memory-contract.test.ts` 斷言 (a) manifest 條目存在且 kind/hosts/source 正確、(b) `assets/skills/obsidian-memory/SKILL.md` 存在且 frontmatter name 正確、含「repo → brain」單向與 fail-closed 條款字面、(c) `src/cli/hook/` 全樹零 `obsidian-memory` 引用（hooks 永不調用）。既有 catalog/installed-copy-sync 測試如需 fixture 更新一併修。
5. `docs/reference-configs/external-tooling.md`：加一段 runtime-referenced 官方 Obsidian skills 聲明。
6. `tasks/todos.md`：SessionStart 提示行作為 deferred goal 落帳（tradeoff + revisit trigger：首次觀察到模型在該召回時漏召回）。

## Non-Goals

- 不加 SessionStart section（無先例、可選增強，推遲）。
- 不 vendor `obsidian-markdown`/`obsidian-cli`/`obsidian`/`obsidian-bases` 進 repo。
- 不動 `sync-brain-docs`、brain-manifest、任何 hook handler。
- 不做 vault 內容遷移或 sub-vault 初始化（那是 skill 運行時行為）。
- EXECUTION_BOUNDARY：未列項是禁區，不順手改進。

## Verification

- `bun test tests/skill-surface tests/installed-copy-sync.test.ts tests/hook-contracts.test.ts`
- `bun test`（全量；對照既有 6 個預存失敗基線，不得新增失敗）
- `bash scripts/check-agent-tooling.sh --host both`（新報告條目出現）
- `bun src/cli/index.ts init --repo . --dry-run`
- `repo-harness run check-task-workflow --strict`
- `bash scripts/check-architecture-sync.sh && bash scripts/check-task-sync.sh && bash scripts/check-deploy-sql-order.sh`

## Task Breakdown

- [ ] T1 收編 SKILL.md 至 `assets/skills/obsidian-memory/`
- [ ] T2 manifest facade 條目 + expectedProjections
- [ ] T3 check-agent-tooling runtime-referenced 依賴聲明
- [ ] T4 邊界測試 `obsidian-memory-contract.test.ts` + 既有測試 fixture 對齊
- [ ] T5 external-tooling.md 文檔段 + todos.md deferred 條目
- [ ] T6 全量驗證 + gatekeeper 驗收 + ship（commit/push/PR）

## Annotations
<!-- [NOTE]: prefixed inline. Claude processes all and revises. -->

## Task Breakdown
- [ ] T1 收編 SKILL.md 至 `assets/skills/obsidian-memory/`
- [ ] T2 manifest facade 條目 + expectedProjections
- [ ] T3 check-agent-tooling runtime-referenced 依賴聲明
- [ ] T4 邊界測試 `obsidian-memory-contract.test.ts` + 既有測試 fixture 對齊
- [ ] T5 external-tooling.md 文檔段 + todos.md deferred 條目
- [ ] T6 全量驗證 + gatekeeper 驗收 + ship（commit/push/PR）
