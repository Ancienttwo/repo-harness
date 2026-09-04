> **Archived**: 2026-09-04 18:58
> **Related Plan**: plans/archive/plan-20260904-1209-refactor-discovery-proposal-authoring.md
> **Outcome**: Completed
> **Lifecycle**: plan
> **Parent Run ID**: run-20260904-1858
> **Archive Projection V1**: `plans/plan-20260904-1209-refactor-discovery-proposal-authoring.md` => `plans/archive/plan-20260904-1209-refactor-discovery-proposal-authoring.md`
> **Archive Projection V1**: `tasks/notes/20260904-1209-refactor-discovery-proposal-authoring.notes.md` => `tasks/archive/notes-20260904-1858-refactor-discovery-proposal-authoring.md`
> **Archive Projection V1**: `tasks/contracts/20260904-1209-refactor-discovery-proposal-authoring.contract.md` => `tasks/archive/contract-20260904-1858-refactor-discovery-proposal-authoring.md`
> **Archive Projection V1**: `tasks/reviews/20260904-1209-refactor-discovery-proposal-authoring.review.md` => `tasks/archive/review-20260904-1858-refactor-discovery-proposal-authoring.md`

# Plan: Refactor discovery and proposal authoring

> **Status**: Archived
> **Created**: 20260904-1209
> **Slug**: refactor-discovery-proposal-authoring
> **Planning Source**: codex-plan
> **Orchestration Kind**: host-plan
> **Source Ref**: prd:plans/prds/20260903-0435-archctx-backed-refactor-mode.prd.md#Module-2
> **Artifact Level**: work-package
> **Promotion Reason**: verification_boundary
> **Verification Boundary**: two-scan authoring contract and focused provider tests
> **Rollback Surface**: additive refactor authoring and discovery boundaries
> **Spec**: `docs/spec.md`
> **Research**: See `docs/researches/`
> **Task Contract**: `tasks/archive/contract-20260904-1858-refactor-discovery-proposal-authoring.md`
> **Task Review**: `tasks/archive/review-20260904-1858-refactor-discovery-proposal-authoring.md`
> **Implementation Notes**: `tasks/archive/notes-20260904-1858-refactor-discovery-proposal-authoring.md`

## Agentic Routing
- Selected route: planning
- Routing reason: Captured from codex-plan planning output.
- Source ref: prd:plans/prds/20260903-0435-archctx-backed-refactor-mode.prd.md#Module-2
- Due diligence:
  - P1 map: See captured planning output below.
  - P2 trace: See captured planning output below.
  - P3 decision rationale: See captured planning output below.

## Workflow Inventory
Complete this inventory before implementation. If any line is unknown, keep the plan in Draft and fill it before projection.

- Active plan: `plans/archive/plan-20260904-1209-refactor-discovery-proposal-authoring.md`
- Sprint contract: `tasks/archive/contract-20260904-1858-refactor-discovery-proposal-authoring.md`
- Sprint review: `tasks/archive/review-20260904-1858-refactor-discovery-proposal-authoring.md`
- Implementation notes: `tasks/archive/notes-20260904-1858-refactor-discovery-proposal-authoring.md`
- Deferred-goal ledger: `tasks/todos.md`
- Current checks: `.ai/harness/checks/latest.json`
- Run snapshots: `.ai/harness/runs/`
- Scope authority: `tasks/archive/contract-20260904-1858-refactor-discovery-proposal-authoring.md` `allowed_paths`
- Concurrency rule: `.ai/harness/active-plan` selects the active plan for this worktree when present; `.ai/harness/active-worktree` records the owning worktree. If another worktree already owns active work, open or switch to the matching worktree instead of serializing unrelated plans.
- Execution isolation: approved contract-level work projects through `repo-harness run plan-to-todo --plan plans/archive/plan-20260904-1209-refactor-discovery-proposal-authoring.md` and may start `repo-harness run contract-worktree start --plan plans/archive/plan-20260904-1209-refactor-discovery-proposal-authoring.md`.

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
- Contract file: `tasks/archive/contract-20260904-1858-refactor-discovery-proposal-authoring.md`
- Review file: `tasks/archive/review-20260904-1858-refactor-discovery-proposal-authoring.md`
- Implementation notes file: `tasks/archive/notes-20260904-1858-refactor-discovery-proposal-authoring.md`
- Template: `.claude/templates/contract.template.md`
- Verification command: `repo-harness run verify-contract --contract tasks/archive/contract-20260904-1858-refactor-discovery-proposal-authoring.md --strict`
- Active plan rule: this captured plan is written to `.ai/harness/active-plan` and the owning worktree is written to `.ai/harness/active-worktree` unless --no-active is used. Do not infer active execution from the latest non-archived plan.

