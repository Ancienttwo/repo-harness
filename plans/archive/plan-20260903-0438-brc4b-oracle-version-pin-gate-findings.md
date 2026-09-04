> **Archived**: 2026-09-04 18:55
> **Related Plan**: plans/archive/plan-20260903-0438-brc4b-oracle-version-pin-gate-findings.md
> **Outcome**: Completed
> **Lifecycle**: plan
> **Parent Run ID**: run-20260904-1855
> **Archive Projection V1**: `plans/plan-20260903-0438-brc4b-oracle-version-pin-gate-findings.md` => `plans/archive/plan-20260903-0438-brc4b-oracle-version-pin-gate-findings.md`
> **Archive Projection V1**: `tasks/notes/20260903-0438-brc4b-oracle-version-pin-gate-findings.notes.md` => `tasks/archive/notes-20260904-1855-brc4b-oracle-version-pin-gate-findings.md`
> **Archive Projection V1**: `tasks/contracts/20260903-0438-brc4b-oracle-version-pin-gate-findings.contract.md` => `tasks/archive/contract-20260904-1855-brc4b-oracle-version-pin-gate-findings.md`
> **Archive Projection V1**: `tasks/reviews/20260903-0438-brc4b-oracle-version-pin-gate-findings.review.md` => `tasks/archive/review-20260904-1855-brc4b-oracle-version-pin-gate-findings.md`

# Plan: BRC4b — Oracle 版本 pin 抬到 0.18.0 並收掉 #290 gate findings

> **Status**: Archived
> **Created**: 20260903-0438
> **Slug**: brc4b-oracle-version-pin-gate-findings
> **Planning Source**: repo-harness-plan
> **Orchestration Kind**: host-plan
> **Source Ref**: (none)
> **Artifact Level**: work-package
> **Promotion Reason**: verification_boundary
> **Verification Boundary**: Commands named in the captured planning output plus `repo-harness run verify-contract --contract tasks/archive/contract-20260904-1855-brc4b-oracle-version-pin-gate-findings.md --strict`.
> **Rollback Surface**: Before execution remove `plans/archive/plan-20260903-0438-brc4b-oracle-version-pin-gate-findings.md`; after execution revert branch `codex/brc4b-oracle-version-pin-gate-findings` or the explicitly reviewed diff.
> **Spec**: `docs/spec.md`
> **Substantive Change SHA256**: `sha256:eb05ea4402cc21eb0ab8c35c4022239c10f45ce63fe6c6de29252521959d2823`
> **Research**: See `docs/researches/`
> **Task Contract**: `tasks/archive/contract-20260904-1855-brc4b-oracle-version-pin-gate-findings.md`
> **Task Review**: `tasks/archive/review-20260904-1855-brc4b-oracle-version-pin-gate-findings.md`
> **Implementation Notes**: `tasks/archive/notes-20260904-1855-brc4b-oracle-version-pin-gate-findings.md`

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

- Active plan: `plans/archive/plan-20260903-0438-brc4b-oracle-version-pin-gate-findings.md`
- Sprint contract: `tasks/archive/contract-20260904-1855-brc4b-oracle-version-pin-gate-findings.md`
- Sprint review: `tasks/archive/review-20260904-1855-brc4b-oracle-version-pin-gate-findings.md`
- Implementation notes: `tasks/archive/notes-20260904-1855-brc4b-oracle-version-pin-gate-findings.md`
- Deferred-goal ledger: `tasks/todos.md`
- Current checks: `.ai/harness/checks/latest.json`
- Run snapshots: `.ai/harness/runs/`
- Scope authority: `tasks/archive/contract-20260904-1855-brc4b-oracle-version-pin-gate-findings.md` `allowed_paths`
- Concurrency rule: `.ai/harness/active-plan` selects the active plan for this worktree when present; `.ai/harness/active-worktree` records the owning worktree. If another worktree already owns active work, open or switch to the matching worktree instead of serializing unrelated plans.
- Execution isolation: approved contract-level work projects through `repo-harness run plan-to-todo --plan plans/archive/plan-20260903-0438-brc4b-oracle-version-pin-gate-findings.md` and may start `repo-harness run contract-worktree start --plan plans/archive/plan-20260903-0438-brc4b-oracle-version-pin-gate-findings.md`.

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
- Contract file: `tasks/archive/contract-20260904-1855-brc4b-oracle-version-pin-gate-findings.md`
- Review file: `tasks/archive/review-20260904-1855-brc4b-oracle-version-pin-gate-findings.md`
- Implementation notes file: `tasks/archive/notes-20260904-1855-brc4b-oracle-version-pin-gate-findings.md`
- Template: `.claude/templates/contract.template.md`
- Verification command: `repo-harness run verify-contract --contract tasks/archive/contract-20260904-1855-brc4b-oracle-version-pin-gate-findings.md --strict`
- Active plan rule: this captured plan is written to `.ai/harness/active-plan` and the owning worktree is written to `.ai/harness/active-worktree` unless --no-active is used. Do not infer active execution from the latest non-archived plan.

