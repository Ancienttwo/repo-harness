> **Archived**: 2026-09-12 14:22
> **Related Plan**: plans/archive/plan-20260911-0144-global-architecture-projection.md
> **Outcome**: Superseded
> **Lifecycle**: plan
> **Parent Run ID**: run-20260912-1422
> **Archive Projection V1**: `plans/plan-20260911-0144-global-architecture-projection.md` => `plans/archive/plan-20260911-0144-global-architecture-projection.md`
> **Archive Projection V1**: `tasks/notes/20260911-0144-global-architecture-projection.notes.md` => `tasks/archive/notes-20260912-1422-global-architecture-projection.md`
> **Archive Projection V1**: `tasks/contracts/20260911-0144-global-architecture-projection.contract.md` => `tasks/archive/contract-20260912-1422-global-architecture-projection.md`
> **Archive Projection V1**: `tasks/reviews/20260911-0144-global-architecture-projection.review.md` => `tasks/archive/review-20260912-1422-global-architecture-projection.md`

# Plan: Global architecture projection initialization

> **Status**: Archived
> **Created**: 20260911-0144
> **Slug**: global-architecture-projection
> **Planning Source**: repo-harness-plan
> **Orchestration Kind**: host-plan
> **Source Ref**: (none)
> **Artifact Level**: work-package
> **Promotion Reason**: merge_boundary
> **Verification Boundary**: Global config and two-repository fixture; focused init, adoption, projection and shell tests
> **Rollback Surface**: Single PR reverting global authority cutover
> **Spec**: `docs/spec.md`
> **Research**: See `docs/researches/`
> **Task Contract**: `tasks/archive/contract-20260912-1422-global-architecture-projection.md`
> **Task Review**: `tasks/archive/review-20260912-1422-global-architecture-projection.md`
> **Implementation Notes**: `tasks/archive/notes-20260912-1422-global-architecture-projection.md`

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

- Active plan: `plans/archive/plan-20260911-0144-global-architecture-projection.md`
- Sprint contract: `tasks/archive/contract-20260912-1422-global-architecture-projection.md`
- Sprint review: `tasks/archive/review-20260912-1422-global-architecture-projection.md`
- Implementation notes: `tasks/archive/notes-20260912-1422-global-architecture-projection.md`
- Deferred-goal ledger: `tasks/todos.md`
- Current checks: `.ai/harness/checks/latest.json`
- Run snapshots: `.ai/harness/runs/`
- Scope authority: `tasks/archive/contract-20260912-1422-global-architecture-projection.md` `allowed_paths`
- Concurrency rule: `.ai/harness/active-plan` selects the active plan for this worktree when present; `.ai/harness/active-worktree` records the owning worktree. If another worktree already owns active work, open or switch to the matching worktree instead of serializing unrelated plans.
- Execution isolation: approved contract-level work projects through `repo-harness run plan-to-todo --plan plans/archive/plan-20260911-0144-global-architecture-projection.md` and may start `repo-harness run contract-worktree start --plan plans/archive/plan-20260911-0144-global-architecture-projection.md`.

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
- Contract file: `tasks/archive/contract-20260912-1422-global-architecture-projection.md`
- Review file: `tasks/archive/review-20260912-1422-global-architecture-projection.md`
- Implementation notes file: `tasks/archive/notes-20260912-1422-global-architecture-projection.md`
- Template: `.claude/templates/contract.template.md`
- Verification command: `repo-harness run verify-contract --contract tasks/archive/contract-20260912-1422-global-architecture-projection.md --strict`
- Active plan rule: this captured plan is written to `.ai/harness/active-plan` and the owning worktree is written to `.ai/harness/active-worktree` unless --no-active is used. Do not infer active execution from the latest non-archived plan.

## Handoff

- Checks file: `.ai/harness/checks/latest.json`
- Session handoff: `.ai/harness/handoff/current.md`

## Promotion Gate

- **Merge/PR unit**: Captured plan `plans/archive/plan-20260911-0144-global-architecture-projection.md` is the proposed mergeable execution unit; revise before execute if this is only a checklist step.
- **Rollback surface**: Single PR reverting global authority cutover
- **Verification boundary**: Global config and two-repository fixture; focused init, adoption, projection and shell tests
- **Review/acceptance boundary**: `tasks/archive/review-20260912-1422-global-architecture-projection.md` must record pass against the captured acceptance criteria.
- **High-risk surface**: Risks named in captured planning output; keep the plan Draft if risk ownership is not concrete.
- **Why not checklist row**: merge_boundary