## Handoff

- Checks file: `.ai/harness/checks/latest.json`
- Session handoff: `.ai/harness/handoff/current.md`

## Promotion Gate

- **Merge/PR unit**: Captured plan `plans/archive/plan-20260904-1209-refactor-discovery-proposal-authoring.md` is the proposed mergeable execution unit; revise before execute if this is only a checklist step.
- **Rollback surface**: additive refactor authoring and discovery boundaries
- **Verification boundary**: two-scan authoring contract and focused provider tests
- **Review/acceptance boundary**: `tasks/archive/review-20260904-1858-refactor-discovery-proposal-authoring.md` must record pass against the captured acceptance criteria.
- **High-risk surface**: Risks named in captured planning output; keep the plan Draft if risk ownership is not concrete.
- **Why not checklist row**: verification_boundary

## Evidence Contract

- **State/progress path**: `plans/archive/plan-20260904-1209-refactor-discovery-proposal-authoring.md` task breakdown, `tasks/todos.md` deferred-goal ledger, `tasks/archive/contract-20260904-1858-refactor-discovery-proposal-authoring.md`, `tasks/archive/review-20260904-1858-refactor-discovery-proposal-authoring.md`, and `tasks/archive/notes-20260904-1858-refactor-discovery-proposal-authoring.md`
- **Verification evidence**: `.ai/harness/checks/latest.json`, `.ai/harness/runs/`, and the commands named in the captured planning output
- **Evaluator rubric**: `tasks/archive/review-20260904-1858-refactor-discovery-proposal-authoring.md` must record a passing Waza /check style recommendation
- **Stop condition**: all task breakdown items are complete, sprint verification passes, and the review recommends pass
- **Rollback surface**: additive refactor authoring and discovery boundaries

## Captured Planning Output

## Objective
Deliver Module 2 as a stateless discovery/proposal-authoring boundary that composes with Module 3 now and Module 4 state orchestration later.

## P1 · Architecture Map
ArchContext 0.5.2 owns observations, proposal validation, scale, and recommendation identities. src/core/refactor owns the closed authoring input; src/effects/refactor owns the two-scan loop. Module 4 remains the owner of persistence, policy state, CLI lifecycle, and author dispatch. No routing or materialization is in scope.

## P2 · Concrete Trace
A proposal-free RefactorRequestV1 enters runRefactorScan, returns only structural_observation candidates with scale/proposalDigest null, and is projected to stable C01 aliases. An accountable local/developer author submits only intent/scopePaths/targetOutcomes/killList/optional targetDelta. The harness verifies every scope path is an existing repository file, reruns the exact request with the proposal, and accepts only a proposal-bound non-null ArchContext scale.

## P3 · Decision
Keep Module 2 stateless so Module 4 remains the sole event/state authority and can call this boundary without duplicated program state. Use archctx-contracts exports for author pairs, proposal digest, and validation. Reject directories, globs, illegal authors, extra semantic fields, and malformed scan transitions; never infer scale or route locally.

## Scope
- Add the closed proposal-authoring core and discovery/assessment effect.
- Preserve AC_REFACTOR_PROPOSAL_UNAUTHORED exactly.
- Add focused tests for author Cartesian-product behavior, forbidden scale/route input, proposal-free discovery, candidate alias binding, file-only scope, and proposal-bound scale.
- Update the PRD/research stale completion snapshot for Modules 1/3 and Program A 0.5.2.

## Out of Scope
Module 4 persistence/state machine and CLI, GPT Pro transport execution, workflow route projection, materialization, execution, board, canary activation.

## Verification
bun test tests/unit/refactor-discovery-proposal-authoring.test.ts tests/unit/refactor-provider-contract.test.ts tests/refactor-archctx-provider.test.ts --timeout 60000
bun run check:type

## Rollback
Revert the additive Module 2 core/effect/tests and documentation snapshot. No persisted format or runtime migration is introduced.

## Annotations
<!-- [NOTE]: prefixed inline. Claude processes all and revises. -->

## Task Breakdown
- [x] Execute captured plan: Refactor discovery and proposal authoring
