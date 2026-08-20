# Plan: Astrozi User-Level Hook 配置刷新

> **Status**: Abandoned
> **Created**: 20260529-0909
> **Slug**: astrozi-user-level-hook
> **Planning Source**: user-approved-plan
> **Spec**: `docs/spec.md`
> **Research**: See `tasks/research.md`
> **Sprint Contract**: `tasks/contracts/astrozi-user-level-hook.contract.md`
> **Sprint Review**: `tasks/reviews/astrozi-user-level-hook.review.md`
> **Implementation Notes**: `tasks/notes/astrozi-user-level-hook.notes.md`

## Agentic Routing
- Selected route: planning
- Routing reason: Captured from user-approved-plan planning output.
- Due diligence:
  - P1 map: See captured planning output below.
  - P2 trace: See captured planning output below.
  - P3 decision rationale: See captured planning output below.

## Workflow Inventory
Complete this inventory before implementation. If any line is unknown, keep the plan in Draft and fill it before projection.

- Active plan: `plans/plan-20260529-0909-astrozi-user-level-hook.md`
- Sprint contract: `tasks/contracts/astrozi-user-level-hook.contract.md`
- Sprint review: `tasks/reviews/astrozi-user-level-hook.review.md`
- Implementation notes: `tasks/notes/astrozi-user-level-hook.notes.md`
- Deferred-goal ledger: `tasks/todo.md`
- Current checks: `.ai/harness/checks/latest.json`
- Run snapshots: `.ai/harness/runs/`
- Scope authority: `tasks/contracts/astrozi-user-level-hook.contract.md` `allowed_paths`
- Concurrency rule: `.ai/harness/active-plan` selects the active plan for this worktree when present; `.ai/harness/active-worktree` records the owning worktree; `.claude/.active-plan` is a legacy fallback during transition. If another worktree already owns active work, open or switch to the matching worktree instead of serializing unrelated plans.
- Execution isolation: approved contract-level work projects through `scripts/plan-to-todo.sh --plan plans/plan-20260529-0909-astrozi-user-level-hook.md` and may start `scripts/contract-worktree.sh start --plan plans/plan-20260529-0909-astrozi-user-level-hook.md`.

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
- Contract file: `tasks/contracts/astrozi-user-level-hook.contract.md`
- Review file: `tasks/reviews/astrozi-user-level-hook.review.md`
- Implementation notes file: `tasks/notes/astrozi-user-level-hook.notes.md`
- Template: `.claude/templates/contract.template.md`
- Verification command: `bash scripts/verify-contract.sh --contract tasks/contracts/astrozi-user-level-hook.contract.md --strict`
- Active plan rule: this captured plan is written to `.ai/harness/active-plan`, the owning worktree is written to `.ai/harness/active-worktree`, and the plan is mirrored to `.claude/.active-plan` unless --no-active is used. Do not infer active execution from the latest non-archived plan.

## Handoff

- Checks file: `.ai/harness/checks/latest.json`
- Session handoff: `.ai/harness/handoff/current.md`

## Evidence Contract

- **State/progress path**: `plans/plan-20260529-0909-astrozi-user-level-hook.md` task breakdown, `tasks/todo.md` deferred-goal ledger, `tasks/contracts/astrozi-user-level-hook.contract.md`, `tasks/reviews/astrozi-user-level-hook.review.md`, and `tasks/notes/astrozi-user-level-hook.notes.md`
- **Verification evidence**: `.ai/harness/checks/latest.json`, `.ai/harness/runs/`, and the commands named in the captured planning output
- **Evaluator rubric**: `tasks/reviews/astrozi-user-level-hook.review.md` must record a passing Waza /check style recommendation
- **Stop condition**: all task breakdown items are complete, sprint verification passes, and the review recommends pass
- **Rollback surface**: before execution remove `plans/plan-20260529-0909-astrozi-user-level-hook.md`; after execution revert branch `codex/astrozi-user-level-hook` or the generated task artifacts

## Captured Planning Output

# Astrozi User-Level Hook 配置刷新
## Summary
把 Astrozi 从 repo-local hook 配置切到 user-level 配置。已只读确认：
- P1：Astrozi 是 repo-harness opt-in repo；user-level `~/.codex/hooks.json` / `~/.claude/settings.json` 已有 7/7 managed entries。
- P2：当前还有 Astrozi project-level `.codex/hooks.json` 和 `.claude/settings.json`，会和 user-level 合并/双触发。
- P3：先清 user-level 旧 shim，再清 Astrozi repo-local hooks，避免 `.codex/hooks.json` 删除后旧 `~/.repo-harness/hook-shim.sh` 重新开始触发。
## Key Changes
- 清理 user-level stale shim entries：
  - 从 `~/.codex/hooks.json` 删除 11 条包含 `/.repo-harness/hook-shim.sh` 的旧命令。
  - 从 `~/.claude/settings.json` 删除 11 条同类旧命令。
  - 保留 7 条 `repo-harness hook ... HOOK_HOST=codex|claude` managed entries。
- 清理 Astrozi project-level hooks：
  - 对 `/Users/ancienttwo/Astrozi/.codex/hooks.json` 和 `.claude/settings.json` 运行 legacy migration apply。
  - 若文件迁移后只剩 `{}`，删除该 repo-local config 文件并从 git 中移除，因为目标明确是 user-level。
  - 保留迁移备份文件只作为本地安全网，不纳入 commit。
- 不吸收 Astrozi 当前业务改动；只处理 hook/config surface。
## Verification
- 在 `/Users/ancienttwo/Astrozi` 跑：
  - `bun /Users/ancienttwo/Projects/agentic-dev/src/cli/index.ts status`
  - `bun /Users/ancienttwo/Projects/agentic-dev/src/cli/index.ts doctor`
  - `bash scripts/check-task-workflow.sh --strict`
  - `git status --short --branch`
- 验收条件：
  - status 仍显示 Codex/Claude global adapters `7/7 managed entries`。
  - doctor 无 fail；Codex trust state 仍存在 user-level entries。
  - Astrozi repo 内不再有有效 project-level hook entries。
  - user-level hooks 不再包含 `/.repo-harness/hook-shim.sh`。
  - Astrozi 现有业务 dirty files 不被改写。
## Assumptions
- “配置”指 repo-harness hook 配置，而不是 Astrozi app runtime env。
- 虽然你重点说 user-level，Claude 也一起清，因为当前 Astrozi 同时残留 `.claude/settings.json` project-level hooks，且 user-level Claude adapter 已安装。
- 不改 agentic-dev CLI 源码；这是一次机器配置和 Astrozi repo-local legacy config 清理。

## Annotations
<!-- [NOTE]: prefixed inline. Claude processes all and revises. -->

## Task Breakdown
- [ ] Execute captured plan: Astrozi User-Level Hook 配置刷新
