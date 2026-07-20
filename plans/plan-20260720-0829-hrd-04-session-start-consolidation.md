# Plan: Sprint task: hrd-04-session-start-consolidation

> **Status**: Executing
> **Created**: 20260720-0829
> **Slug**: hrd-04-session-start-consolidation
> **Planning Source**: repo-harness-sprint
> **Orchestration Kind**: sprint-task
> **Source Ref**: sprint:plans/sprints/20260719-1531-hook-runtime-diet.sprint.md#hrd-04-session-start-consolidation
> **Artifact Level**: work-package
> **Promotion Reason**: worktree_boundary
> **Verification Boundary**: Commands named in the captured planning output plus `repo-harness run verify-contract --contract tasks/contracts/20260720-0829-hrd-04-session-start-consolidation.contract.md --strict`.
> **Rollback Surface**: Before execution remove `plans/plan-20260720-0829-hrd-04-session-start-consolidation.md`; after execution revert branch `codex/hrd-04-session-start-consolidation` or the explicitly reviewed diff.
> **Spec**: `docs/spec.md`
> **Research**: See `docs/researches/`
> **Task Contract**: `tasks/contracts/20260720-0829-hrd-04-session-start-consolidation.contract.md`
> **Task Review**: `tasks/reviews/20260720-0829-hrd-04-session-start-consolidation.review.md`
> **Implementation Notes**: `tasks/notes/20260720-0829-hrd-04-session-start-consolidation.notes.md`

## Agentic Routing
- Selected route: planning
- Routing reason: Captured from repo-harness-sprint planning output.
- Source ref: sprint:plans/sprints/20260719-1531-hook-runtime-diet.sprint.md#hrd-04-session-start-consolidation
- Due diligence:
  - P1 map: See captured planning output below.
  - P2 trace: See captured planning output below.
  - P3 decision rationale: See captured planning output below.

## Workflow Inventory
Complete this inventory before implementation. If any line is unknown, keep the plan in Draft and fill it before projection.

- Active plan: `plans/plan-20260720-0829-hrd-04-session-start-consolidation.md`
- Sprint contract: `tasks/contracts/20260720-0829-hrd-04-session-start-consolidation.contract.md`
- Sprint review: `tasks/reviews/20260720-0829-hrd-04-session-start-consolidation.review.md`
- Implementation notes: `tasks/notes/20260720-0829-hrd-04-session-start-consolidation.notes.md`
- Deferred-goal ledger: `tasks/todos.md`
- Current checks: `.ai/harness/checks/latest.json`
- Run snapshots: `.ai/harness/runs/`
- Scope authority: `tasks/contracts/20260720-0829-hrd-04-session-start-consolidation.contract.md` `allowed_paths`
- Concurrency rule: `.ai/harness/active-plan` selects the active plan for this worktree when present; `.ai/harness/active-worktree` records the owning worktree. If another worktree already owns active work, open or switch to the matching worktree instead of serializing unrelated plans.
- Execution isolation: approved contract-level work projects through `repo-harness run plan-to-todo --plan plans/plan-20260720-0829-hrd-04-session-start-consolidation.md` and may start `repo-harness run contract-worktree start --plan plans/plan-20260720-0829-hrd-04-session-start-consolidation.md`.

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
- Contract file: `tasks/contracts/20260720-0829-hrd-04-session-start-consolidation.contract.md`
- Review file: `tasks/reviews/20260720-0829-hrd-04-session-start-consolidation.review.md`
- Implementation notes file: `tasks/notes/20260720-0829-hrd-04-session-start-consolidation.notes.md`
- Template: `.claude/templates/contract.template.md`
- Verification command: `repo-harness run verify-contract --contract tasks/contracts/20260720-0829-hrd-04-session-start-consolidation.contract.md --strict`
- Active plan rule: this captured plan is written to `.ai/harness/active-plan` and the owning worktree is written to `.ai/harness/active-worktree` unless --no-active is used. Do not infer active execution from the latest non-archived plan.

## Handoff

- Checks file: `.ai/harness/checks/latest.json`
- Session handoff: `.ai/harness/handoff/current.md`

## Promotion Gate

- **Merge/PR unit**: Captured plan `plans/plan-20260720-0829-hrd-04-session-start-consolidation.md` is the proposed mergeable execution unit; revise before execute if this is only a checklist step.
- **Rollback surface**: Before execution remove `plans/plan-20260720-0829-hrd-04-session-start-consolidation.md`; after execution revert branch `codex/hrd-04-session-start-consolidation` or the explicitly reviewed diff.
- **Verification boundary**: Commands named in the captured planning output plus `repo-harness run verify-contract --contract tasks/contracts/20260720-0829-hrd-04-session-start-consolidation.contract.md --strict`.
- **Review/acceptance boundary**: `tasks/reviews/20260720-0829-hrd-04-session-start-consolidation.review.md` must record pass against the captured acceptance criteria.
- **High-risk surface**: Risks named in captured planning output; keep the plan Draft if risk ownership is not concrete.
- **Why not checklist row**: worktree_boundary