## Handoff

- Checks file: `.ai/harness/checks/latest.json`
- Session handoff: `.ai/harness/handoff/current.md`

## Promotion Gate

- **Merge/PR unit**: Captured plan `plans/archive/plan-20260903-0438-brc4b-oracle-version-pin-gate-findings.md` is the proposed mergeable execution unit; revise before execute if this is only a checklist step.
- **Rollback surface**: Before execution remove `plans/archive/plan-20260903-0438-brc4b-oracle-version-pin-gate-findings.md`; after execution revert branch `codex/brc4b-oracle-version-pin-gate-findings` or the explicitly reviewed diff.
- **Verification boundary**: Commands named in the captured planning output plus `repo-harness run verify-contract --contract tasks/archive/contract-20260904-1855-brc4b-oracle-version-pin-gate-findings.md --strict`.
- **Review/acceptance boundary**: `tasks/archive/review-20260904-1855-brc4b-oracle-version-pin-gate-findings.md` must record pass against the captured acceptance criteria.
- **High-risk surface**: Risks named in captured planning output; keep the plan Draft if risk ownership is not concrete.
- **Why not checklist row**: verification_boundary

## Evidence Contract

- **State/progress path**: `plans/archive/plan-20260903-0438-brc4b-oracle-version-pin-gate-findings.md` task breakdown, `tasks/todos.md` deferred-goal ledger, `tasks/archive/contract-20260904-1855-brc4b-oracle-version-pin-gate-findings.md`, `tasks/archive/review-20260904-1855-brc4b-oracle-version-pin-gate-findings.md`, and `tasks/archive/notes-20260904-1855-brc4b-oracle-version-pin-gate-findings.md`
- **Verification evidence**: `.ai/harness/checks/latest.json`, `.ai/harness/runs/`, and the commands named in the captured planning output
- **Evaluator rubric**: `tasks/archive/review-20260904-1855-brc4b-oracle-version-pin-gate-findings.md` must record a passing Waza /check style recommendation
- **Stop condition**: all task breakdown items are complete, sprint verification passes, and the review recommends pass
- **Rollback surface**: Before execution remove `plans/archive/plan-20260903-0438-brc4b-oracle-version-pin-gate-findings.md`; after execution revert branch `codex/brc4b-oracle-version-pin-gate-findings` or the explicitly reviewed diff.

## Captured Planning Output

# BRC4b — Oracle 版本 pin 抬到 0.18.0 並收掉 #290 gate findings

## Context

PR #290（main@9e922e47）把有 profile 綁定時的 oracle 傳輸換成 `--copy-profile` + `--browser-chrome-profile`，gatekeeper PASS 但留下 5 條 findings。其中 HIGH 一條是既有狀態：`src/cli/chatgpt-browser/oracle-provider.ts:64` 的 `REQUIRED_ORACLE_VERSION = '0.14.1'` 精確匹配，本機唯一安裝的 oracle 是 0.18.0，`validateOracleVersion` 回 `ORACLE_VERSION_UNSUPPORTED`，`browser-doctor` 恆為 `action_required`，`--copy-profile` 這條新傳輸在原始碼 runtime 上一次真實往返都跑不到。這是 bugfix，不是新功能。

