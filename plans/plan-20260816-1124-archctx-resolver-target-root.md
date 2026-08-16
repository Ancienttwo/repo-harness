# Plan: archctx resolver 目標 repo 優先解析

> **Status**: Executing
> **Created**: 20260816-1124
> **Slug**: archctx-resolver-target-root
> **Planning Source**: repo-harness-plan
> **Orchestration Kind**: host-plan
> **Source Ref**: (none)
> **Artifact Level**: work-package
> **Promotion Reason**: rollback_boundary
> **Verification Boundary**: Commands named in the captured planning output plus `repo-harness run verify-contract --contract tasks/contracts/20260816-1124-archctx-resolver-target-root.contract.md --strict`.
> **Rollback Surface**: Before execution remove `plans/plan-20260816-1124-archctx-resolver-target-root.md`; after execution revert branch `codex/archctx-resolver-target-root` or the explicitly reviewed diff.
> **Spec**: `docs/spec.md`
> **Research**: See `docs/researches/`
> **Task Contract**: `tasks/contracts/20260816-1124-archctx-resolver-target-root.contract.md`
> **Task Review**: `tasks/reviews/20260816-1124-archctx-resolver-target-root.review.md`
> **Implementation Notes**: `tasks/notes/20260816-1124-archctx-resolver-target-root.notes.md`

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

- Active plan: `plans/plan-20260816-1124-archctx-resolver-target-root.md`
- Sprint contract: `tasks/contracts/20260816-1124-archctx-resolver-target-root.contract.md`
- Sprint review: `tasks/reviews/20260816-1124-archctx-resolver-target-root.review.md`
- Implementation notes: `tasks/notes/20260816-1124-archctx-resolver-target-root.notes.md`
- Deferred-goal ledger: `tasks/todos.md`
- Current checks: `.ai/harness/checks/latest.json`
- Run snapshots: `.ai/harness/runs/`
- Scope authority: `tasks/contracts/20260816-1124-archctx-resolver-target-root.contract.md` `allowed_paths`
- Concurrency rule: `.ai/harness/active-plan` selects the active plan for this worktree when present; `.ai/harness/active-worktree` records the owning worktree. If another worktree already owns active work, open or switch to the matching worktree instead of serializing unrelated plans.
- Execution isolation: approved contract-level work projects through `repo-harness run plan-to-todo --plan plans/plan-20260816-1124-archctx-resolver-target-root.md` and may start `repo-harness run contract-worktree start --plan plans/plan-20260816-1124-archctx-resolver-target-root.md`.

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
- Contract file: `tasks/contracts/20260816-1124-archctx-resolver-target-root.contract.md`
- Review file: `tasks/reviews/20260816-1124-archctx-resolver-target-root.review.md`
- Implementation notes file: `tasks/notes/20260816-1124-archctx-resolver-target-root.notes.md`
- Template: `.claude/templates/contract.template.md`
- Verification command: `repo-harness run verify-contract --contract tasks/contracts/20260816-1124-archctx-resolver-target-root.contract.md --strict`
- Active plan rule: this captured plan is written to `.ai/harness/active-plan` and the owning worktree is written to `.ai/harness/active-worktree` unless --no-active is used. Do not infer active execution from the latest non-archived plan.

## Handoff

- Checks file: `.ai/harness/checks/latest.json`
- Session handoff: `.ai/harness/handoff/current.md`

## Promotion Gate

- **Merge/PR unit**: Captured plan `plans/plan-20260816-1124-archctx-resolver-target-root.md` is the proposed mergeable execution unit; revise before execute if this is only a checklist step.
- **Rollback surface**: Before execution remove `plans/plan-20260816-1124-archctx-resolver-target-root.md`; after execution revert branch `codex/archctx-resolver-target-root` or the explicitly reviewed diff.
- **Verification boundary**: Commands named in the captured planning output plus `repo-harness run verify-contract --contract tasks/contracts/20260816-1124-archctx-resolver-target-root.contract.md --strict`.
- **Review/acceptance boundary**: `tasks/reviews/20260816-1124-archctx-resolver-target-root.review.md` must record pass against the captured acceptance criteria.
- **High-risk surface**: Risks named in captured planning output; keep the plan Draft if risk ownership is not concrete.
- **Why not checklist row**: rollback_boundary

## Evidence Contract

- **State/progress path**: `plans/plan-20260816-1124-archctx-resolver-target-root.md` task breakdown, `tasks/todos.md` deferred-goal ledger, `tasks/contracts/20260816-1124-archctx-resolver-target-root.contract.md`, `tasks/reviews/20260816-1124-archctx-resolver-target-root.review.md`, and `tasks/notes/20260816-1124-archctx-resolver-target-root.notes.md`
- **Verification evidence**: `.ai/harness/checks/latest.json`, `.ai/harness/runs/`, and the commands named in the captured planning output
- **Evaluator rubric**: `tasks/reviews/20260816-1124-archctx-resolver-target-root.review.md` must record a passing Waza /check style recommendation
- **Stop condition**: all task breakdown items are complete, sprint verification passes, and the review recommends pass
- **Rollback surface**: Before execution remove `plans/plan-20260816-1124-archctx-resolver-target-root.md`; after execution revert branch `codex/archctx-resolver-target-root` or the explicitly reviewed diff.

## Captured Planning Output

# archctx resolver 目標 repo 優先解析：關閉發版→全域刷新阻塞窗口

