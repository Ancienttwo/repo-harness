# Plan: Raise architecture projection timeout bound

> **Status**: Executing
> **Created**: 20260909-1853
> **Slug**: projection-timeout
> **Planning Source**: repo-harness-plan
> **Orchestration Kind**: host-plan
> **Source Ref**: (none)
> **Artifact Level**: work-package
> **Promotion Reason**: verification_boundary
> **Verification Boundary**: Projection provider bound and running-job reclaim window verified together via focused projection tests plus repository-integrity checks
> **Rollback Surface**: Single-commit revert of the validator cap, this repo's policy value, and the derived stale window
> **Spec**: `docs/spec.md`
> **Research**: See `docs/researches/`
> **Task Contract**: `tasks/contracts/20260909-1853-projection-timeout.contract.md`
> **Task Review**: `tasks/reviews/20260909-1853-projection-timeout.review.md`
> **Implementation Notes**: `tasks/notes/20260909-1853-projection-timeout.notes.md`

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

- Active plan: `plans/plan-20260909-1853-projection-timeout.md`
- Sprint contract: `tasks/contracts/20260909-1853-projection-timeout.contract.md`
- Sprint review: `tasks/reviews/20260909-1853-projection-timeout.review.md`
- Implementation notes: `tasks/notes/20260909-1853-projection-timeout.notes.md`
- Deferred-goal ledger: `tasks/todos.md`
- Current checks: `.ai/harness/checks/latest.json`
- Run snapshots: `.ai/harness/runs/`
- Scope authority: `tasks/contracts/20260909-1853-projection-timeout.contract.md` `allowed_paths`
- Concurrency rule: `.ai/harness/active-plan` selects the active plan for this worktree when present; `.ai/harness/active-worktree` records the owning worktree. If another worktree already owns active work, open or switch to the matching worktree instead of serializing unrelated plans.
- Execution isolation: approved contract-level work projects through `repo-harness run plan-to-todo --plan plans/plan-20260909-1853-projection-timeout.md` and may start `repo-harness run contract-worktree start --plan plans/plan-20260909-1853-projection-timeout.md`.

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
- Contract file: `tasks/contracts/20260909-1853-projection-timeout.contract.md`
- Review file: `tasks/reviews/20260909-1853-projection-timeout.review.md`
- Implementation notes file: `tasks/notes/20260909-1853-projection-timeout.notes.md`
- Template: `.claude/templates/contract.template.md`
- Verification command: `repo-harness run verify-contract --contract tasks/contracts/20260909-1853-projection-timeout.contract.md --strict`
- Active plan rule: this captured plan is written to `.ai/harness/active-plan` and the owning worktree is written to `.ai/harness/active-worktree` unless --no-active is used. Do not infer active execution from the latest non-archived plan.

## Handoff

- Checks file: `.ai/harness/checks/latest.json`
- Session handoff: `.ai/harness/handoff/current.md`

## Promotion Gate

- **Merge/PR unit**: Captured plan `plans/plan-20260909-1853-projection-timeout.md` is the proposed mergeable execution unit; revise before execute if this is only a checklist step.
- **Rollback surface**: Single-commit revert of the validator cap, this repo's policy value, and the derived stale window
- **Verification boundary**: Projection provider bound and running-job reclaim window verified together via focused projection tests plus repository-integrity checks
- **Review/acceptance boundary**: `tasks/reviews/20260909-1853-projection-timeout.review.md` must record pass against the captured acceptance criteria.
- **High-risk surface**: Risks named in captured planning output; keep the plan Draft if risk ownership is not concrete.
- **Why not checklist row**: verification_boundary

## Evidence Contract

- **State/progress path**: `plans/plan-20260909-1853-projection-timeout.md` task breakdown, `tasks/todos.md` deferred-goal ledger, `tasks/contracts/20260909-1853-projection-timeout.contract.md`, `tasks/reviews/20260909-1853-projection-timeout.review.md`, and `tasks/notes/20260909-1853-projection-timeout.notes.md`
- **Verification evidence**: `.ai/harness/checks/latest.json`, `.ai/harness/runs/`, and the commands named in the captured planning output
- **Evaluator rubric**: `tasks/reviews/20260909-1853-projection-timeout.review.md` must record a passing Waza /check style recommendation
- **Stop condition**: all task breakdown items are complete, sprint verification passes, and the review recommends pass
- **Rollback surface**: Single-commit revert of the validator cap, this repo's policy value, and the derived stale window

## Captured Planning Output

## Context

The archctx `projection run` apply for 60+ changed paths exceeds the 120s provider bound
under host load, and the projection job dead-letters after four consecutive
`process timed out after 118xxxms` failures. This repo needs a longer provider bound.

## Decision

- Raise the `policy.architecture.projection_timeout_ms` validator upper bound from 120000 to
  600000; the default stays 120000 so generated downstream repos are unchanged.
- Set this repo's `.ai/harness/policy.json#architecture.projection_timeout_ms` to 300000.
- Derive the running-job stale reclaim window from the resolved policy timeout
  (`timeoutMs + 30_000`) instead of the `RUNNING_STALE_MS = 150_000` constant, so a longer
  provider bound cannot reclaim a live job. `recoverAbandonedArchitectureProjectionJobs` takes
  the resolved timeout from `drainArchitectureProjectionJobs`; there is no second timeout constant.
- Hook budgets are untouched: `deadlineMs = min(options.deadlineMs, clock() + policy.timeoutMs)`
  still clamps to the Stop-hook host budget, so only an explicit `drain` without a host deadline
  gets the longer window.

## Task Breakdown

- [x] Raise the projection timeout validator cap to 600000 and keep the 120000 default
- [ ] Set this repo's policy projection_timeout_ms to 300000 (deferred: the installed repo-harness runtime and Stop hook still validate 1000..120000; bump only after a runtime built from this change is installed globally)
- [x] Derive the running stale window from the resolved policy timeout
- [x] Update validator boundary and stale-window tests

## Verification

- `bunx tsc --noEmit`
- `bun test --timeout 60000 tests/state/operation-readiness.test.ts tests/architecture-projection-orchestration.test.ts tests/architecture-projection-provider.test.ts tests/unit/helper-projection-drift.test.ts`
- `bun src/cli/index.ts architecture-projection status --json`
- repository-integrity checks

## Rollback

Revert the commit; the validator cap and this repo's policy value return to 120000 and the
stale window returns to a fixed 150000-equivalent derivation.

## Annotations
<!-- [NOTE]: prefixed inline. Claude processes all and revises. -->

## Task Breakdown
- [x] Raise the projection timeout validator cap to 600000 and keep the 120000 default
- [ ] Set this repo's policy projection_timeout_ms to 300000 (deferred: the installed repo-harness runtime and Stop hook still validate 1000..120000; bump only after a runtime built from this change is installed globally)
- [x] Derive the running stale window from the resolved policy timeout
- [x] Update validator boundary and stale-window tests