## Goal

`bun src/cli/index.ts chatgpt browser-doctor --provider oracle --json` 在本機（oracle 0.18.0）回 `status: "ready"`、`versionCompatible: true`、`missingCapabilities: []`；#290 gate 的四條 MEDIUM findings 全部收掉；全部既有測試綠。

## P1 map

- 版本權威：`oracle-provider.ts` `REQUIRED_ORACLE_VERSION` 與 `validateOracleVersion`（精確匹配，fail closed；設計意圖是「唯一被驗證過的 oracle 版本」，保留精確匹配語意，只抬值）。
- 能力集合：`detectCapabilities`（oracle-provider.ts）與 `EMPTY_ORACLE_CAPABILITIES`（engine.ts）決定 doctor readiness；`browserCookiePath` 自 #290 起永不發送。
- 失敗分類：`runOracleProvider` 在 spawn 後先看 `result.error`，再看 `result.status !== 0`，#290 新加的 stale-session 字串比對目前放在這兩者之外；文件明文「answer file 加行程終止狀態才是權威，stdout/stderr 只是 log」。
- session meta：`session-store.ts` 由 `profileDir` 推導 `browser.transport`，沒看 provider；native provider（deprecated）帶綁定時會寫成 `copy_profile`。
- 文件：`docs/repo-harness-chatgpt-browser-engine.md`、`assets/skills/repo-harness-chatgpt/references/*.md`、README 裡任何 `0.14.1` 字面串；`tests/readme-dx.test.ts` 斷言文檔字面串。

## P2 trace

`repo-harness chatgpt browser-doctor --provider oracle` → `engine.ts browserDoctor` → `resolveOracleBin` → `probeOracleVersion`（`oracle --version` = 0.18.0）→ `validateOracleVersion('0.18.0')` → `'0.18.0' !== '0.14.1'` → `compatible: false` → doctor `status: action_required`、`agent_actions[chatgpt-oracle-upgrade-pinned]`。壓力點就是那一個常數。

## P3 decision

- 保留精確匹配（不改成下限比較）：repo 的設計是 pin 一個被驗證過的 oracle 版本，`--browser-chrome-profile` 是 hidden flag，只能靠 pin 保證存在。值抬到 `0.18.0`。
- `browserCookiePath` 從 `OracleCapabilities` 與 readiness 集合整個移除（旗標已永不發送，探測它只會在 oracle 未來刪旗標時造成假性 not-ready；先刪過時再加新）。
- stale-session 比對收進 `result.status !== 0` 分支之下：exit 0 一律走 answer file 權威路徑。
- `browser.transport` 推導加入 provider：`oracle` + 綁定 → `copy_profile`；`oracle` 無綁定 → `oracle_session`；`native` → `native_profile`（新增第三個 enum 值，型別 `BrowserSessionTransport` 同步）。
- doc 第 217 行「oracle 拒絕 `--copy-profile` 與 `--browser-manual-login` 共存」經查 oracle 0.18.0 `dist/src/cli/browserConfig.js:90-91` 確實 throw，斷言成立，不改。

## Root Cause Evidence（Task Profile: bugfix）

- root_cause: `src/cli/chatgpt-browser/oracle-provider.ts:64` `REQUIRED_ORACLE_VERSION = '0.14.1'` 與已安裝的 oracle 0.18.0 精確匹配失敗，`validateOracleVersion` 回 `ORACLE_VERSION_UNSUPPORTED`。
- repro: `bun src/cli/index.ts chatgpt browser-doctor --provider oracle --json` → `status: action_required`。
- regression_guard: `tests/cli/chatgpt-browser.test.ts` 新增案例：oracle 0.18.0 help/version fixture 下 doctor 回 `ready`（未修時失敗）。
- pre_fix_failure_artifact: `.ai/harness/evidence/brc4b-pre-fix.txt`，用 `bun test <guard> > <artifact> 2>&1; echo "PRE_FIX_EXIT=$?" >> <artifact>` 在未修代碼上擷取。

## File Changes

