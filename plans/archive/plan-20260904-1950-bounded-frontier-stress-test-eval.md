> **Archived**: 2026-09-04 22:39
> **Related Plan**: plans/archive/plan-20260904-1950-bounded-frontier-stress-test-eval.md
> **Outcome**: Completed
> **Lifecycle**: plan
> **Parent Run ID**: run-20260904-2239
> **Archive Projection V1**: `plans/plan-20260904-1950-bounded-frontier-stress-test-eval.md` => `plans/archive/plan-20260904-1950-bounded-frontier-stress-test-eval.md`
> **Archive Projection V1**: `tasks/notes/20260904-1950-bounded-frontier-stress-test-eval.notes.md` => `tasks/archive/notes-20260904-2239-bounded-frontier-stress-test-eval.md`
> **Archive Projection V1**: `tasks/contracts/20260904-1950-bounded-frontier-stress-test-eval.contract.md` => `tasks/archive/contract-20260904-2239-bounded-frontier-stress-test-eval.md`
> **Archive Projection V1**: `tasks/reviews/20260904-1950-bounded-frontier-stress-test-eval.review.md` => `tasks/archive/review-20260904-2239-bounded-frontier-stress-test-eval.md`

# Plan: Bounded Frontier Stress Test Eval

> **Status**: Archived
> **Created**: 20260904-1950
> **Slug**: bounded-frontier-stress-test-eval
> **Planning Source**: user-approved-plan
> **Orchestration Kind**: repo-harness-plan
> **Source Ref**: (none)
> **Artifact Level**: work-package
> **Promotion Reason**: verification_boundary
> **Verification Boundary**: Commands named in the captured planning output plus `repo-harness run verify-contract --contract tasks/archive/contract-20260904-2239-bounded-frontier-stress-test-eval.md --strict`.
> **Rollback Surface**: Before execution remove `plans/archive/plan-20260904-1950-bounded-frontier-stress-test-eval.md`; after execution revert branch `codex/bounded-frontier-stress-test-eval` or the explicitly reviewed diff.
> **Spec**: `docs/spec.md`
> **Research**: See `docs/researches/`
> **Task Contract**: `tasks/archive/contract-20260904-2239-bounded-frontier-stress-test-eval.md`
> **Task Review**: `tasks/archive/review-20260904-2239-bounded-frontier-stress-test-eval.md`
> **Implementation Notes**: `tasks/archive/notes-20260904-2239-bounded-frontier-stress-test-eval.md`

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

- Active plan: `plans/archive/plan-20260904-1950-bounded-frontier-stress-test-eval.md`
- Sprint contract: `tasks/archive/contract-20260904-2239-bounded-frontier-stress-test-eval.md`
- Sprint review: `tasks/archive/review-20260904-2239-bounded-frontier-stress-test-eval.md`
- Implementation notes: `tasks/archive/notes-20260904-2239-bounded-frontier-stress-test-eval.md`
- Deferred-goal ledger: `tasks/todos.md`
- Current checks: `.ai/harness/checks/latest.json`
- Run snapshots: `.ai/harness/runs/`
- Scope authority: `tasks/archive/contract-20260904-2239-bounded-frontier-stress-test-eval.md` `allowed_paths`
- Concurrency rule: `.ai/harness/active-plan` selects the active plan for this worktree when present; `.ai/harness/active-worktree` records the owning worktree. If another worktree already owns active work, open or switch to the matching worktree instead of serializing unrelated plans.
- Execution isolation: approved contract-level work projects through `repo-harness run plan-to-todo --plan plans/archive/plan-20260904-1950-bounded-frontier-stress-test-eval.md` and may start `repo-harness run contract-worktree start --plan plans/archive/plan-20260904-1950-bounded-frontier-stress-test-eval.md`.

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
- Contract file: `tasks/archive/contract-20260904-2239-bounded-frontier-stress-test-eval.md`
- Review file: `tasks/archive/review-20260904-2239-bounded-frontier-stress-test-eval.md`
- Implementation notes file: `tasks/archive/notes-20260904-2239-bounded-frontier-stress-test-eval.md`
- Template: `.claude/templates/contract.template.md`
- Verification command: `repo-harness run verify-contract --contract tasks/archive/contract-20260904-2239-bounded-frontier-stress-test-eval.md --strict`
- Active plan rule: this captured plan is written to `.ai/harness/active-plan` and the owning worktree is written to `.ai/harness/active-worktree` unless --no-active is used. Do not infer active execution from the latest non-archived plan.

