# Plan: Self-host adopt boundary fix

> **Status**: Archived
> **Created**: 20260715-0401
> **Slug**: self-host-adopt-boundary
> **Planning Source**: codex-plan
> **Orchestration Kind**: host-plan
> **Source Ref**: (none)
> **Artifact Level**: work-package
> **Promotion Reason**: risk_boundary
> **Verification Boundary**: Installed and source CLIs must both produce zero downstream adopt operations for the source checkout
> **Rollback Surface**: Revert the single source-checkout boundary commit
> **Spec**: `docs/spec.md`
> **Research**: See `docs/researches/`
> **Task Contract**: `tasks/contracts/20260715-0401-self-host-adopt-boundary.contract.md`
> **Task Review**: `tasks/reviews/20260715-0401-self-host-adopt-boundary.review.md`
> **Implementation Notes**: `tasks/notes/20260715-0401-self-host-adopt-boundary.notes.md`

## Agentic Routing
- Selected route: planning
- Routing reason: Captured from codex-plan planning output.
- Source ref: (none)
- Due diligence:
  - P1 map: See captured planning output below.
  - P2 trace: See captured planning output below.
  - P3 decision rationale: See captured planning output below.

## Workflow Inventory
Complete this inventory before implementation. If any line is unknown, keep the plan in Draft and fill it before projection.

- Active plan: `plans/plan-20260715-0401-self-host-adopt-boundary.md`
- Sprint contract: `tasks/contracts/20260715-0401-self-host-adopt-boundary.contract.md`
- Sprint review: `tasks/reviews/20260715-0401-self-host-adopt-boundary.review.md`
- Implementation notes: `tasks/notes/20260715-0401-self-host-adopt-boundary.notes.md`
- Deferred-goal ledger: `tasks/todos.md`
- Current checks: `.ai/harness/checks/latest.json`
- Run snapshots: `.ai/harness/runs/`
- Scope authority: `tasks/contracts/20260715-0401-self-host-adopt-boundary.contract.md` `allowed_paths`
- Concurrency rule: `.ai/harness/active-plan` selects the active plan for this worktree when present; `.ai/harness/active-worktree` records the owning worktree. If another worktree already owns active work, open or switch to the matching worktree instead of serializing unrelated plans.
- Execution isolation: approved contract-level work projects through `repo-harness run plan-to-todo --plan plans/plan-20260715-0401-self-host-adopt-boundary.md` and may start `repo-harness run contract-worktree start --plan plans/plan-20260715-0401-self-host-adopt-boundary.md`.

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
- Contract file: `tasks/contracts/20260715-0401-self-host-adopt-boundary.contract.md`
- Review file: `tasks/reviews/20260715-0401-self-host-adopt-boundary.review.md`
- Implementation notes file: `tasks/notes/20260715-0401-self-host-adopt-boundary.notes.md`
- Template: `.claude/templates/contract.template.md`
- Verification command: `repo-harness run verify-contract --contract tasks/contracts/20260715-0401-self-host-adopt-boundary.contract.md --strict`
- Active plan rule: this captured plan is written to `.ai/harness/active-plan` and the owning worktree is written to `.ai/harness/active-worktree` unless --no-active is used. Do not infer active execution from the latest non-archived plan.

## Handoff

- Checks file: `.ai/harness/checks/latest.json`
- Session handoff: `.ai/harness/handoff/current.md`

## Promotion Gate

- **Merge/PR unit**: Captured plan `plans/plan-20260715-0401-self-host-adopt-boundary.md` is the proposed mergeable execution unit; revise before execute if this is only a checklist step.
- **Rollback surface**: Revert the single source-checkout boundary commit
- **Verification boundary**: Installed and source CLIs must both produce zero downstream adopt operations for the source checkout
- **Review/acceptance boundary**: `tasks/reviews/20260715-0401-self-host-adopt-boundary.review.md` must record pass against the captured acceptance criteria.
- **High-risk surface**: Risks named in captured planning output; keep the plan Draft if risk ownership is not concrete.
- **Why not checklist row**: risk_boundary