| File | Action | Description |
|------|--------|-------------|
| `src/cli/chatgpt-browser/oracle-provider.ts` | modify | pin `0.18.0`；移除 `browserCookiePath` 能力；stale-session 比對移到非零 exit 分支內 |
| `src/cli/chatgpt-browser/engine.ts` | modify | `EMPTY_ORACLE_CAPABILITIES` 移除 `browserCookiePath`；doctor readiness 隨之 |
| `src/cli/chatgpt-browser/types.ts` | modify | `BrowserSessionTransport` 加 `native_profile` |
| `src/cli/chatgpt-browser/session-store.ts` | modify | transport 推導看 provider |
| `tests/cli/chatgpt-browser.test.ts` | modify | fixture 0.14.1→0.18.0；新增 regression guard；stale-session 只在非零 exit；native transport；能力集合無 `browserCookiePath` |
| `docs/repo-harness-chatgpt-browser-engine.md`、`assets/skills/repo-harness-chatgpt/references/*.md`、README | modify | `0.14.1` 字面串與 cookie-path 能力描述同步；先 `rg -n "0\.14\.1|browserCookiePath" docs assets README.md tests` |

## Task Breakdown

- [x] 擷取 pre-fix artifact：先寫 regression guard，在未修代碼上跑並存 `.ai/harness/evidence/brc4b-pre-fix.txt`（含 `PRE_FIX_EXIT=非零`）
- [x] 抬 pin 到 `0.18.0`，doctor 本機回 ready
- [x] 移除 `browserCookiePath` 能力與 readiness 依賴，更新測試與 doctor JSON 斷言
- [x] stale-session 比對收進非零 exit 分支，補「exit 0 且 log 含該句仍以 answer file 為準」的測試
- [x] transport 推導加 provider，補 native 測試
- [x] 文檔與 assets 字面串同步，`bun test tests/readme-dx.test.ts` 綠
- [ ] contract 填 Root Cause Evidence 四欄、Change Assessment oracles（物件陣列）、Exit Criteria；`verify-contract --strict`、`check-task-workflow --strict`、merge-base `check-task-sync`、`check-architecture-sync` 全綠
- [ ] Codex read-only review → AcceptanceReceipt → `verify-sprint`；PR 直接 `gh pr create`，不跑 finish

## Verification

```bash
bun test tests/cli/chatgpt-browser.test.ts --timeout 60000
bun test tests/readme-dx.test.ts --timeout 60000
bun run check:type
bun src/cli/index.ts chatgpt browser-doctor --provider oracle --json
repo-harness run verify-contract --contract tasks/contracts/<stem>.contract.md --strict
repo-harness run check-task-workflow --strict
REPO_HARNESS_DIFF_BASE=origin/main REPO_HARNESS_DIFF_MODE=merge-base bash scripts/check-task-sync.sh
bash scripts/check-architecture-sync.sh
```

## Rollback

Revert branch `codex/brc4b-oracle-version-pin-gate-findings`；沒有資料或協定變更。

## Annotations
<!-- [NOTE]: prefixed inline. Claude processes all and revises. -->

## Task Breakdown
- [x] 擷取 pre-fix artifact：先寫 regression guard，在未修代碼上跑並存 `.ai/harness/evidence/brc4b-pre-fix.txt`（含 `PRE_FIX_EXIT=非零`）
- [x] 抬 pin 到 `0.18.0`，doctor 本機回 ready
- [x] 移除 `browserCookiePath` 能力與 readiness 依賴，更新測試與 doctor JSON 斷言
- [x] stale-session 比對收進非零 exit 分支，補「exit 0 且 log 含該句仍以 answer file 為準」的測試
- [x] transport 推導加 provider，補 native 測試
- [x] 文檔與 assets 字面串同步，`bun test tests/readme-dx.test.ts` 綠
- [ ] contract 填 Root Cause Evidence 四欄、Change Assessment oracles（物件陣列）、Exit Criteria；`verify-contract --strict`、`check-task-workflow --strict`、merge-base `check-task-sync`、`check-architecture-sync` 全綠
- [ ] Codex read-only review → AcceptanceReceipt → `verify-sprint`；PR 直接 `gh pr create`，不跑 finish
