# Plan: Fix MCP allowed-root canonicalization false denial for /private/tmp

> **Status**: Executing
> **Created**: 20260730-2346
> **Slug**: mcp-allowed-root-canonicalization
> **Planning Source**: codex-plan-or-waza-think
> **Orchestration Kind**: host-plan
> **Source Ref**: (none)
> **Artifact Level**: work-package
> **Promotion Reason**: merge_boundary
> **Verification Boundary**: Commands named in the captured planning output plus `repo-harness run verify-contract --contract tasks/contracts/20260730-2346-mcp-allowed-root-canonicalization.contract.md --strict`.
> **Rollback Surface**: Before execution remove `plans/plan-20260730-2346-mcp-allowed-root-canonicalization.md`; after execution revert branch `codex/mcp-allowed-root-canonicalization` or the explicitly reviewed diff.
> **Spec**: `docs/spec.md`
> **Research**: See `docs/researches/`
> **Task Contract**: `tasks/contracts/20260730-2346-mcp-allowed-root-canonicalization.contract.md`
> **Task Review**: `tasks/reviews/20260730-2346-mcp-allowed-root-canonicalization.review.md`
> **Implementation Notes**: `tasks/notes/20260730-2346-mcp-allowed-root-canonicalization.notes.md`

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

- Active plan: `plans/plan-20260730-2346-mcp-allowed-root-canonicalization.md`
- Sprint contract: `tasks/contracts/20260730-2346-mcp-allowed-root-canonicalization.contract.md`
- Sprint review: `tasks/reviews/20260730-2346-mcp-allowed-root-canonicalization.review.md`
- Implementation notes: `tasks/notes/20260730-2346-mcp-allowed-root-canonicalization.notes.md`
- Deferred-goal ledger: `tasks/todos.md`
- Current checks: `.ai/harness/checks/latest.json`
- Run snapshots: `.ai/harness/runs/`
- Scope authority: `tasks/contracts/20260730-2346-mcp-allowed-root-canonicalization.contract.md` `allowed_paths`
- Concurrency rule: `.ai/harness/active-plan` selects the active plan for this worktree when present; `.ai/harness/active-worktree` records the owning worktree. If another worktree already owns active work, open or switch to the matching worktree instead of serializing unrelated plans.
- Execution isolation: approved contract-level work projects through `repo-harness run plan-to-todo --plan plans/plan-20260730-2346-mcp-allowed-root-canonicalization.md` and may start `repo-harness run contract-worktree start --plan plans/plan-20260730-2346-mcp-allowed-root-canonicalization.md`.

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
- Contract file: `tasks/contracts/20260730-2346-mcp-allowed-root-canonicalization.contract.md`
- Review file: `tasks/reviews/20260730-2346-mcp-allowed-root-canonicalization.review.md`
- Implementation notes file: `tasks/notes/20260730-2346-mcp-allowed-root-canonicalization.notes.md`
- Template: `.claude/templates/contract.template.md`
- Verification command: `repo-harness run verify-contract --contract tasks/contracts/20260730-2346-mcp-allowed-root-canonicalization.contract.md --strict`
- Active plan rule: this captured plan is written to `.ai/harness/active-plan` and the owning worktree is written to `.ai/harness/active-worktree` unless --no-active is used. Do not infer active execution from the latest non-archived plan.

## Handoff

- Checks file: `.ai/harness/checks/latest.json`
- Session handoff: `.ai/harness/handoff/current.md`

## Promotion Gate

- **Merge/PR unit**: Captured plan `plans/plan-20260730-2346-mcp-allowed-root-canonicalization.md` is the proposed mergeable execution unit; revise before execute if this is only a checklist step.
- **Rollback surface**: Before execution remove `plans/plan-20260730-2346-mcp-allowed-root-canonicalization.md`; after execution revert branch `codex/mcp-allowed-root-canonicalization` or the explicitly reviewed diff.
- **Verification boundary**: Commands named in the captured planning output plus `repo-harness run verify-contract --contract tasks/contracts/20260730-2346-mcp-allowed-root-canonicalization.contract.md --strict`.
- **Review/acceptance boundary**: `tasks/reviews/20260730-2346-mcp-allowed-root-canonicalization.review.md` must record pass against the captured acceptance criteria.
- **High-risk surface**: Risks named in captured planning output; keep the plan Draft if risk ownership is not concrete.
- **Why not checklist row**: merge_boundary

