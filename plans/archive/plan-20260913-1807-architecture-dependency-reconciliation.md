> **Archived**: 2026-09-13 18:31
> **Related Plan**: plans/archive/plan-20260913-1807-architecture-dependency-reconciliation.md
> **Outcome**: Completed
> **Lifecycle**: plan
> **Parent Run ID**: run-20260913-1831
> **Archive Projection V1**: `plans/plan-20260913-1807-architecture-dependency-reconciliation.md` => `plans/archive/plan-20260913-1807-architecture-dependency-reconciliation.md`
> **Archive Projection V1**: `tasks/notes/20260913-1807-architecture-dependency-reconciliation.notes.md` => `tasks/archive/notes-20260913-1831-architecture-dependency-reconciliation.md`
> **Archive Projection V1**: `tasks/contracts/20260913-1807-architecture-dependency-reconciliation.contract.md` => `tasks/archive/contract-20260913-1831-architecture-dependency-reconciliation.md`
> **Archive Projection V1**: `tasks/reviews/20260913-1807-architecture-dependency-reconciliation.review.md` => `tasks/archive/review-20260913-1831-architecture-dependency-reconciliation.md`

# Plan: Repository architecture dependency reconciliation

> **Status**: Archived
> **Created**: 20260913-1807
> **Slug**: architecture-dependency-reconciliation
> **Planning Source**: repo-harness-plan
> **Orchestration Kind**: host-plan
> **Source Ref**: (none)
> **Artifact Level**: work-package
> **Promotion Reason**: verification_boundary
> **Verification Boundary**: Focused init and global runtime regression tests plus required repository checks
> **Rollback Surface**: Repository init and global runtime readiness reporting
> **Spec**: `docs/spec.md`
> **Research**: See `docs/researches/`
> **Task Contract**: `tasks/archive/contract-20260913-1831-architecture-dependency-reconciliation.md`
> **Task Review**: `tasks/archive/review-20260913-1831-architecture-dependency-reconciliation.md`
> **Implementation Notes**: `tasks/archive/notes-20260913-1831-architecture-dependency-reconciliation.md`

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

- Active plan: `plans/archive/plan-20260913-1807-architecture-dependency-reconciliation.md`
- Sprint contract: `tasks/archive/contract-20260913-1831-architecture-dependency-reconciliation.md`
- Sprint review: `tasks/archive/review-20260913-1831-architecture-dependency-reconciliation.md`
- Implementation notes: `tasks/archive/notes-20260913-1831-architecture-dependency-reconciliation.md`
- Deferred-goal ledger: `tasks/todos.md`
- Current checks: `.ai/harness/checks/latest.json`
- Run snapshots: `.ai/harness/runs/`
- Scope authority: `tasks/archive/contract-20260913-1831-architecture-dependency-reconciliation.md` `allowed_paths`
- Concurrency rule: `.ai/harness/active-plan` selects the active plan for this worktree when present; `.ai/harness/active-worktree` records the owning worktree. If another worktree already owns active work, open or switch to the matching worktree instead of serializing unrelated plans.
- Execution isolation: approved contract-level work projects through `repo-harness run plan-to-todo --plan plans/archive/plan-20260913-1807-architecture-dependency-reconciliation.md` and may start `repo-harness run contract-worktree start --plan plans/archive/plan-20260913-1807-architecture-dependency-reconciliation.md`.

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
- Contract file: `tasks/archive/contract-20260913-1831-architecture-dependency-reconciliation.md`
- Review file: `tasks/archive/review-20260913-1831-architecture-dependency-reconciliation.md`
- Implementation notes file: `tasks/archive/notes-20260913-1831-architecture-dependency-reconciliation.md`
- Template: `.claude/templates/contract.template.md`
- Verification command: `repo-harness run verify-contract --contract tasks/archive/contract-20260913-1831-architecture-dependency-reconciliation.md --strict`
- Active plan rule: this captured plan is written to `.ai/harness/active-plan` and the owning worktree is written to `.ai/harness/active-worktree` unless --no-active is used. Do not infer active execution from the latest non-archived plan.