## Handoff

- Checks file: `.ai/harness/checks/latest.json`
- Session handoff: `.ai/harness/handoff/current.md`

## Promotion Gate

- **Merge/PR unit**: Captured plan `plans/archive/plan-20260904-1950-bounded-frontier-stress-test-eval.md` is the proposed mergeable execution unit; revise before execute if this is only a checklist step.
- **Rollback surface**: Before execution remove `plans/archive/plan-20260904-1950-bounded-frontier-stress-test-eval.md`; after execution revert branch `codex/bounded-frontier-stress-test-eval` or the explicitly reviewed diff.
- **Verification boundary**: Commands named in the captured planning output plus `repo-harness run verify-contract --contract tasks/archive/contract-20260904-2239-bounded-frontier-stress-test-eval.md --strict`.
- **Review/acceptance boundary**: `tasks/archive/review-20260904-2239-bounded-frontier-stress-test-eval.md` must record pass against the captured acceptance criteria.
- **High-risk surface**: Risks named in captured planning output; keep the plan Draft if risk ownership is not concrete.
- **Why not checklist row**: verification_boundary

## Evidence Contract

- **State/progress path**: `plans/archive/plan-20260904-1950-bounded-frontier-stress-test-eval.md` task breakdown, `tasks/todos.md` deferred-goal ledger, `tasks/archive/contract-20260904-2239-bounded-frontier-stress-test-eval.md`, `tasks/archive/review-20260904-2239-bounded-frontier-stress-test-eval.md`, and `tasks/archive/notes-20260904-2239-bounded-frontier-stress-test-eval.md`
- **Verification evidence**: `.ai/harness/checks/latest.json`, `.ai/harness/runs/`, and the commands named in the captured planning output
- **Evaluator rubric**: `tasks/archive/review-20260904-2239-bounded-frontier-stress-test-eval.md` must record a passing Waza /check style recommendation
- **Stop condition**: all task breakdown items are complete, sprint verification passes, and the review recommends pass
- **Rollback surface**: Before execution remove `plans/archive/plan-20260904-1950-bounded-frontier-stress-test-eval.md`; after execution revert branch `codex/bounded-frontier-stress-test-eval` or the explicitly reviewed diff.

## Captured Planning Output

# Bounded frontier stress-test extraction eval

## Goal
Create an isolated A/B evaluation that compares the current minimum-effective interview with the same protocol plus bounded decision-frontier ordering, without changing managed Skills or default Plan behavior.

## Scope
- Add an eval-only treatment Skill under evals/frontier-stress-test.
- Add five cases: three historical dependency cases, one answered-decision persistence case, and one simple-task negative control.
- Reuse scripts/run-skill-evals.ts through its exported API; make this eval's live path fail closed on disposable isolation and remove arm-specific source access.
- Record P1/P2/P3, provenance, decision gates, and limitations in docs/researches.

## Non-scope
- No managed Skill, manifest, profile, hook, CLI, dependency, CONTEXT, ADR, decision-tree, or session-log change.
- No live provider run and no grader/effectiveness claim from dry-run evidence.
- No default Plan creation change or implementation after questioning.

## Design
Copy the canonical planning baseline into both fixture arms. Materialize the frontier delta only in the with_skill workspace so both arms retain the same disposable-clone visibility and command permissions, with no extra repository path granted to the treatment arm. Require at most three current-frontier questions, two rounds per invocation, explicit continue for more, Draft plus UNKNOWN:BLOCKING for unresolved user decisions, mapping into existing PRD Plan Contract spec and architecture authorities, and hard-kill graders for false activation, forbidden artifacts, Approved-with-blockers, and implementation starts. Semantic review, not regex, owns the invented-answer judgment.

## Verification
- Parse the eval manifest and benchmark config.
- Run the isolated benchmark in dry-run mode to verify fixture, profile, command, and report wiring; targeted tests exercise the structural grader.
- Run targeted eval and workflow checks required by the active contract.

## Rollback
Revert the eval directory, research record, and workflow artifacts; runtime product behavior is unchanged.

## Annotations
<!-- [NOTE]: prefixed inline. Claude processes all and revises. -->

## Task Breakdown
- [x] Execute captured plan: Bounded Frontier Stress Test Eval
