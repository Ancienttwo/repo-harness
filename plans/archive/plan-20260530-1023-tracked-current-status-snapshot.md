# Plan: Tracked Current Status Snapshot

> **Status**: Archived
> **Created**: 20260530-1023
> **Slug**: tracked-current-status-snapshot
> **Planning Source**: user-approved-plan
> **Orchestration Kind**: host-plan
> **Source Ref**: (none)
> **Spec**: `docs/spec.md`
> **Research**: See `tasks/research.md`
> **Sprint Contract**: `tasks/contracts/tracked-current-status-snapshot.contract.md`
> **Sprint Review**: `tasks/reviews/tracked-current-status-snapshot.review.md`
> **Implementation Notes**: `tasks/notes/tracked-current-status-snapshot.notes.md`

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

- Active plan: `plans/plan-20260530-1023-tracked-current-status-snapshot.md`
- Sprint contract: `tasks/contracts/tracked-current-status-snapshot.contract.md`
- Sprint review: `tasks/reviews/tracked-current-status-snapshot.review.md`
- Implementation notes: `tasks/notes/tracked-current-status-snapshot.notes.md`
- Deferred-goal ledger: `tasks/todo.md`
- Current checks: `.ai/harness/checks/latest.json`
- Run snapshots: `.ai/harness/runs/`
- Scope authority: `tasks/contracts/tracked-current-status-snapshot.contract.md` `allowed_paths`
- Concurrency rule: `.ai/harness/active-plan` selects the active plan for this worktree when present; `.ai/harness/active-worktree` records the owning worktree; `.claude/.active-plan` is a legacy fallback during transition. If another worktree already owns active work, open or switch to the matching worktree instead of serializing unrelated plans.
- Execution isolation: approved contract-level work projects through `scripts/plan-to-todo.sh --plan plans/plan-20260530-1023-tracked-current-status-snapshot.md` and may start `scripts/contract-worktree.sh start --plan plans/plan-20260530-1023-tracked-current-status-snapshot.md`.

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
- Contract file: `tasks/contracts/tracked-current-status-snapshot.contract.md`
- Review file: `tasks/reviews/tracked-current-status-snapshot.review.md`
- Implementation notes file: `tasks/notes/tracked-current-status-snapshot.notes.md`
- Template: `.claude/templates/contract.template.md`
- Verification command: `bash scripts/verify-contract.sh --contract tasks/contracts/tracked-current-status-snapshot.contract.md --strict`
- Active plan rule: this captured plan is written to `.ai/harness/active-plan`, the owning worktree is written to `.ai/harness/active-worktree`, and the plan is mirrored to `.claude/.active-plan` unless --no-active is used. Do not infer active execution from the latest non-archived plan.

## Handoff

- Checks file: `.ai/harness/checks/latest.json`
- Session handoff: `.ai/harness/handoff/current.md`

## Evidence Contract

- **State/progress path**: `plans/plan-20260530-1023-tracked-current-status-snapshot.md` task breakdown, `tasks/todo.md` deferred-goal ledger, `tasks/contracts/tracked-current-status-snapshot.contract.md`, `tasks/reviews/tracked-current-status-snapshot.review.md`, and `tasks/notes/tracked-current-status-snapshot.notes.md`
- **Verification evidence**: `.ai/harness/checks/latest.json`, `.ai/harness/runs/`, and the commands named in the captured planning output
- **Evaluator rubric**: `tasks/reviews/tracked-current-status-snapshot.review.md` must record a passing Waza /check style recommendation
- **Stop condition**: all task breakdown items are complete, sprint verification passes, and the review recommends pass
- **Rollback surface**: before execution remove `plans/plan-20260530-1023-tracked-current-status-snapshot.md`; after execution revert branch `codex/tracked-current-status-snapshot` or the generated task artifacts

## Captured Planning Output

# Tracked Current Status Snapshot
## Summary
做 `tasks/current.md`，但只作为 tracked mainline snapshot，不做实时共享内存、不做手写 kanban、不做第二任务源。它由脚本从权威 artifacts 派生，帮助新 session、main、其他 worktree 快速判断“当前 repo 到哪了”。
## Key Changes
- 新增 tracked `tasks/current.md`，固定声明：
  - `Status`: `Active` / `Idle` / `Stale` / `ManualClearedWithActiveWork`
  - `Updated At`
  - `Source Branch`
  - `Source Commit`
  - `Target Branch`
  - `Derived From`: active plan、workstreams、handoff、checks、git status
  - `Stale After`: 默认 24h
- 新增 `scripts/refresh-current-status.sh`：
  - 默认只打印预览。
  - `--write` 才更新 `tasks/current.md`。
  - `--clear --write` 只在没有 active plan / active worktree 时写 Idle。
  - 不支持把活跃工作强行写成 Idle；如果检测到 active work，只能写 `ManualClearedWithActiveWork`。
  - 写入必须 temp file + atomic `mv`。
- 新增读取约定：
  - 当前 worktree 读 `tasks/current.md`。
  - 非 target branch 想看 mainline 状态，用 `git show <target>:tasks/current.md`。
  - snapshot 明确不是实时状态；如果过期，agent 必须回到权威 artifacts。
- 生命周期写入：
  - `scripts/archive-workflow.sh` 在移动 plan、清 active markers、重置 `tasks/todo.md` 后调用 refresh。
  - `scripts/contract-worktree.sh finish` 继续通过 `archive-workflow.sh` 继承刷新逻辑。
  - 普通 hooks 不在 prompt/session 事件里写 tracked 文件。
- `memo/kanban` 不做 v1：
  - 不引入手写 memo 区。
  - 不引入 kanban 列。
  - 如果后续要 memo，只能是 TTL/pinned notes，并且不参与 gate。
## Interfaces
- Command:
  - `bash scripts/refresh-current-status.sh`
  - `bash scripts/refresh-current-status.sh --write --reason <reason>`
  - `bash scripts/refresh-current-status.sh --clear --write --reason <reason>`
  - `bash scripts/refresh-current-status.sh --target <branch>`
- File contract:
  - `tasks/current.md` 是 Markdown read model。
  - 不能作为 implementation gate。
  - 不能替代 `plans/plan-*.md`、`.ai/harness/active-plan`、`tasks/workstreams/**`、`tasks/reviews/**`、`.ai/harness/checks/latest.json`。
## Test Plan
- 无 active plan：refresh 写 Idle。
- 有 active plan：refresh 写 Active，列出 plan、next task、checks、handoff next step。
- `--clear --write` 且有 active plan：拒绝写 Idle，返回非零或写 `ManualClearedWithActiveWork`，按实现选择固定一种。
- archive closeout：归档后 `tasks/current.md` 回到 Idle。
- 非 target branch：文档和 SessionStart 提示 `git show main:tasks/current.md`。
- `scripts/check-task-workflow.sh --strict` 继续确认 `tasks/todo.md` 是 deferred ledger，且不把 `tasks/current.md` 当 checklist。
- `bun test` 覆盖脚本输出、clear safety、atomic write、stale metadata。
## Assumptions
- `tasks/current.md` 必须 tracked；ignored 文件不满足跨分支可见目标。
- 它是 mainline snapshot，不承诺实时同步。
- target branch 默认 `main`，但读取 `.ai/harness/policy.json` 的 `worktree_strategy.base_branch` / merge target 优先。
- v1 只解决“快速看当前 repo 状态”，不解决多人实时协作看板。

## Annotations
<!-- [NOTE]: prefixed inline. Claude processes all and revises. -->

## Task Breakdown
- [ ] Execute captured plan: Tracked Current Status Snapshot