## Goal

`resolvePackageLocalArchctx` 的解析起點從「運行中 CLI 的 consumerRoot」改為「目標 repo root 優先」：repo vendor 了 archctx 就必須用 repo 的（精確版本匹配，不匹配即 fail），repo 沒 vendor 才回到 CLI consumerRoot（現行為）。消除每次 archctx 升版時全域 CLI 舊 archctx 撞新 repo policy 反覆阻塞 Stop 的窗口（0.14.x 與 2026-08-16 各燒過一次）。

## P1 Architecture Map

- 全部在 `src/effects/architecture/archctx-provider.ts`：`resolvePackageLocalArchctx`（:88，版本/engines/bin/escape 檢查已 fail-closed）、`findInstalledArchctxPackageRoot`（:328，從 consumerRoot 向上爬 node_modules）、`findConsumerRoot`（:345，從 import.meta.dir 向上找 repo-harness package root）。
- 兩個調用點：`archctxCapabilities`（:153）與 readiness 路徑，均為 `options.consumerRoot ?? findConsumerRoot()`，且**都持有 `repoRoot` 參數**。
- 測試面：`tests/architecture-projection-provider.test.ts`（覆蓋 resolvePackageLocalArchctx）、`tests/architecture-projection-orchestration.test.ts`。
- Out of scope：archctx 上游、drain/queue 邏輯、Stop gate 邏輯、`ArchctxProviderOptions.consumerRoot` 顯式傳入語義（保留為測試/調用方覆寫口）。

## P2 Concrete Trace

Stop hook（全域 bun CLI 0.15.1）→ drain 探針 → `archctxCapabilities(repoRoot)` → `resolvePackageLocalArchctx(findConsumerRoot()=全域包根, "0.4.3")` → 全域包 node_modules/archctx = 0.4.2 → mismatch throw → strict gate 攔 Stop。而 `repoRoot` 的 `node_modules/archctx` 是 0.4.3，一直沒被看過。壓力點即 :153 的 `options.consumerRoot ?? findConsumerRoot()`。

## P3 Design Decision

- 語義規則（無 fallback 鏈掩蓋）：
  1. `join(repoRoot, 'node_modules/archctx')` 存在（沿 repoRoot 向上爬到第一個命中）→ 必須精確匹配 requiredVersion，否則 throw（repo policy 與 repo vendor 自相矛盾，不得用 CLI 的來洗白）。
  2. repo 依賴樹完全沒有 archctx → 用現行 consumerRoot 解析（下游 repo 用全域 CLI 的既有正當場景），精確匹配否則 throw。
- 錯誤訊息必須指名解析自哪個 root、期望/實際版本，兩條路徑失敗語義可區分。
- 保留 `options.consumerRoot` 顯式覆寫優先於一切（測試與調用方契約不變）。
- 這是解析搜索順序（類 node resolution），不是語義 fallback；版本斷言在兩條路徑上同樣 fail-closed。

## Scope

1. `src/effects/architecture/archctx-provider.ts`：新增 repoRoot 優先解析（簽名建議 `resolvePackageLocalArchctx(consumerRoot, requiredVersion, opts?)` 之上加一個以 repoRoot 為首選根的入口或改造兩個調用點；worker 按最小 diff 選型並在 notes 記錄），兩個調用點改為傳入 repoRoot 優先。
2. `tests/architecture-projection-provider.test.ts` 新增回歸：(a) repo vendor 匹配版本 + CLI 根不匹配 → 解析 repo 的（今天的窗口場景，未修時必 fail）；(b) repo vendor 錯版本 + CLI 根正確 → throw（不掩蓋）；(c) repo 無 vendor → 走 consumerRoot 現行為。
3. `tasks/todos.md`：刪除已兌現的 `resolvePackageLocalArchctx` deferred 條目。

## Non-Goals

- 不動 drain/queue/Stop gate、不動 archctx 版本錨點、不做多級 fallback 鏈、不改 `REPO_HARNESS_NODE_BIN` runtime 解析。
- EXECUTION_BOUNDARY：未列項是禁區。

## Verification

- 回歸測試 (a) 必須先在未修代碼上失敗（bugfix profile 的 pre-fix artifact）
- `bun test tests/architecture-projection-provider.test.ts tests/architecture-projection-orchestration.test.ts`
- `bun test`（全量 0 新增失敗）
- `bun run check:type`
- 實盤驗證：修復後用**全域 CLI**（archctx 0.4.2）對本 repo 跑 `repo-harness architecture-projection drain --json` 應成功解析 repo-local 0.4.3（今天的復現場景轉綠）

## Task Breakdown

- [ ] T1 resolver repoRoot 優先解析 + 調用點改造
- [ ] T2 三個回歸場景測試（含 pre-fix failure artifact）
- [ ] T3 todos 條目兌現刪除
- [ ] T4 全量驗證 + 實盤全域 CLI drain 復驗 + gatekeeper + ship

## Annotations
<!-- [NOTE]: prefixed inline. Claude processes all and revises. -->

## Task Breakdown
- [ ] T1 resolver repoRoot 優先解析 + 調用點改造
- [ ] T2 三個回歸場景測試（含 pre-fix failure artifact）
- [ ] T3 todos 條目兌現刪除
- [ ] T4 全量驗證 + 實盤全域 CLI drain 復驗 + gatekeeper + ship
