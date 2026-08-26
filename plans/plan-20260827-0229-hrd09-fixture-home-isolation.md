# Plan: HRD-09 fixture HOME isolation

> **Status**: Approved
> **Created**: 20260827-0229
> **Slug**: hrd09-fixture-home-isolation
> **Planning Source**: repo-harness-plan
> **Orchestration Kind**: host-plan
> **Source Ref**: (none)
> **Artifact Level**: work-package
> **Promotion Reason**: verification_boundary
> **Verification Boundary**: HRD-09 test passes twice well under its 120s budget plus typecheck
> **Rollback Surface**: Single revertable test-hygiene commit on main
> **Spec**: `docs/spec.md`
> **Research**: See `docs/researches/`
> **Task Contract**: `tasks/contracts/20260827-0229-hrd09-fixture-home-isolation.contract.md`
> **Task Review**: `tasks/reviews/20260827-0229-hrd09-fixture-home-isolation.review.md`
> **Implementation Notes**: `tasks/notes/20260827-0229-hrd09-fixture-home-isolation.notes.md`

## Agentic Routing
- Selected route: planning
- Routing reason: Captured from repo-harness-plan planning output.
- Source ref: (none)
- Due diligence:
  - P1 map: See captured planning output below.
  - P2 trace: See captured planning output below.
  - P3 decision rationale: See captured planning output below.

## Workflow Inventory
Complete this inventory before implementation. If any line is unknown, keep the plan in Draft and fill it before projection.

- Active plan: `plans/plan-20260827-0229-hrd09-fixture-home-isolation.md`
- Sprint contract: `tasks/contracts/20260827-0229-hrd09-fixture-home-isolation.contract.md`
- Sprint review: `tasks/reviews/20260827-0229-hrd09-fixture-home-isolation.review.md`
- Implementation notes: `tasks/notes/20260827-0229-hrd09-fixture-home-isolation.notes.md`
- Deferred-goal ledger: `tasks/todos.md`
- Current checks: `.ai/harness/checks/latest.json`
- Run snapshots: `.ai/harness/runs/`
- Scope authority: `tasks/contracts/20260827-0229-hrd09-fixture-home-isolation.contract.md` `allowed_paths`
- Concurrency rule: `.ai/harness/active-plan` selects the active plan for this worktree when present; `.ai/harness/active-worktree` records the owning worktree. If another worktree already owns active work, open or switch to the matching worktree instead of serializing unrelated plans.
- Execution isolation: approved contract-level work projects through `repo-harness run plan-to-todo --plan plans/plan-20260827-0229-hrd09-fixture-home-isolation.md` and may start `repo-harness run contract-worktree start --plan plans/plan-20260827-0229-hrd09-fixture-home-isolation.md`.

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
- Contract file: `tasks/contracts/20260827-0229-hrd09-fixture-home-isolation.contract.md`
- Review file: `tasks/reviews/20260827-0229-hrd09-fixture-home-isolation.review.md`
- Implementation notes file: `tasks/notes/20260827-0229-hrd09-fixture-home-isolation.notes.md`
- Template: `.claude/templates/contract.template.md`
- Verification command: `repo-harness run verify-contract --contract tasks/contracts/20260827-0229-hrd09-fixture-home-isolation.contract.md --strict`
- Active plan rule: this captured plan is written to `.ai/harness/active-plan` and the owning worktree is written to `.ai/harness/active-worktree` unless --no-active is used. Do not infer active execution from the latest non-archived plan.

## Handoff

- Checks file: `.ai/harness/checks/latest.json`
- Session handoff: `.ai/harness/handoff/current.md`

## Promotion Gate

- **Merge/PR unit**: Captured plan `plans/plan-20260827-0229-hrd09-fixture-home-isolation.md` is the proposed mergeable execution unit; revise before execute if this is only a checklist step.
- **Rollback surface**: Single revertable test-hygiene commit on main
- **Verification boundary**: HRD-09 test passes twice well under its 120s budget plus typecheck
- **Review/acceptance boundary**: `tasks/reviews/20260827-0229-hrd09-fixture-home-isolation.review.md` must record pass against the captured acceptance criteria.
- **High-risk surface**: Risks named in captured planning output; keep the plan Draft if risk ownership is not concrete.
- **Why not checklist row**: verification_boundary

## Evidence Contract

- **State/progress path**: `plans/plan-20260827-0229-hrd09-fixture-home-isolation.md` task breakdown, `tasks/todos.md` deferred-goal ledger, `tasks/contracts/20260827-0229-hrd09-fixture-home-isolation.contract.md`, `tasks/reviews/20260827-0229-hrd09-fixture-home-isolation.review.md`, and `tasks/notes/20260827-0229-hrd09-fixture-home-isolation.notes.md`
- **Verification evidence**: `.ai/harness/checks/latest.json`, `.ai/harness/runs/`, and the commands named in the captured planning output
- **Evaluator rubric**: `tasks/reviews/20260827-0229-hrd09-fixture-home-isolation.review.md` must record a passing Waza /check style recommendation
- **Stop condition**: all task breakdown items are complete, sprint verification passes, and the review recommends pass
- **Rollback surface**: Single revertable test-hygiene commit on main

## Captured Planning Output

## Goal

Fix the HRD-09 fixture HOME pollution so the test's Stop-route timing stays inside its budget, record the deferred cascade-scalability ledger row, and unblock the ME-1C closeout gate.

## Context

Root-cause diagnosis (2026-08-27) proved the HRD-09 timeout is self-inflicted: the test sets HOME to the repo under test, so bun transpile cache files enter the git-status-based architecture changed set and the Stop route spawns one CLI subprocess per path (170-205s vs the 120s budget). The earlier attribution to the ME-2B merge was a coin-flip artifact at the timeout boundary.

## Scope

- `tests/unit/hrd-09-legacy-retirement-and-adopted-migration.test.ts`: point the fixture HOME at a `mkdtempSync` directory outside the repo under test; clean it up on teardown.
- `tasks/todos.md`: one deferred row for the per-path cascade O(n) spawn in the Stop handler and the `child_processes` telemetry gap.

Out of scope: any product-code change in `src/`, the per-path cascade redesign itself, ME-1C contract content.

## Oracles

- `bun test tests/unit/hrd-09-legacy-retirement-and-adopted-migration.test.ts --timeout 60000` (twice, both pass, wall time well under the 120s budget)
- `bun run check:type`

## Task Breakdown

- [ ] Move the HRD-09 fixture HOME outside the repo under test with teardown cleanup.
- [ ] Record the cascade-scalability deferred row in tasks/todos.md.
- [ ] Run the oracles twice and commit.

## Annotations
<!-- [NOTE]: prefixed inline. Claude processes all and revises. -->

## Task Breakdown
- [ ] Move the HRD-09 fixture HOME outside the repo under test with teardown cleanup.
- [ ] Record the cascade-scalability deferred row in tasks/todos.md.
- [ ] Run the oracles twice and commit.
