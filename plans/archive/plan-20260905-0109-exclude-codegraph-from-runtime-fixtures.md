> **Archived**: 2026-09-05 01:15
> **Related Plan**: plans/archive/plan-20260905-0109-exclude-codegraph-from-runtime-fixtures.md
> **Outcome**: Completed
> **Lifecycle**: plan
> **Parent Run ID**: run-20260905-0115
> **Archive Projection V1**: `plans/plan-20260905-0109-exclude-codegraph-from-runtime-fixtures.md` => `plans/archive/plan-20260905-0109-exclude-codegraph-from-runtime-fixtures.md`
> **Archive Projection V1**: `tasks/notes/20260905-0109-exclude-codegraph-from-runtime-fixtures.notes.md` => `tasks/archive/notes-20260905-0115-exclude-codegraph-from-runtime-fixtures.md`
> **Archive Projection V1**: `tasks/contracts/20260905-0109-exclude-codegraph-from-runtime-fixtures.contract.md` => `tasks/archive/contract-20260905-0115-exclude-codegraph-from-runtime-fixtures.md`
> **Archive Projection V1**: `tasks/reviews/20260905-0109-exclude-codegraph-from-runtime-fixtures.review.md` => `tasks/archive/review-20260905-0115-exclude-codegraph-from-runtime-fixtures.md`

# Plan: Exclude CodeGraph runtime state from copied test fixtures

> **Status**: Archived
> **Created**: 20260905-0109
> **Slug**: exclude-codegraph-from-runtime-fixtures
> **Planning Source**: codex-plan-or-waza-think
> **Orchestration Kind**: host-plan
> **Source Ref**: (none)
> **Artifact Level**: work-package
> **Promotion Reason**: verification_boundary
> **Verification Boundary**: Commands named in the captured planning output plus `repo-harness run verify-contract --contract tasks/archive/contract-20260905-0115-exclude-codegraph-from-runtime-fixtures.md --strict`.
> **Rollback Surface**: Before execution remove `plans/archive/plan-20260905-0109-exclude-codegraph-from-runtime-fixtures.md`; after execution revert branch `codex/exclude-codegraph-from-runtime-fixtures` or the explicitly reviewed diff.
> **Spec**: `docs/spec.md`
> **Research**: See `docs/researches/`
> **Task Contract**: `tasks/archive/contract-20260905-0115-exclude-codegraph-from-runtime-fixtures.md`
> **Task Review**: `tasks/archive/review-20260905-0115-exclude-codegraph-from-runtime-fixtures.md`
> **Implementation Notes**: `tasks/archive/notes-20260905-0115-exclude-codegraph-from-runtime-fixtures.md`

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

- Active plan: `plans/archive/plan-20260905-0109-exclude-codegraph-from-runtime-fixtures.md`
- Sprint contract: `tasks/archive/contract-20260905-0115-exclude-codegraph-from-runtime-fixtures.md`
- Sprint review: `tasks/archive/review-20260905-0115-exclude-codegraph-from-runtime-fixtures.md`
- Implementation notes: `tasks/archive/notes-20260905-0115-exclude-codegraph-from-runtime-fixtures.md`
- Deferred-goal ledger: `tasks/todos.md`
- Current checks: `.ai/harness/checks/latest.json`
- Run snapshots: `.ai/harness/runs/`
- Scope authority: `tasks/archive/contract-20260905-0115-exclude-codegraph-from-runtime-fixtures.md` `allowed_paths`
- Concurrency rule: `.ai/harness/active-plan` selects the active plan for this worktree when present; `.ai/harness/active-worktree` records the owning worktree. If another worktree already owns active work, open or switch to the matching worktree instead of serializing unrelated plans.
- Execution isolation: approved contract-level work projects through `repo-harness run plan-to-todo --plan plans/archive/plan-20260905-0109-exclude-codegraph-from-runtime-fixtures.md` and may start `repo-harness run contract-worktree start --plan plans/archive/plan-20260905-0109-exclude-codegraph-from-runtime-fixtures.md`.

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
- Contract file: `tasks/archive/contract-20260905-0115-exclude-codegraph-from-runtime-fixtures.md`
- Review file: `tasks/archive/review-20260905-0115-exclude-codegraph-from-runtime-fixtures.md`
- Implementation notes file: `tasks/archive/notes-20260905-0115-exclude-codegraph-from-runtime-fixtures.md`
- Template: `.claude/templates/contract.template.md`
- Verification command: `repo-harness run verify-contract --contract tasks/archive/contract-20260905-0115-exclude-codegraph-from-runtime-fixtures.md --strict`
- Active plan rule: this captured plan is written to `.ai/harness/active-plan` and the owning worktree is written to `.ai/harness/active-worktree` unless --no-active is used. Do not infer active execution from the latest non-archived plan.

