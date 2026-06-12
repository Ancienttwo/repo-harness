# Plan: Sprint task: loop-engine-07-cutover-delete-classifier

> **Status**: Archived
> **Created**: 20260612-0539
> **Slug**: loop-engine-07-cutover-delete-classifier
> **Planning Source**: repo-harness-sprint
> **Orchestration Kind**: sprint-task
> **Source Ref**: sprint:tasks/sprints/20260612-0236-loop-engine.sprint.md#loop-engine-07-cutover-delete-classifier
> **Spec**: `docs/spec.md`
> **Research**: See `tasks/research.md`
> **Sprint Contract**: `tasks/contracts/20260612-0539-loop-engine-07-cutover-delete-classifier.contract.md`
> **Sprint Review**: `tasks/reviews/20260612-0539-loop-engine-07-cutover-delete-classifier.review.md`
> **Implementation Notes**: `tasks/notes/20260612-0539-loop-engine-07-cutover-delete-classifier.notes.md`

## Agentic Routing
- Selected route: planning
- Routing reason: Captured from repo-harness-sprint planning output.
- Source ref: sprint:tasks/sprints/20260612-0236-loop-engine.sprint.md#loop-engine-07-cutover-delete-classifier
- Due diligence:
  - P1 map: See captured planning output below.
  - P2 trace: See captured planning output below.
  - P3 decision rationale: See captured planning output below.

## Workflow Inventory
Complete this inventory before implementation. If any line is unknown, keep the plan in Draft and fill it before projection.

- Active plan: `plans/plan-20260612-0539-loop-engine-07-cutover-delete-classifier.md`
- Sprint contract: `tasks/contracts/20260612-0539-loop-engine-07-cutover-delete-classifier.contract.md`
- Sprint review: `tasks/reviews/20260612-0539-loop-engine-07-cutover-delete-classifier.review.md`
- Implementation notes: `tasks/notes/20260612-0539-loop-engine-07-cutover-delete-classifier.notes.md`
- Deferred-goal ledger: `tasks/todo.md`
- Current checks: `.ai/harness/checks/latest.json`
- Run snapshots: `.ai/harness/runs/`
- Scope authority: `tasks/contracts/20260612-0539-loop-engine-07-cutover-delete-classifier.contract.md` `allowed_paths`
- Concurrency rule: `.ai/harness/active-plan` selects the active plan for this worktree when present; `.ai/harness/active-worktree` records the owning worktree; `.claude/.active-plan` is a legacy fallback during transition. If another worktree already owns active work, open or switch to the matching worktree instead of serializing unrelated plans.
- Execution isolation: approved contract-level work projects through `scripts/plan-to-todo.sh --plan plans/plan-20260612-0539-loop-engine-07-cutover-delete-classifier.md` and may start `scripts/contract-worktree.sh start --plan plans/plan-20260612-0539-loop-engine-07-cutover-delete-classifier.md`.

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
- Contract file: `tasks/contracts/20260612-0539-loop-engine-07-cutover-delete-classifier.contract.md`
- Review file: `tasks/reviews/20260612-0539-loop-engine-07-cutover-delete-classifier.review.md`
- Implementation notes file: `tasks/notes/20260612-0539-loop-engine-07-cutover-delete-classifier.notes.md`
- Template: `.claude/templates/contract.template.md`
- Verification command: `bash scripts/verify-contract.sh --contract tasks/contracts/20260612-0539-loop-engine-07-cutover-delete-classifier.contract.md --strict`
- Active plan rule: this captured plan is written to `.ai/harness/active-plan`, the owning worktree is written to `.ai/harness/active-worktree`, and the plan is mirrored to `.claude/.active-plan` unless --no-active is used. Do not infer active execution from the latest non-archived plan.

## Handoff

- Checks file: `.ai/harness/checks/latest.json`
- Session handoff: `.ai/harness/handoff/current.md`

## Evidence Contract

- **State/progress path**: `plans/plan-20260612-0539-loop-engine-07-cutover-delete-classifier.md` task breakdown, `tasks/todo.md` deferred-goal ledger, `tasks/contracts/20260612-0539-loop-engine-07-cutover-delete-classifier.contract.md`, `tasks/reviews/20260612-0539-loop-engine-07-cutover-delete-classifier.review.md`, and `tasks/notes/20260612-0539-loop-engine-07-cutover-delete-classifier.notes.md`
- **Verification evidence**: `.ai/harness/checks/latest.json`, `.ai/harness/runs/`, and the commands named in the captured planning output
- **Evaluator rubric**: `tasks/reviews/20260612-0539-loop-engine-07-cutover-delete-classifier.review.md` must record a passing Waza /check style recommendation
- **Stop condition**: all task breakdown items are complete, sprint verification passes, and the review recommends pass
- **Rollback surface**: before execution remove `plans/plan-20260612-0539-loop-engine-07-cutover-delete-classifier.md`; after execution revert branch `codex/loop-engine-07-cutover-delete-classifier` or the generated task artifacts

## Captured Planning Output

# Sprint Task: loop-engine-07-cutover-delete-classifier

## Context

- Sprint: `tasks/sprints/20260612-0236-loop-engine.sprint.md`
- Backlog row: 7
- Mode: contract
- Read the sprint PRD and Architecture Notes before implementation.

## Goal

Deliver backlog task `loop-engine-07-cutover-delete-classifier` so that the acceptance line holds: G2 前置(03 divergence 达标,关键路由零漏报);删除 prompt-intents.ts 语义分类与 intent×plan-state TS 决策表,保留显式确定性触发;prompt-guard.sh ≤300 行;bun test 全绿、route-workflow-check eval 通过、phase-probe 计时 ≤ 基线;assets/ 镜像同步并标注 self-host/generated 影响;README hook 流程图与 lessons.md 更新

## Task Breakdown

- [x] Implement backlog task `loop-engine-07-cutover-delete-classifier` per the sprint PRD and Architecture Notes
- [x] Verify acceptance under G2 owner override: G2 evidence is not passed and remains residual risk; `prompt-intents.ts` semantic-classifier surface removed; intent×plan-state TS table removed; explicit trigger facts retained; `prompt-guard.sh` is 10 lines; `bun test` passed; route eval passed; prompt-guard timing smoke recorded; assets mirror synced; README hook flow and `tasks/lessons.md` updated

## Annotations
<!-- [NOTE]: prefixed inline. Claude processes all and revises. -->

## Task Breakdown
- [x] Implement backlog task `loop-engine-07-cutover-delete-classifier` per the sprint PRD and Architecture Notes
- [x] Verify acceptance under G2 owner override: G2 evidence is not passed and remains residual risk; `prompt-intents.ts` semantic-classifier surface removed; intent×plan-state TS table removed; explicit trigger facts retained; `prompt-guard.sh` is 10 lines; `bun test` passed; route eval passed; prompt-guard timing smoke recorded; assets mirror synced; README hook flow and `tasks/lessons.md` updated