## Evidence Contract

- **State/progress path**: `plans/plan-20260715-0401-self-host-adopt-boundary.md` task breakdown, `tasks/todos.md` deferred-goal ledger, `tasks/contracts/20260715-0401-self-host-adopt-boundary.contract.md`, `tasks/reviews/20260715-0401-self-host-adopt-boundary.review.md`, and `tasks/notes/20260715-0401-self-host-adopt-boundary.notes.md`
- **Verification evidence**: `.ai/harness/checks/latest.json`, `.ai/harness/runs/`, and the commands named in the captured planning output
- **Evaluator rubric**: `tasks/reviews/20260715-0401-self-host-adopt-boundary.review.md` must record a passing Waza /check style recommendation
- **Stop condition**: all task breakdown items are complete, sprint verification passes, and the review recommends pass
- **Rollback surface**: Revert the single source-checkout boundary commit

## Captured Planning Output

# Self-host adopt boundary fix

## Goal

Make installed and source-checkout repo-harness runtimes recognize the repo-harness source checkout identically, so downstream `adopt` is never recommended or applied to source-owned workflow surfaces.

## P1: Architecture Map

- `src/core/adoption/plan.ts` is the common adoption planner entrypoint.
- `src/core/adoption/standard-plan.ts` owns downstream projection and known-generated cleanup.
- `src/cli/commands/init-hook.ts` turns pending adoption operations into the `repo.adopt-refresh` Agent action.
- `tests/cli/adoption-plan.test.ts` and `tests/cli/init-hook.test.ts` are the focused regression surfaces.

## P2: Concrete Trace

An npm-installed CLI runs `setup check` in the repo-harness source checkout. The setup check invokes standard downstream planning. Existing self-host detection compares the target path with the running package root; those paths differ for a global install, so byte-identical canonical `scripts/*` files are classified as generated downstream copies and scheduled for deletion/untracking.

## P3: Design Decision

Introduce one structural source-checkout predicate shared by planner, cleanup, and setup check. Standard downstream adoption becomes a no-op for the source checkout; setup check reports downstream refresh as not applicable. Explicit `self-host` review mode remains fail closed. Do not add aliases, fallback parsing, or multiple authorities.

## Task Breakdown

- [x] Add failing regression coverage for installed-runtime/source-target separation and false-positive package names.
- [x] Implement the shared structural source-checkout authority and route planner/setup-check through it.
- [x] Verify direct dry-run returns zero operations, setup check emits no adopt action, focused tests/typecheck/workflow checks pass, and no source files are mutated by dry-run.
- [x] Commit, push, and require green GitHub CI.

## Verification Boundary

- `bun test tests/cli/adoption-plan.test.ts tests/cli/init-hook.test.ts`
- `bun run check:type`
- `bun src/cli/index.ts adopt --repo . --dry-run --json`
- `repo-harness setup check --target codex --check-updates --json`
- root required workflow checks and GitHub CI

## Out of Scope

- Applying downstream adoption to the source checkout.
- Changing explicit self-host review mode semantics.
- Repairing unrelated Waza, adapter, or documentation drift.

## Rollback Surface

Revert the single source-checkout boundary commit; no migration or persistent data mutation is introduced.

## Annotations
<!-- [NOTE]: prefixed inline. Claude processes all and revises. -->

## Task Breakdown
- [x] Add failing regression coverage for installed-runtime/source-target separation and false-positive package names.
- [x] Implement the shared structural source-checkout authority and route planner/setup-check through it.
- [x] Verify direct dry-run returns zero operations, setup check emits no adopt action, focused tests/typecheck/workflow checks pass, and no source files are mutated by dry-run.
- [x] Commit, push, and require green GitHub CI.
