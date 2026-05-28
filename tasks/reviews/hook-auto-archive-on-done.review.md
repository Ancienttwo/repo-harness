# Sprint Review: hook-auto-archive-on-done

> **Status**: Complete
> **Plan**: plans/plan-20260528-1443-hook-auto-archive-on-done.md
> **Contract**: tasks/contracts/hook-auto-archive-on-done.contract.md
> **Notes File**: tasks/notes/hook-auto-archive-on-done.notes.md
> **Checks File**: .ai/harness/checks/latest.json
> **Last Updated**: 2026-05-28 15:05
> **Recommendation**: pass

## Mode Evidence

- Selected route: /hunt diagnosis + plan-mode implementation
- P1/P2/P3 evidence: 见 plan 的 "P1 / P2 / P3 诊断" 节，证明 `scripts/archive-workflow.sh` 在整个 hook 链路中未被任何 hook 调用
- Root cause or plan evidence: hook 设计上不自动归档；用户的"配了 hook 但 plans/* 不归档"症状是设计意图，不是 bug

## Verification Evidence

- Commands run:
  - `bash -n .ai/hooks/prompt-guard.sh` → syntax OK
  - `bash scripts/check-task-workflow.sh --strict` → `[workflow] OK`
  - `bash scripts/check-task-sync.sh` → `[task-sync] OK`
  - `bash scripts/check-deploy-sql-order.sh` → `[deploy-sql] OK`
  - `bun scripts/inspect-project-state.ts --repo . --format text` → `drift_signals: (none)`
  - `bun test tests/hook-runtime.test.ts` → 52 pass / 0 fail
  - `bun test tests/workflow-contract.test.ts` → 10 pass / 0 fail
- Manual checks:
  - Positive E2E: mock plan + 全勾选 todo + verify-sprint pass checks + Recommendation=pass review → done prompt 触发 `[AutoArchive] All quality gates passed. Archiving ... as outcome=Completed`，plan 被 mv 到 `plans/archive/`，active-plan marker 清除，tasks/todo.md 重置 Idle ✓
  - Reverse 1 (ArchiveGuard): tasks/todo.md 留 1 个 `- [ ]` 未勾选 → hook 输出 `[ArchiveGuard] Refusing to auto-archive`，exit 1，plan 仍在 plans/ ✓
  - Reverse 2 (outcome=Abandoned): prompt "done, 放弃这个 plan" → `[AutoArchive] ... as outcome=Abandoned`，归档后 Status="Abandoned" ✓
- Supporting artifacts:
  - 修改 `.ai/hooks/prompt-guard.sh:29` 新增 `derive_done_outcome()`
  - 修改 `.ai/hooks/prompt-guard.sh:580-617` 在 done_intent 分支末尾新增 ArchiveGuard + AutoArchive 块
  - 同步 `assets/hooks/prompt-guard.sh`（parity test 要求）
  - 修复 `scripts/check-task-workflow.sh:394` BSD grep `\>` word-boundary bug（先存在的）
  - 更新 `tests/hook-runtime.test.ts:1380` 测试 mock `scripts/archive-workflow.sh` 并断言新输出
- Implementation notes reviewed: tasks/notes/hook-auto-archive-on-done.notes.md
- Run snapshot: (worktree codex/hook-auto-archive-on-done)

## Behavior Diff Notes

- 之前：done intent + 全套 quality gate 通过后，hook 静默返回，需要用户手动跑 `scripts/archive-workflow.sh`
- 现在：done intent + 全套 quality gate + tasks/todo.md 全勾选 → hook 自动调用 archive-workflow.sh，outcome 默认 Completed，prompt 命中 "放弃/不做了/作废/废弃" 推断 Abandoned，命中 "被取代/被替代/换方案" 推断 Superseded

## Residual Risks / Follow-ups

- ArchiveGuard 依赖 `tasks/todo.md` 字面 `^- \[ \]` 计数，如果项目用嵌套 checkbox 格式（如 `  - [ ]`）当前正则不匹配 → 缓解：plan-to-todo.sh 当前生成的格式就是顶层 `- [ ]`/`- [x]`
- `scripts/check-task-workflow.sh:394` 的 `\>` 修复是顺手补的先存在 BSD grep bug，不属于本任务核心；如需独立追踪可拆出
- `assets/hooks/` 必须始终与 `.ai/hooks/` 文件级一致，今后任何 hook 改动都要同步

## Scorecard

| Dimension | Score | Notes |
|-----------|-------|-------|
| Functionality | 9/10 | 正向 + 2 个反向 E2E 全部通过，outcome 推断按预期 |
| Product depth | 8/10 | 保留 outcome 显式选择约束 + ArchiveGuard 防误触发 |
| Design quality | 8/10 | 最小入侵（单文件 hook + 同步 assets + 1 字符 bug 修复），无新增依赖 |
| Code quality | 9/10 | 复用现有 helpers，结构化错误，无新模式引入 |

## Failing Items

- (none)

## Retest Steps

- Re-run: `bun test tests/hook-runtime.test.ts`
- Re-check: 模拟 done prompt → 见 plan 验证方案三层（单元/集成/回归）

## Summary

实现保守归档：用户已经走完 plan → contract → review → checks 全套质量门，再发 done 才触发归档；归档 outcome 由 prompt 自然语言关键字推断（默认 Completed）；tasks/todo.md 未全勾选作为防误触发保险。