## Evidence Contract

- **State/progress path**: `plans/archive/plan-20260911-0144-global-architecture-projection.md` task breakdown, `tasks/todos.md` deferred-goal ledger, `tasks/archive/contract-20260912-1422-global-architecture-projection.md`, `tasks/archive/review-20260912-1422-global-architecture-projection.md`, and `tasks/archive/notes-20260912-1422-global-architecture-projection.md`
- **Verification evidence**: `.ai/harness/checks/latest.json`, `.ai/harness/runs/`, and the commands named in the captured planning output
- **Evaluator rubric**: `tasks/archive/review-20260912-1422-global-architecture-projection.md` must record a passing Waza /check style recommendation
- **Stop condition**: all task breakdown items are complete, sprint verification passes, and the review recommends pass
- **Rollback surface**: Single PR reverting global authority cutover

## Captured Planning Output

## Goal
Configure architecture projection once in the existing user-level ~/.repo-harness/config.json during global install/update. All repositories use that authority; repository capability/model/documents and freshness policy remain local. Submit a PR; no merge, release, real-user config mutation, or downstream repo migration in this task.

## P1 Map
init.ts runs the TS adoption transaction; standard-plan.ts omits projection settings while two shell scaffolds author disabled defaults. archctx-provider.ts reads repository policy, Stop and CLI call it, and three shell acceptance/freshness/publication paths separately read repository projection switches. Existing user config also holds brainRoot/protectedHelperRuntime and must be preserved. Exact package-owned archctx version/handshake, model identity, acceptance and manual-region ownership remain unchanged.

## P2 Trace
global install/update -> seed and validate host execution settings -> repo init adopts repository without projection overrides -> status/Stop/verification load the same global settings -> exact provider handshake -> existing projection job/receipt pipeline. A missing model is reported as not ready; init does not invent architecture semantics or bypass adoption approval. Missing global setup must be distinguishable from explicit disabled configuration.

## P3 Decision
Remove repository projection execution authority rather than merge global/repo settings. global install/update seeds archctx/automatic/advisory and bounded timeout once, preserving an explicit global disabled choice and unrelated global fields. Package release owns the provider version. Operator-invoked adopt strips retired repository projection keys; runtime never reads them. Centralize policy loading and expose a read-only policy CLI for shell consumers. Preserve capability_source and project freshness gate. At 10x repositories, repeated setup/config drift is the first failure; one global authority removes it without adding orchestration.

## Falsifier
One isolated HOME initialized once must drive status and the projection pipeline for two repositories without per-repo switches. Malformed global settings must fail closed, not synthesize defaults. Explicit disabled must remain disabled across repeated init. Dry-run must not write global config.

## Scope
Global projection config reader/bootstrap, init readiness, TS adoption retirement, shell scaffolds and three readers, focused fixture/probe migration, docs/spec and reference guidance. Preserve unrelated work and runtime/provider security boundaries.

## Task Breakdown
- [x] Capture red regression proving missing global initialization and repo-local projection authority.
- [x] Implement one global config authority, global setup and repo init readiness and retire repo authoring/readers.
- [x] Verify isolated HOME/two-repo behavior, dry-run/apply parity, corruption/disabled preservation, provider/Stop and affected shell checks.
- [x] Record P1/P2/P3 and verification, review the frozen diff, commit and open a PR without merging. (delivered via PR #401, merged at 9563083c)

## Verification
Focused global architecture, provider/orchestration, init/adoption, architecture-sync and relevant shell tests. Required repository integrity: check:hooks, check:helpers, check:type, deploy SQL, architecture-sync, task-sync, strict workflow, inspector, init dry-run. No full suite unless named focused coverage leaves an observed integration gap. Test executions use disposable HOME and repos to prevent real global settings or document writes.

## Annotations
<!-- [NOTE]: prefixed inline. Claude processes all and revises. -->

## Task Breakdown
- [x] Capture red regression proving missing global initialization and repo-local projection authority.
- [x] Implement one global config authority, global setup and repo init readiness and retire repo authoring/readers.
- [x] Verify isolated HOME/two-repo behavior, dry-run/apply parity, corruption/disabled preservation, provider/Stop and affected shell checks.
- [x] Record P1/P2/P3 and verification, review the frozen diff, commit and open a PR without merging. (delivered via PR #401, merged at 9563083c)

## Authority clarification

The user explicitly requires one global configuration. Current init is repo-only; therefore global install/update bootstraps config, and repo init only retires legacy repo keys and reports readiness. This preserves the existing host mutation boundary.
