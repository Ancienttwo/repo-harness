# Plan: Consolidate repository fixtures and script test ownership

> **Status**: Review
> **Created**: 20260912-1647
> **Slug**: test-fixture-consolidation
> **Planning Source**: codex-plan-or-waza-think
> **Orchestration Kind**: host-plan
> **Source Ref**: (none)
> **Artifact Level**: work-package
> **Promotion Reason**: verification_boundary
> **Verification Boundary**: All relocated and shared-fixture consumer test files individually, coverage inventory and required integrity checks
> **Rollback Surface**: Tests and task artifacts only
> **Spec**: `docs/spec.md`
> **Research**: See `docs/researches/`
> **Task Contract**: `tasks/contracts/20260912-1647-test-fixture-consolidation.contract.md`
> **Task Review**: `tasks/reviews/20260912-1647-test-fixture-consolidation.review.md`
> **Implementation Notes**: `tasks/notes/20260912-1647-test-fixture-consolidation.notes.md`

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

- Active plan: `plans/plan-20260912-1647-test-fixture-consolidation.md`
- Sprint contract: `tasks/contracts/20260912-1647-test-fixture-consolidation.contract.md`
- Sprint review: `tasks/reviews/20260912-1647-test-fixture-consolidation.review.md`
- Implementation notes: `tasks/notes/20260912-1647-test-fixture-consolidation.notes.md`
- Deferred-goal ledger: `tasks/todos.md`
- Current checks: `.ai/harness/checks/latest.json`
- Run snapshots: `.ai/harness/runs/`
- Scope authority: `tasks/contracts/20260912-1647-test-fixture-consolidation.contract.md` `allowed_paths`
- Concurrency rule: `.ai/harness/active-plan` selects the active plan for this worktree when present; `.ai/harness/active-worktree` records the owning worktree. If another worktree already owns active work, open or switch to the matching worktree instead of serializing unrelated plans.
- Execution isolation: approved contract-level work projects through `repo-harness run plan-to-todo --plan plans/plan-20260912-1647-test-fixture-consolidation.md` and may start `repo-harness run contract-worktree start --plan plans/plan-20260912-1647-test-fixture-consolidation.md`.

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
- Contract file: `tasks/contracts/20260912-1647-test-fixture-consolidation.contract.md`
- Review file: `tasks/reviews/20260912-1647-test-fixture-consolidation.review.md`
- Implementation notes file: `tasks/notes/20260912-1647-test-fixture-consolidation.notes.md`
- Template: `.claude/templates/contract.template.md`
- Verification command: `repo-harness run verify-contract --contract tasks/contracts/20260912-1647-test-fixture-consolidation.contract.md --strict`
- Active plan rule: this captured plan is written to `.ai/harness/active-plan` and the owning worktree is written to `.ai/harness/active-worktree` unless --no-active is used. Do not infer active execution from the latest non-archived plan.

## Handoff

- Checks file: `.ai/harness/checks/latest.json`
- Session handoff: `.ai/harness/handoff/current.md`

## Promotion Gate

- **Merge/PR unit**: Captured plan `plans/plan-20260912-1647-test-fixture-consolidation.md` is the proposed mergeable execution unit; revise before execute if this is only a checklist step.
- **Rollback surface**: Tests and task artifacts only
- **Verification boundary**: All relocated and shared-fixture consumer test files individually, coverage inventory and required integrity checks
- **Review/acceptance boundary**: `tasks/reviews/20260912-1647-test-fixture-consolidation.review.md` must record pass against the captured acceptance criteria.
- **High-risk surface**: Risks named in captured planning output; keep the plan Draft if risk ownership is not concrete.
- **Why not checklist row**: verification_boundary

## Evidence Contract

- **State/progress path**: `plans/plan-20260912-1647-test-fixture-consolidation.md` task breakdown, `tasks/todos.md` deferred-goal ledger, `tasks/contracts/20260912-1647-test-fixture-consolidation.contract.md`, `tasks/reviews/20260912-1647-test-fixture-consolidation.review.md`, and `tasks/notes/20260912-1647-test-fixture-consolidation.notes.md`
- **Verification evidence**: `.ai/harness/checks/latest.json`, `.ai/harness/runs/`, and the commands named in the captured planning output
- **Evaluator rubric**: `tasks/reviews/20260912-1647-test-fixture-consolidation.review.md` must record a passing Waza /check style recommendation
- **Stop condition**: all task breakdown items are complete, sprint verification passes, and the review recommends pass
- **Rollback surface**: Tests and task artifacts only

## Captured Planning Output

## Goal
Implement C1+C5: give repeated process/temp-repository scaffolding one owner at tests/helpers/repo-fixture.ts; relocate helper-scripts cases by script into existing owners where present. Preserve assertions, subprocess semantics and private mutable repositories/HOME. No C2 seed cache, sharding, duplicate scenario deletion or production change.

## P1 / P2 / P3
Tests invoke packaged helper scripts in temporary Git repositories. Existing helpers copy runtime templates and link source dependencies; process environment selects helper/runtime roots. The pressure point is duplicated construction code and one large discovery unit. Share only proven common scaffolding, keep domain builders separate and preserve every existing scenario. At 10x scale synchronous subprocess/setup remains the cost; splitting alone does not prove a serial-suite speedup.

## Acceptance Notes
No new behavior cases: each new test file owns an existing script boundary currently mixed into helper-scripts.test.ts. Map old test names/bodies to new owners and preserve dynamically generated cases. Verify each affected file independently and compare local wall times with the baseline; hosted CI timing remains a separate environment.

## Verification
Run affected files independently with bun test --timeout 60000, capture per-file timing and counts, typecheck and required repository-integrity checks. No local full suite: existing hosted CI remains the full-suite gate. No dependencies or production abstractions.

## Task Breakdown
- [x] Inventory ownership and capture focused baseline.
- [x] Consolidate fixture scaffolding and relocate script test cases without assertion loss.
- [x] Run independent affected-file checks and required integrity checks; document coverage and timing limits.
- [ ] Complete hosted CI and compare hosted per-file timing at the delivery boundary.

## Annotations
<!-- [NOTE]: prefixed inline. Claude processes all and revises. -->