## Handoff

- Checks file: `.ai/harness/checks/latest.json`
- Session handoff: `.ai/harness/handoff/current.md`

## Promotion Gate

- **Merge/PR unit**: Captured plan `plans/archive/plan-20260905-0109-exclude-codegraph-from-runtime-fixtures.md` is the proposed mergeable execution unit; revise before execute if this is only a checklist step.
- **Rollback surface**: Before execution remove `plans/archive/plan-20260905-0109-exclude-codegraph-from-runtime-fixtures.md`; after execution revert branch `codex/exclude-codegraph-from-runtime-fixtures` or the explicitly reviewed diff.
- **Verification boundary**: Commands named in the captured planning output plus `repo-harness run verify-contract --contract tasks/archive/contract-20260905-0115-exclude-codegraph-from-runtime-fixtures.md --strict`.
- **Review/acceptance boundary**: `tasks/archive/review-20260905-0115-exclude-codegraph-from-runtime-fixtures.md` must record pass against the captured acceptance criteria.
- **High-risk surface**: Risks named in captured planning output; keep the plan Draft if risk ownership is not concrete.
- **Why not checklist row**: verification_boundary

## Evidence Contract

- **State/progress path**: `plans/archive/plan-20260905-0109-exclude-codegraph-from-runtime-fixtures.md` task breakdown, `tasks/todos.md` deferred-goal ledger, `tasks/archive/contract-20260905-0115-exclude-codegraph-from-runtime-fixtures.md`, `tasks/archive/review-20260905-0115-exclude-codegraph-from-runtime-fixtures.md`, and `tasks/archive/notes-20260905-0115-exclude-codegraph-from-runtime-fixtures.md`
- **Verification evidence**: `.ai/harness/checks/latest.json`, `.ai/harness/runs/`, and the commands named in the captured planning output
- **Evaluator rubric**: `tasks/archive/review-20260905-0115-exclude-codegraph-from-runtime-fixtures.md` must record a passing Waza /check style recommendation
- **Stop condition**: all task breakdown items are complete, sprint verification passes, and the review recommends pass
- **Rollback surface**: Before execution remove `plans/archive/plan-20260905-0109-exclude-codegraph-from-runtime-fixtures.md`; after execution revert branch `codex/exclude-codegraph-from-runtime-fixtures` or the explicitly reviewed diff.

## Captured Planning Output

## Goal
Make full-suite fixture copies ignore repository-local CodeGraph runtime state so Unix sockets are never copied.

## Task Breakdown
- [x] Exclude .codegraph from the two whole-repository runtime fixture copy filters.
- [x] Run both affected test files and required workflow checks.

## Acceptance
- Both affected test files pass while .codegraph/daemon.sock exists.
- No production behavior changes.

## Annotations
<!-- [NOTE]: prefixed inline. Claude processes all and revises. -->

## Task Breakdown
- [x] Exclude .codegraph from the two whole-repository runtime fixture copy filters.
- [x] Run both affected test files and required workflow checks.
