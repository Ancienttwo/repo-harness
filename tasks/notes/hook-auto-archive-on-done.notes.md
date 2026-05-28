# Implementation Notes: hook-auto-archive-on-done

> **Status**: Active
> **Plan**: plans/plan-20260528-1443-hook-auto-archive-on-done.md
> **Contract**: tasks/contracts/hook-auto-archive-on-done.contract.md
> **Review**: tasks/reviews/hook-auto-archive-on-done.review.md
> **Last Updated**: 2026-05-28 15:05
> **Lifecycle**: notes

## Design Decisions

- 改 `prompt-guard.sh` 而不是新建 hook：done_intent 分支已经在 prompt-guard.sh 里堆好了 5 层 quality gate（active plan / contract / review / checks / evidence contract），新建 hook 会重复整套验证。在原 hook 末尾加 ArchiveGuard + AutoArchive 是最小入侵。
- ArchiveGuard 检查 `tasks/todo.md` 全勾选而不是 contract：contract exit_criteria 已经由 verify-contract 在前面 ContractGuard 检查过。再加 todo 全勾选检查是防止"先收个工"但 todo 还有遗漏，避免 done intent 误归档。
- outcome 关键字优先级：abandoned/放弃 > superseded/被取代 > 默认 Completed。保证用户说"完成但放弃了"按语义优先归档为 Abandoned。

## Deviations From Plan Or Spec

| Path | Reason |
|------|--------|
| `assets/hooks/prompt-guard.sh` | workflow-contract.test.ts 强制 parity，必须同步改 |
| `scripts/check-task-workflow.sh:394` | 先存在 BSD grep `\>` word-boundary bug，阻塞 contract 自验证，1 字符修复 |
| `tests/hook-runtime.test.ts:1380` | 测试期望 done intent 通过后 exit 0，现在新增 AutoArchive 输出需要 mock `archive-workflow.sh` 并新增断言 |

## Tradeoffs Considered

| Option | Decision | Reason |
|--------|----------|--------|
| PostToolUse 自动归档 | 拒 | 编辑 plans/*.md 不是"完成"信号，会破坏 annotation 工作流 |
| Stop hook 自动归档 | 拒 | Stop 触发太频繁，无法判断 outcome |
| done_intent 自动归档 | 选 | done 是用户明确意图，前置 5 层 quality gate 已存在 |
| 加 todo 全勾选保险 | 选 | 防止用户"先收个工"误触发 |

## Open Questions

- ArchiveGuard 当前用 `awk '/^- \[ \]/'` 只识别顶层 checkbox；如果项目以后用嵌套结构 `  - [ ]`，正则需要更新
- `scripts/check-task-workflow.sh:394` 修复后，建议清单式检查所有 `\>`/`\<` 用法（grep 整个 scripts/ 没看到第二处）

## Evidence Links

- Checks: `.ai/harness/checks/latest.json`
- Run snapshots: `.ai/harness/runs/`
- E2E test commands: 见 review.md "Verification Evidence" 节

## Promotion Candidates

- Promote to `tasks/lessons.md` only after a repeated correction or failure pattern.
- Promote to `tasks/research.md` only when it is durable repo knowledge with evidence.
- Promote to harness asset files only after verification across more than one task or fixture.
