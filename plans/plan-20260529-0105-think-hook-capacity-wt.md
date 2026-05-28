# Plan: think 现在的hook我记得是有在完成一个任务的时候，推荐下一个相关连的任务（下一刀），如果是同capacity的，应该会在同一个wt上继续。我想加一个功能就是，当任务基本开发完成，则推荐

> **Status**: Draft
> **Created**: 20260529-0105
> **Slug**: think-hook-capacity-wt
> **Spec**: `docs/spec.md`
> **Research**: See `tasks/research.md`
> **Sprint Contract**: `tasks/contracts/think-hook-capacity-wt.contract.md`
> **Sprint Review**: `tasks/reviews/think-hook-capacity-wt.review.md`
> **Implementation Notes**: `tasks/notes/think-hook-capacity-wt.notes.md`

## Agentic Routing
- Selected route:
- Routing reason:
- Due diligence:
  - P1 map:
  - P2 trace:
  - P3 decision rationale:

## Workflow Inventory
Complete this inventory before implementation. If any line is unknown, keep the plan in Draft and fill it before projection.

- Active plan: `plans/plan-20260529-0105-think-hook-capacity-wt.md`
- Sprint contract: `tasks/contracts/think-hook-capacity-wt.contract.md`
- Sprint review: `tasks/reviews/think-hook-capacity-wt.review.md`
- Implementation notes: `tasks/notes/think-hook-capacity-wt.notes.md`
- Deferred-goal ledger: `tasks/todo.md`
- Current checks: `.ai/harness/checks/latest.json`
- Run snapshots: `.ai/harness/runs/`
- Scope authority: `tasks/contracts/think-hook-capacity-wt.contract.md` `allowed_paths`
- Concurrency rule: `.ai/harness/active-plan` selects the active plan for this worktree when present; `.ai/harness/active-worktree` records the owning worktree; `.claude/.active-plan` is a legacy fallback during transition. If another worktree already owns active work, open or switch to the matching worktree instead of serializing unrelated plans.
- Execution isolation: approved contract-level work projects through `scripts/plan-to-todo.sh --plan plans/plan-20260529-0105-think-hook-capacity-wt.md` and may start `scripts/contract-worktree.sh start --plan plans/plan-20260529-0105-think-hook-capacity-wt.md`.

## Approach
### Strategy
### Trade-offs
| Option | Pros | Cons | Decision |
|--------|------|------|----------|

## Detailed Design
### File Changes
| File | Action | Description |
|------|--------|-------------|

### Code Snippets
### Data Flow

## Risk Assessment
| Risk | Likelihood | Impact | Mitigation |
|------|------------|--------|------------|

## Task Contracts
- Contract file: `tasks/contracts/think-hook-capacity-wt.contract.md`
- Review file: `tasks/reviews/think-hook-capacity-wt.review.md`
- Implementation notes file: `tasks/notes/think-hook-capacity-wt.notes.md`
- Template: `.claude/templates/contract.template.md`
- Verification command: `bash scripts/verify-contract.sh --contract tasks/contracts/think-hook-capacity-wt.contract.md --strict`
- Active plan rule: `.ai/harness/active-plan` is authoritative for this worktree when present; `.ai/harness/active-worktree` records the owning worktree; `.claude/.active-plan` is a legacy fallback during transition. Do not infer active execution from the latest non-archived plan.

## Handoff

- Checks file: `.ai/harness/checks/latest.json`
- Session handoff: `.ai/harness/handoff/current.md`

## Evidence Contract

- **State/progress path**:
- **Verification evidence**:
- **Evaluator rubric**:
- **Stop condition**:
- **Rollback surface**:

## Annotations
<!-- [NOTE]: prefixed inline. Claude processes all and revises. -->

## Task Breakdown
- [ ] ...
