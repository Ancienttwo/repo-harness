# Plan: loop-engine-01 Workflow Closeout

> **Status**: Archived
> **Created**: 20260612-0338
> **Slug**: loop-engine-01-workflow-closeout
> **Planning Source**: user-approved-plan
> **Orchestration Kind**: host-plan
> **Source Ref**: (none)
> **Spec**: `docs/spec.md`
> **Research**: See `tasks/research.md`
> **Sprint Contract**: `tasks/contracts/20260612-0338-loop-engine-01-workflow-closeout.contract.md`
> **Sprint Review**: `tasks/reviews/20260612-0338-loop-engine-01-workflow-closeout.review.md`
> **Implementation Notes**: `tasks/notes/20260612-0338-loop-engine-01-workflow-closeout.notes.md`

## Agentic Routing
- Selected route: planning
- Routing reason: Captured from user-approved-plan planning output.
- Source ref: (none)
- Due diligence:
  - P1 map: See captured planning output below.
  - P2 trace: See captured planning output below.
  - P3 decision rationale: See captured planning output below.

## Workflow Inventory
Complete this inventory before implementation. If any line is unknown, keep the plan in Draft and fill it before projection.

- Active plan: `plans/plan-20260612-0338-loop-engine-01-workflow-closeout.md`
- Sprint contract: `tasks/contracts/20260612-0338-loop-engine-01-workflow-closeout.contract.md`
- Sprint review: `tasks/reviews/20260612-0338-loop-engine-01-workflow-closeout.review.md`
- Implementation notes: `tasks/notes/20260612-0338-loop-engine-01-workflow-closeout.notes.md`
- Deferred-goal ledger: `tasks/todo.md`
- Current checks: `.ai/harness/checks/latest.json`
- Run snapshots: `.ai/harness/runs/`
- Scope authority: `tasks/contracts/20260612-0338-loop-engine-01-workflow-closeout.contract.md` `allowed_paths`
- Concurrency rule: `.ai/harness/active-plan` selects the active plan for this worktree when present; `.ai/harness/active-worktree` records the owning worktree; `.claude/.active-plan` is a legacy fallback during transition. If another worktree already owns active work, open or switch to the matching worktree instead of serializing unrelated plans.
- Execution isolation: approved contract-level work projects through `scripts/plan-to-todo.sh --plan plans/plan-20260612-0338-loop-engine-01-workflow-closeout.md` and may start `scripts/contract-worktree.sh start --plan plans/plan-20260612-0338-loop-engine-01-workflow-closeout.md`.

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
- Contract file: `tasks/contracts/20260612-0338-loop-engine-01-workflow-closeout.contract.md`
- Review file: `tasks/reviews/20260612-0338-loop-engine-01-workflow-closeout.review.md`
- Implementation notes file: `tasks/notes/20260612-0338-loop-engine-01-workflow-closeout.notes.md`
- Template: `.claude/templates/contract.template.md`
- Verification command: `bash scripts/verify-contract.sh --contract tasks/contracts/20260612-0338-loop-engine-01-workflow-closeout.contract.md --strict`
- Active plan rule: this captured plan is written to `.ai/harness/active-plan`, the owning worktree is written to `.ai/harness/active-worktree`, and the plan is mirrored to `.claude/.active-plan` unless --no-active is used. Do not infer active execution from the latest non-archived plan.

## Handoff

- Checks file: `.ai/harness/checks/latest.json`
- Session handoff: `.ai/harness/handoff/current.md`

## Evidence Contract

- **State/progress path**: `plans/plan-20260612-0338-loop-engine-01-workflow-closeout.md` task breakdown, `tasks/todo.md` deferred-goal ledger, `tasks/contracts/20260612-0338-loop-engine-01-workflow-closeout.contract.md`, `tasks/reviews/20260612-0338-loop-engine-01-workflow-closeout.review.md`, and `tasks/notes/20260612-0338-loop-engine-01-workflow-closeout.notes.md`
- **Verification evidence**: `.ai/harness/checks/latest.json`, `.ai/harness/runs/`, and the commands named in the captured planning output
- **Evaluator rubric**: `tasks/reviews/20260612-0338-loop-engine-01-workflow-closeout.review.md` must record a passing Waza /check style recommendation
- **Stop condition**: all task breakdown items are complete, sprint verification passes, and the review recommends pass
- **Rollback surface**: before execution remove `plans/plan-20260612-0338-loop-engine-01-workflow-closeout.md`; after execution revert branch `codex/loop-engine-01-workflow-closeout` or the generated task artifacts

## Captured Planning Output

# loop-engine-01 Workflow Closeout
## Summary
关闭 `loop-engine-01-state-snapshot-nl-decision-table` 的工作流账本，不改 state snapshot 行为、不推进 A/B eval、不碰 classifier cutover。目标是让代码已落地的第一刀在 sprint/review/handoff/checks 上闭环，并恢复 `check-task-workflow --strict` 通过。
## Key Changes
- 刷新 `.ai/harness/handoff/resume.md`，解决当前 strict gate 的唯一已知失败：`resume.md < current.md`。
- 更新 `loop-engine-01` review 文件，把已验证命令、行为差异、残余风险和 recommendation 从 `fail/Pending` 改为通过状态。
- 用 sprint helper 完成 `tasks/sprints/20260612-0236-loop-engine.sprint.md` 的第一条 backlog 记账，记录 `ff13087` 已落地的实现和验证结果。
- 清理或关闭遗留 worktree marker/artifact 状态：只处理 `loop-engine-01` 相关 scaffold/active markers；不删除未合并、未确认归属的其他 worktree。
- 保持后续任务未开始：`loop-engine-02-routing-ab-eval` 仍是下一条真正工程任务。
## Test Plan
- 先确认当前状态：
  - `git status --short --branch`
  - `git worktree list --porcelain`
  - `bash scripts/check-task-workflow.sh --strict`
- 关闭账本后运行：
  - `bash scripts/check-task-workflow.sh --strict`
  - `bash scripts/check-task-sync.sh`
  - `bun test tests/cli/state-snapshot.test.ts`
  - 如账本改动触及 sprint helper，再跑 `bun test tests/sprint-backlog.test.ts tests/helper-scripts.test.ts`
- 最终确认：
  - `repo-harness-hook state-snapshot --json` 输出仍为单行 JSON 且 ≤1KB
  - sprint backlog 第 1 项完成，第 2 项成为下一项
  - review recommendation 为 pass
  - main 工作树只包含本次 closeout 相关账本改动和原有无关 dirty 改动清单
## Assumptions
- `ff13087 Add loop engine state snapshot` 已在 `main/origin/main`，本计划不重新实现它。
- 当前失败是 workflow freshness/closeout 问题，不是 state snapshot 功能失败。
- 不回滚、不清理其他并行工作流产生的 dirty files；只在必要时注明它们仍然存在。
- 如果 strict gate 暴露新的非 `loop-engine-01` 问题，先记录为 residual risk，不把本 slice 扩成跨工作流修复。

## Annotations
<!-- [NOTE]: prefixed inline. Claude processes all and revises. -->

## Task Breakdown
- [x] Execute captured plan: loop-engine-01 Workflow Closeout