## Evidence Contract

- **State/progress path**: `plans/plan-20260720-0829-hrd-04-session-start-consolidation.md` task breakdown, `tasks/todos.md` deferred-goal ledger, `tasks/contracts/20260720-0829-hrd-04-session-start-consolidation.contract.md`, `tasks/reviews/20260720-0829-hrd-04-session-start-consolidation.review.md`, and `tasks/notes/20260720-0829-hrd-04-session-start-consolidation.notes.md`
- **Verification evidence**: `.ai/harness/checks/latest.json`, `.ai/harness/runs/`, and the commands named in the captured planning output
- **Evaluator rubric**: `tasks/reviews/20260720-0829-hrd-04-session-start-consolidation.review.md` must record a passing Waza /check style recommendation
- **Stop condition**: all task breakdown items are complete, sprint verification passes, and the review recommends pass
- **Rollback surface**: Before execution remove `plans/plan-20260720-0829-hrd-04-session-start-consolidation.md`; after execution revert branch `codex/hrd-04-session-start-consolidation` or the explicitly reviewed diff.

## Captured Planning Output

# Sprint Task: hrd-04-session-start-consolidation

## Context

- Sprint: `plans/sprints/20260719-1531-hook-runtime-diet.sprint.md`
- Backlog row: 4
- Mode: contract
- Read the sprint Source PRD and Architecture Notes before implementation.
- The sprint row is a long-task waypoint, not a detailed implementation plan.

## Goal

Deliver backlog task `hrd-04-session-start-consolidation` so that the acceptance line holds: In an independent PR, collapse `session-start-context.sh`, `minimal-change-context.sh`, and `security-sentinel.sh` into the existing TS aggregation/budget path with one context assembly and one budget pass per event; the 1500-token hard cap and fail-closed overflow are retained, content parity against the HRD-01 baseline holds modulo approved cost-only deltas, no packet content redesign occurs (EPC-08 scope), and the three scripts are deleted with the projection re-synced in the same package

## Planning Expansion

Before editing code, use `$think` to expand this sprint row into a decision-complete implementation plan. The `$think` pass should read the sprint file, preserve the acceptance line, name concrete files or commands, and produce the detailed `plans/plan-*.md` body that drives contract execution.

## Task Breakdown

- [ ] Run `$think` for backlog task `hrd-04-session-start-consolidation` using sprint `plans/sprints/20260719-1531-hook-runtime-diet.sprint.md` and acceptance: In an independent PR, collapse `session-start-context.sh`, `minimal-change-context.sh`, and `security-sentinel.sh` into the existing TS aggregation/budget path with one context assembly and one budget pass per event; the 1500-token hard cap and fail-closed overflow are retained, content parity against the HRD-01 baseline holds modulo approved cost-only deltas, no packet content redesign occurs (EPC-08 scope), and the three scripts are deleted with the projection re-synced in the same package
- [ ] Capture the approved `$think` output with `repo-harness run capture-plan --source waza-think --source-ref sprint:plans/sprints/20260719-1531-hook-runtime-diet.sprint.md#hrd-04-session-start-consolidation`
- [ ] Verify acceptance: In an independent PR, collapse `session-start-context.sh`, `minimal-change-context.sh`, and `security-sentinel.sh` into the existing TS aggregation/budget path with one context assembly and one budget pass per event; the 1500-token hard cap and fail-closed overflow are retained, content parity against the HRD-01 baseline holds modulo approved cost-only deltas, no packet content redesign occurs (EPC-08 scope), and the three scripts are deleted with the projection re-synced in the same package

## Annotations
<!-- [NOTE]: prefixed inline. Claude processes all and revises. -->

## Task Breakdown
- [ ] Run `$think` for backlog task `hrd-04-session-start-consolidation` using sprint `plans/sprints/20260719-1531-hook-runtime-diet.sprint.md` and acceptance: In an independent PR, collapse `session-start-context.sh`, `minimal-change-context.sh`, and `security-sentinel.sh` into the existing TS aggregation/budget path with one context assembly and one budget pass per event; the 1500-token hard cap and fail-closed overflow are retained, content parity against the HRD-01 baseline holds modulo approved cost-only deltas, no packet content redesign occurs (EPC-08 scope), and the three scripts are deleted with the projection re-synced in the same package
- [ ] Capture the approved `$think` output with `repo-harness run capture-plan --source waza-think --source-ref sprint:plans/sprints/20260719-1531-hook-runtime-diet.sprint.md#hrd-04-session-start-consolidation`
- [ ] Verify acceptance: In an independent PR, collapse `session-start-context.sh`, `minimal-change-context.sh`, and `security-sentinel.sh` into the existing TS aggregation/budget path with one context assembly and one budget pass per event; the 1500-token hard cap and fail-closed overflow are retained, content parity against the HRD-01 baseline holds modulo approved cost-only deltas, no packet content redesign occurs (EPC-08 scope), and the three scripts are deleted with the projection re-synced in the same package