## Handoff

- Checks file: `.ai/harness/checks/latest.json`
- Session handoff: `.ai/harness/handoff/current.md`

## Promotion Gate

- **Merge/PR unit**: Captured plan `plans/archive/plan-20260913-1807-architecture-dependency-reconciliation.md` is the proposed mergeable execution unit; revise before execute if this is only a checklist step.
- **Rollback surface**: Repository init and global runtime readiness reporting
- **Verification boundary**: Focused init and global runtime regression tests plus required repository checks
- **Review/acceptance boundary**: `tasks/archive/review-20260913-1831-architecture-dependency-reconciliation.md` must record pass against the captured acceptance criteria.
- **High-risk surface**: Risks named in captured planning output; keep the plan Draft if risk ownership is not concrete.
- **Why not checklist row**: verification_boundary

## Evidence Contract

- **State/progress path**: `plans/archive/plan-20260913-1807-architecture-dependency-reconciliation.md` task breakdown, `tasks/todos.md` deferred-goal ledger, `tasks/archive/contract-20260913-1831-architecture-dependency-reconciliation.md`, `tasks/archive/review-20260913-1831-architecture-dependency-reconciliation.md`, and `tasks/archive/notes-20260913-1831-architecture-dependency-reconciliation.md`
- **Verification evidence**: `.ai/harness/checks/latest.json`, `.ai/harness/runs/`, and the commands named in the captured planning output
- **Evaluator rubric**: `tasks/archive/review-20260913-1831-architecture-dependency-reconciliation.md` must record a passing Waza /check style recommendation
- **Stop condition**: all task breakdown items are complete, sprint verification passes, and the review recommends pass
- **Rollback surface**: Repository init and global runtime readiness reporting

## Captured Planning Output

# Repository architecture dependency reconciliation

## Goal
Bind architecture execution to the running repo-harness package's declared archctx dependency. Global update already refreshes that dependency; a target repository's installation must not override it. Project architecture model/configuration data remains repository-local.

## P1 Architecture Map
Global execution policy and exact dependency version belong to the repo-harness runtime. archctx-provider currently searches the target repository before the running CLI package. The target supplies model files, code facts, expected snapshot and cwd; it does not own the runtime executable. Explicit consumerRoot is used for candidate package verification and isolated tests.

## P2 Concrete Trace
At f1596f09 the global package supplied archctx 0.5.10 while this target had 0.5.6. resolveArchctxForRepo selected the stale target copy and failed before handshake. A global update cannot repair a dependency tree it does not own. The temporary frozen install repaired this local environment but is not the product fix.

## P3 Decision
Remove target-repository executable selection and its origin branch. Resolve archctx from the running repo-harness package, or the explicitly supplied candidate consumer root, with existing exact version, binary containment, Node and protocol checks. Do not add repository dependency installation. At 10x repositories there remains one runtime provider owner and per-repository model/snapshot isolation.

## Scope
src/effects/architecture/archctx-provider.ts, tests/architecture-projection-provider.test.ts, assets/reference-configs/external-tooling.md and its docs projection, associated workflow artifacts. Automatic model discovery is a separate work-package.

## Task Breakdown
- [x] Prove the stale and matching target copies cannot override the runtime provider using a pre-fix regression.
- [x] Remove the target-repository provider resolution path and obsolete origin branch; preserve exact runtime validation.
- [x] Update architecture runtime ownership documentation.
- [x] Run focused provider coverage and required repository checks; record verification and acceptance.

## Verification
Existing architecture-projection-provider tests exercise package resolution, handshake, binary containment and the provider command boundary. Add target-copy isolation and retain broken-runtime rejection. Required repository integrity checks apply; no full suite or benchmark is justified.

## Rollback
Revert the provider resolution and documentation delta. No persisted schema or repository package dependency changes.

## Non-goals
No init dependency installer, per-repo version pin, provider fallback, model discovery implementation, registry publication or new dependencies.