## Evidence Contract

- **State/progress path**: `plans/plan-20260730-2346-mcp-allowed-root-canonicalization.md` task breakdown, `tasks/todos.md` deferred-goal ledger, `tasks/contracts/20260730-2346-mcp-allowed-root-canonicalization.contract.md`, `tasks/reviews/20260730-2346-mcp-allowed-root-canonicalization.review.md`, and `tasks/notes/20260730-2346-mcp-allowed-root-canonicalization.notes.md`
- **Verification evidence**: `.ai/harness/checks/latest.json`, `.ai/harness/runs/`, and the commands named in the captured planning output
- **Evaluator rubric**: `tasks/reviews/20260730-2346-mcp-allowed-root-canonicalization.review.md` must record a passing Waza /check style recommendation
- **Stop condition**: all task breakdown items are complete, sprint verification passes, and the review recommends pass
- **Rollback surface**: Before execution remove `plans/plan-20260730-2346-mcp-allowed-root-canonicalization.md`; after execution revert branch `codex/mcp-allowed-root-canonicalization` or the explicitly reviewed diff.

## Captured Planning Output

# 修復 MCP allowed-root canonicalization 誤殺(policy.ts)

## Context

root-cause-prover 以 runtime probe 證實(2026-07-30):`src/cli/mcp/policy.ts:36` 的 canonicalization 豁免只認 `parts[0]==='private' && parts[1]==='var'`,因此 `src/cli/mcp/workspaces.ts:215` 的 `realpathSync` 把 `/tmp/...` 解成 `/private/tmp/...` 後,`policy.ts:39` 用 repo-relative deny glob `private/**`(`policy.ts:18`)命中 realpath 注入的路徑段——category error,該 glob 本是給 repo 內相對路徑拒絕用的。結果 `workspaces.ts:219-225` 把合法 root 標 `readable:false` 且不記 reason,`reader-tools.ts:222` 的 `configured_root_count` 歸零,11 個 MCP 測試在共享 TMPDIR 下翻紅,verify-sprint 完成閘因此擋住兩個已驗收 work-package。歷史:`2acd7a49`(2026-06-22)修過同型 bug 但只補了 `/private/var` 一個實例,漏了 sibling。

這是生產缺陷不是測試問題:macOS 真實用戶把 allowed root 配在 `/tmp` 下(或任何 realpath 帶 canonicalization 前綴的路徑)會被同一條路靜默拒絕。

## 修復面(唯一改動的生產檔)

`src/cli/mcp/policy.ts` — `partsContainDeniedRoot`(:34-43)+ `sensitiveAllowedRootReason`(:45):把「剝離平台 canonicalization 前綴」提到 deny-glob 比對之前做一次(`/private/var` 與 `/private/tmp` 同屬 macOS realpath artifact),取代寫死在 matcher 迴圈裡的 `index===0 && parts[1]==='var'` 單一特例。

已由 scratch probe 驗證的 7 個判例(修復後必須全對):

| 輸入 | 期望 |
|---|---|
| `/private/tmp/...` | 放行 |
| `/private/var/folders/...` | 放行 |
| `/var/folders/...` | 放行 |
| `/Users/example/private/repo` | 拒(`private/**`) |
| `/Users/example/secrets/repo` | 拒(`secrets/**`) |
| `.../node_modules/pkg` | 拒(`node_modules/**`) |
| `/private/tmp/work/private/repo` | 拒(前綴剝離後仍有真 private 段) |

## 步驟(TDD:RED → GREEN)

1. **落 guard(RED)**:新檔 `tests/cli/mcp-allowed-root-canonicalization.test.ts`,內容用附錄全文逐字落檔。在**未修碼**上 capture pre-fix artifact:
   `bun test tests/cli/mcp-allowed-root-canonicalization.test.ts > tasks/notes/20260730-mcp-allowed-root-canonicalization.pre-fix.log 2>&1; s=$?; echo "PRE_FIX_EXIT=$s" >> 同檔`(不用 pipe)。預期 2 fail / 1 pass、PRE_FIX_EXIT=1。
