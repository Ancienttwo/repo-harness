# Plan: Sprint task: lsc-02-artifact-requirement-policy

> **Status**: Executing
> **Created**: 20260718-1405
> **Slug**: lsc-02-artifact-requirement-policy
> **Planning Source**: repo-harness-sprint
> **Orchestration Kind**: sprint-task
> **Source Ref**: sprint:plans/sprints/20260716-0101-loop-semantics-convergence.sprint.md#lsc-02-artifact-requirement-policy
> **Artifact Level**: work-package
> **Promotion Reason**: worktree_boundary
> **Post-ESA Program Baseline**: `origin/main@3b33cea2422b1aa1e5be9080be54f731c4f2015d` (PR #79)
> **LSC-02 Execution Base**: `origin/main@64673ee2c1148c2edfcea0afa097375898323841` (post-LSC-01 merge, PR #82)
> **Verification Boundary**: Commands named in the captured planning output plus `repo-harness run verify-contract --contract tasks/contracts/20260718-1405-lsc-02-artifact-requirement-policy.contract.md --strict`.
> **Rollback Surface**: Before execution remove `plans/plan-20260718-1405-lsc-02-artifact-requirement-policy.md`; after execution revert branch `codex/lsc-02-artifact-requirement-policy` or the explicitly reviewed diff.
> **Spec**: `docs/spec.md`
> **Research**: See `docs/researches/`
> **Task Contract**: `tasks/contracts/20260718-1405-lsc-02-artifact-requirement-policy.contract.md`
> **Task Review**: `tasks/reviews/20260718-1405-lsc-02-artifact-requirement-policy.review.md`
> **Implementation Notes**: `tasks/notes/20260718-1405-lsc-02-artifact-requirement-policy.notes.md`

## Agentic Routing
- Selected route: planning
- Routing reason: Captured from repo-harness-sprint planning output.
- Source ref: sprint:plans/sprints/20260716-0101-loop-semantics-convergence.sprint.md#lsc-02-artifact-requirement-policy
- Due diligence:
  - P1 map: See captured planning output below.
  - P2 trace: See captured planning output below.
  - P3 decision rationale: See captured planning output below.

## Workflow Inventory
Complete this inventory before implementation. If any line is unknown, keep the plan in Draft and fill it before projection.

- Active plan: `plans/plan-20260718-1405-lsc-02-artifact-requirement-policy.md`
- Sprint contract: `tasks/contracts/20260718-1405-lsc-02-artifact-requirement-policy.contract.md`
- Sprint review: `tasks/reviews/20260718-1405-lsc-02-artifact-requirement-policy.review.md`
- Implementation notes: `tasks/notes/20260718-1405-lsc-02-artifact-requirement-policy.notes.md`
- Deferred-goal ledger: `tasks/todos.md`
- Current checks: `.ai/harness/checks/latest.json`
- Run snapshots: `.ai/harness/runs/`
- Scope authority: `tasks/contracts/20260718-1405-lsc-02-artifact-requirement-policy.contract.md` `allowed_paths`
- Concurrency rule: `.ai/harness/active-plan` selects the active plan for this worktree when present; `.ai/harness/active-worktree` records the owning worktree. If another worktree already owns active work, open or switch to the matching worktree instead of serializing unrelated plans.
- Execution isolation: approved contract-level work projects through `repo-harness run plan-to-todo --plan plans/plan-20260718-1405-lsc-02-artifact-requirement-policy.md` and may start `repo-harness run contract-worktree start --plan plans/plan-20260718-1405-lsc-02-artifact-requirement-policy.md`.

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
| `src/core/workflow/artifact-requirement-policy.ts` | Create | Pure requirement matrix + `resolve({ profile, operation, risk, policy })`; module-owned edit/stop/ship operation type |
| `tests/state/fixtures/loop-semantics/artifact-requirement-policy.json` | Create | Positive cases for all nine cells; negative cases for raise semantics and invalid inputs |
| `tests/state/artifact-requirement-policy.test.ts` | Create | Fixture-driven test pinning matrix output; totality over 9 cells |
| `plans/sprints/20260716-0101-loop-semantics-convergence.sprint.md` | Edit | Pin LSC-02 Execution Base per successor rule |
| Contract/review/notes for this slug | Edit | Workflow envelope |

### Code Snippets
See captured planning output.

### Data Flow
See captured planning output.

## Risk Assessment
| Risk | Likelihood | Impact | Mitigation |
|------|------------|--------|------------|
| Captured plan lacks enough detail | Medium | Execution may need clarification | Stop before implementation if the captured output contradicts repo rules or lacks concrete file targets |

## Task Contracts
- Contract file: `tasks/contracts/20260718-1405-lsc-02-artifact-requirement-policy.contract.md`
- Review file: `tasks/reviews/20260718-1405-lsc-02-artifact-requirement-policy.review.md`
- Implementation notes file: `tasks/notes/20260718-1405-lsc-02-artifact-requirement-policy.notes.md`
- Template: `.claude/templates/contract.template.md`
- Verification command: `repo-harness run verify-contract --contract tasks/contracts/20260718-1405-lsc-02-artifact-requirement-policy.contract.md --strict`
- Active plan rule: this captured plan is written to `.ai/harness/active-plan` and the owning worktree is written to `.ai/harness/active-worktree` unless --no-active is used. Do not infer active execution from the latest non-archived plan.

## Handoff

- Checks file: `.ai/harness/checks/latest.json`
- Session handoff: `.ai/harness/handoff/current.md`

## Promotion Gate

- **Merge/PR unit**: Captured plan `plans/plan-20260718-1405-lsc-02-artifact-requirement-policy.md` is the proposed mergeable execution unit; revise before execute if this is only a checklist step.
- **Rollback surface**: Before execution remove `plans/plan-20260718-1405-lsc-02-artifact-requirement-policy.md`; after execution revert branch `codex/lsc-02-artifact-requirement-policy` or the explicitly reviewed diff.
- **Verification boundary**: Commands named in the captured planning output plus `repo-harness run verify-contract --contract tasks/contracts/20260718-1405-lsc-02-artifact-requirement-policy.contract.md --strict`.
- **Review/acceptance boundary**: `tasks/reviews/20260718-1405-lsc-02-artifact-requirement-policy.review.md` must record pass against the captured acceptance criteria.
- **High-risk surface**: Risks named in captured planning output; keep the plan Draft if risk ownership is not concrete.
- **Why not checklist row**: worktree_boundary

## Evidence Contract

- **State/progress path**: `plans/plan-20260718-1405-lsc-02-artifact-requirement-policy.md` task breakdown, `tasks/todos.md` deferred-goal ledger, `tasks/contracts/20260718-1405-lsc-02-artifact-requirement-policy.contract.md`, `tasks/reviews/20260718-1405-lsc-02-artifact-requirement-policy.review.md`, and `tasks/notes/20260718-1405-lsc-02-artifact-requirement-policy.notes.md`
- **Verification evidence**: `.ai/harness/checks/latest.json`, `.ai/harness/runs/`, and the commands named in the captured planning output
- **Evaluator rubric**: `tasks/reviews/20260718-1405-lsc-02-artifact-requirement-policy.review.md` must record a passing Waza /check style recommendation
- **Stop condition**: all task breakdown items are complete, sprint verification passes, and the review recommends pass
- **Rollback surface**: Before execution remove `plans/plan-20260718-1405-lsc-02-artifact-requirement-policy.md`; after execution revert branch `codex/lsc-02-artifact-requirement-policy` or the explicitly reviewed diff.

## Captured Planning Output

# Sprint Task: lsc-02-artifact-requirement-policy

## Context

- Sprint: `plans/sprints/20260716-0101-loop-semantics-convergence.sprint.md`
- Backlog row: 2
- Mode: contract
- Read the sprint Source PRD and Architecture Notes before implementation.
- The sprint row is a long-task waypoint, not a detailed implementation plan.

## Goal

Deliver backlog task `lsc-02-artifact-requirement-policy` so that the acceptance line holds: In an independent PR, establish one pure `ArtifactRequirementPolicy` matrix for Lite/Standard/Strict with positive/negative fixtures; do not switch consumers or implement readiness in this package

## Planning Expansion (resolved 2026-07-18)

The sprint row is expanded in place; the calibrated contract
`tasks/contracts/20260718-1405-lsc-02-artifact-requirement-policy.contract.md`
is the execution authority. Decision-complete inputs:

- Delta authority: the nine `target_delta` records frozen by LSC-01 in
  `tests/state/fixtures/loop-semantics/characterization.json`. The matrix
  encodes exactly these approved targets, not LSC-01's current-behavior cells.
- Module signature: `ArtifactRequirementPolicy.resolve({ profile, operation,
  risk, taskKind, policy })` per the audit
  (`plans/sprints/20260715-harness-loop-audit-and-optimization.md:224-242`).
- The edit/stop/ship operation axis is a new module-owned type; it is not
  `WorkflowOperationKind` (risk-signal axis in `src/core/workflow/profile.ts`,
  which has no stop/ship member).
- Placement: `src/core/workflow/artifact-requirement-policy.ts`, pure, sibling
  to the profile authority; consumers are not switched (that starts in LSC-03).
- Fixtures nest under `tests/state/fixtures/loop-semantics/` so they are not
  swept into ESA adapter-parity enumeration (LSC-01 notes deviation record).

## Annotations
<!-- [NOTE]: prefixed inline. Claude processes all and revises. -->

## Task Breakdown
- [x] Derive requirement keys and all nine cell values from the frozen `target_delta` records and the audit matrix; record the derivation in the notes file (no invented semantics)
- [x] Implement pure module `src/core/workflow/artifact-requirement-policy.ts` (literal matrix + `resolve` with risk/policy raise; module-owned edit/stop/ship type; exhaustiveness enforced)
- [x] Add fixture `tests/state/fixtures/loop-semantics/artifact-requirement-policy.json` and test `tests/state/artifact-requirement-policy.test.ts` (positive: all nine cells; negative: raise semantics, invalid profile/operation)
- [x] Pin `LSC-02 Execution Base: origin/main@64673ee2c1148c2edfcea0afa097375898323841` in the sprint header per successor rule
- [x] Run the full Exit Criteria command surface in this worktree and record evidence
- [x] Author the task review, obtain independent external acceptance, and ship as an independent PR against base `64673ee2`
