# Plan: Sprint task: loop-engine-04-contract-kappa-fields

> **Status**: Archived
> **Created**: 20260612-1224
> **Slug**: loop-engine-04-contract-kappa-fields
> **Planning Source**: repo-harness-sprint
> **Orchestration Kind**: sprint-task
> **Source Ref**: sprint:tasks/sprints/20260612-0236-loop-engine.sprint.md#loop-engine-04-contract-kappa-fields
> **Spec**: `docs/spec.md`
> **Research**: See `tasks/research.md`
> **Sprint Contract**: `tasks/contracts/20260612-1224-loop-engine-04-contract-kappa-fields.contract.md`
> **Sprint Review**: `tasks/reviews/20260612-1224-loop-engine-04-contract-kappa-fields.review.md`
> **Implementation Notes**: `tasks/notes/20260612-1224-loop-engine-04-contract-kappa-fields.notes.md`

## Agentic Routing
- Selected route: planning
- Routing reason: Captured from repo-harness-sprint planning output.
- Source ref: sprint:tasks/sprints/20260612-0236-loop-engine.sprint.md#loop-engine-04-contract-kappa-fields
- Due diligence:
  - P1 map: See captured planning output below.
  - P2 trace: See captured planning output below.
  - P3 decision rationale: See captured planning output below.

## Workflow Inventory
Complete this inventory before implementation. If any line is unknown, keep the plan in Draft and fill it before projection.

- Active plan: `plans/plan-20260612-1224-loop-engine-04-contract-kappa-fields.md`
- Sprint contract: `tasks/contracts/20260612-1224-loop-engine-04-contract-kappa-fields.contract.md`
- Sprint review: `tasks/reviews/20260612-1224-loop-engine-04-contract-kappa-fields.review.md`
- Implementation notes: `tasks/notes/20260612-1224-loop-engine-04-contract-kappa-fields.notes.md`
- Deferred-goal ledger: `tasks/todo.md`
- Current checks: `.ai/harness/checks/latest.json`
- Run snapshots: `.ai/harness/runs/`
- Scope authority: `tasks/contracts/20260612-1224-loop-engine-04-contract-kappa-fields.contract.md` `allowed_paths`
- Concurrency rule: `.ai/harness/active-plan` selects the active plan for this worktree when present; `.ai/harness/active-worktree` records the owning worktree; `.claude/.active-plan` is a legacy fallback during transition. If another worktree already owns active work, open or switch to the matching worktree instead of serializing unrelated plans.
- Execution isolation: approved contract-level work projects through `scripts/plan-to-todo.sh --plan plans/plan-20260612-1224-loop-engine-04-contract-kappa-fields.md` and may start `scripts/contract-worktree.sh start --plan plans/plan-20260612-1224-loop-engine-04-contract-kappa-fields.md`.

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
- Contract file: `tasks/contracts/20260612-1224-loop-engine-04-contract-kappa-fields.contract.md`
- Review file: `tasks/reviews/20260612-1224-loop-engine-04-contract-kappa-fields.review.md`
- Implementation notes file: `tasks/notes/20260612-1224-loop-engine-04-contract-kappa-fields.notes.md`
- Template: `.claude/templates/contract.template.md`
- Verification command: `bash scripts/verify-contract.sh --contract tasks/contracts/20260612-1224-loop-engine-04-contract-kappa-fields.contract.md --strict`
- Active plan rule: this captured plan is written to `.ai/harness/active-plan`, the owning worktree is written to `.ai/harness/active-worktree`, and the plan is mirrored to `.claude/.active-plan` unless --no-active is used. Do not infer active execution from the latest non-archived plan.

## Handoff

- Checks file: `.ai/harness/checks/latest.json`
- Session handoff: `.ai/harness/handoff/current.md`

## Evidence Contract

- **State/progress path**: `plans/plan-20260612-1224-loop-engine-04-contract-kappa-fields.md` task breakdown, `tasks/todo.md` deferred-goal ledger, `tasks/contracts/20260612-1224-loop-engine-04-contract-kappa-fields.contract.md`, `tasks/reviews/20260612-1224-loop-engine-04-contract-kappa-fields.review.md`, and `tasks/notes/20260612-1224-loop-engine-04-contract-kappa-fields.notes.md`
- **Verification evidence**: `.ai/harness/checks/latest.json`, `.ai/harness/runs/`, and the commands named in the captured planning output
- **Evaluator rubric**: `tasks/reviews/20260612-1224-loop-engine-04-contract-kappa-fields.review.md` must record a passing Waza /check style recommendation
- **Stop condition**: all task breakdown items are complete, sprint verification passes, and the review recommends pass
- **Rollback surface**: before execution remove `plans/plan-20260612-1224-loop-engine-04-contract-kappa-fields.md`; after execution revert branch `codex/loop-engine-04-contract-kappa-fields` or the generated task artifacts

## Captured Planning Output

# Sprint Task: loop-engine-04-contract-kappa-fields

## Context

- Sprint: `tasks/sprints/20260612-0236-loop-engine.sprint.md`
- Backlog row: 4
- Mode: contract
- Read the sprint PRD and Architecture Notes before implementation.

## Goal

Deliver backlog task `loop-engine-04-contract-kappa-fields` so that the acceptance line holds: contract 模板与 plan-to-todo.sh 投影新增 budget/permission_scope/roles 字段(缺省向后兼容);新旧两种 contract 均通过 verify-contract.sh;check-task-workflow.sh --strict 通过;字段语义文档化

## Task Breakdown

- [x] Implement backlog task `loop-engine-04-contract-kappa-fields` per the sprint PRD and Architecture Notes
- [x] Verify acceptance: contract 模板与 plan-to-todo.sh 投影新增 budget/permission_scope/roles 字段(缺省向后兼容);新旧两种 contract 均通过 verify-contract.sh;check-task-workflow.sh --strict 通过;字段语义文档化

## Annotations
<!-- [NOTE]: prefixed inline. Claude processes all and revises. -->

## Task Breakdown
- [x] Implement backlog task `loop-engine-04-contract-kappa-fields` per the sprint PRD and Architecture Notes
- [x] Verify acceptance: contract 模板与 plan-to-todo.sh 投影新增 budget/permission_scope/roles 字段(缺省向后兼容);新旧两种 contract 均通过 verify-contract.sh;check-task-workflow.sh --strict 通过;字段语义文档化