2. **修 policy.ts(GREEN)**:按上述修復面實作,guard 3 test 全綠。
3. **驗證**(全跑):
   - `bun test tests/cli/mcp-allowed-root-canonicalization.test.ts`(3 pass)
   - `TMPDIR=/tmp bun test tests/cli/mcp-reader-tools.test.ts`(19 pass 0 fail,原 3 fail 歸零)
   - `bun test` 全量(原 11 紅全部歸零;log 檔形式跑)
   - `TMPDIR=/tmp bun test` 全量(gate runner 等價環境,同綠)
   - `bun run check:type`
4. **記帳**:`tasks/todos.md` 追加一條 deferred goal:`helper-runner.ts:76` 寫死 `TMPDIR: '/tmp'` 是否保留屬獨立決策(它不是本 bug 成因,但把 macOS gate runner 釘在共享 tmp 上;tradeoff:環境淨化確定性 vs 平台慣例;revisit trigger:下次動 helper-runner 或 gate 環境時)。notes 檔記修復判例對照結果。

## 明確不做(EXECUTION_BOUNDARY)

- 不動 `src/cli/runtime/helper-runner.ts`(TMPDIR 寫死是獨立決策,只進 todos)。
- 不做 `ROOT_DENIED` / `readable:false` 的 reason 透出改進(診斷標 [inferred] 改進項,另立)。
- 不碰兩個待 ship 包的任何檔;不動 workspaces.ts / reader-tools.ts(修復面只在 policy.ts)。

## 附錄:guard 全文

```ts
import { describe, expect, test } from 'bun:test';
import { mkdtempSync, rmSync } from 'fs';
import { join } from 'path';
import { getMcpPolicy, sensitiveAllowedRootReason } from '../../src/cli/mcp/policy';
import { WorkspaceManager } from '../../src/cli/mcp/workspaces';

describe('MCP allowed-root canonicalization', () => {
  test('system canonicalization prefixes are not treated as a sensitive "private" root', () => {
    // realpath of a macOS per-user temp dir; already carved out today.
    expect(sensitiveAllowedRootReason('/private/var/folders/ab/T/repo-harness-guard')).toBeUndefined();
    // realpath of /tmp on macOS; a filesystem artifact, not a user-owned "private" directory.
    expect(sensitiveAllowedRootReason('/private/tmp/repo-harness-guard')).toBeUndefined();
  });

  test('a real user-owned sensitive directory is still denied as an allowed root', () => {
    expect(sensitiveAllowedRootReason('/Users/example/private/repo')).toBe('private/**');
    expect(sensitiveAllowedRootReason('/Users/example/secrets/repo')).toBe('secrets/**');
    expect(sensitiveAllowedRootReason('/Users/example/repo/node_modules/pkg')).toBe('node_modules/**');
  });

  test('a workspace root under a symlinked system temp dir stays readable and counted', () => {
    // On macOS /tmp is a symlink to /private/tmp, so realpathSync injects a "private" segment
    // that the caller never wrote. Skip where the platform has no such symlink.
    if (process.platform !== 'darwin') return;
    const repoRoot = mkdtempSync(join('/tmp', 'repo-harness-allowed-root-guard-'));
    try {
      const policy = getMcpPolicy('planner', { enableReader: true, allowedRoots: [repoRoot] });
      const roots = new WorkspaceManager({ allowedRoots: [repoRoot], policy }).listAllowedRoots();
      expect(roots).toHaveLength(1);
      expect(roots[0].readable).toBe(true);
      // Mirrors reader-tools.ts:222 configured_root_count.
      expect(roots.filter((root) => root.readable).length).toBe(1);
    } finally {
      rmSync(repoRoot, { recursive: true, force: true });
    }
  });
});
```

註:guard 第二個 test 是 invariant 守衛,在未修碼上就 pass——確保修復不是把檢查刪掉,真實用戶自有的 `private/`、`secrets/`、`node_modules/` 仍必須被拒。

## Annotations
<!-- [NOTE]: prefixed inline. Claude processes all and revises. -->

## Task Breakdown
- [ ] Execute captured plan: Fix MCP allowed-root canonicalization false denial for /private/tmp
