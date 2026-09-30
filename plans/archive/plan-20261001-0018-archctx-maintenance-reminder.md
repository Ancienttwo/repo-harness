> **Archived**: 2026-10-01 01:13
> **Related Plan**: plans/archive/plan-20261001-0018-archctx-maintenance-reminder.md
> **Outcome**: Completed
> **Lifecycle**: plan
> **Parent Run ID**: run-20261001-0113
> **Archive Projection V1**: `plans/plan-20261001-0018-archctx-maintenance-reminder.md` => `plans/archive/plan-20261001-0018-archctx-maintenance-reminder.md`
> **Archive Projection V1**: `tasks/notes/20261001-0018-archctx-maintenance-reminder.notes.md` => `tasks/archive/notes-20261001-0113-archctx-maintenance-reminder.md`
> **Archive Projection V1**: `tasks/contracts/20261001-0018-archctx-maintenance-reminder.contract.md` => `tasks/archive/contract-20261001-0113-archctx-maintenance-reminder.md`
> **Archive Projection V1**: `tasks/reviews/20261001-0018-archctx-maintenance-reminder.review.md` => `tasks/archive/review-20261001-0113-archctx-maintenance-reminder.md`

# Plan: ArchContext daemon maintenance authorization reminder

> **Status**: Archived
> **Created**: 20261001-0018
> **Slug**: archctx-maintenance-reminder
> **Planning Source**: codex-plan-or-waza-think
> **Orchestration Kind**: host-plan
> **Source Ref**: (none)
> **Artifact Level**: work-package
> **Promotion Reason**: verification_boundary
> **Verification Boundary**: Managed update lifecycle readback and typed provider failure tests
> **Rollback Surface**: Revert reminder and lifecycle probe only
> **Spec**: `docs/spec.md`
> **Research**: See `docs/researches/`
> **Task Contract**: `tasks/archive/contract-20261001-0113-archctx-maintenance-reminder.md`
> **Task Review**: `tasks/archive/review-20261001-0113-archctx-maintenance-reminder.md`
> **Implementation Notes**: `tasks/archive/notes-20261001-0113-archctx-maintenance-reminder.md`

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

- Active plan: `plans/archive/plan-20261001-0018-archctx-maintenance-reminder.md`
- Sprint contract: `tasks/archive/contract-20261001-0113-archctx-maintenance-reminder.md`
- Sprint review: `tasks/archive/review-20261001-0113-archctx-maintenance-reminder.md`
- Implementation notes: `tasks/archive/notes-20261001-0113-archctx-maintenance-reminder.md`
- Deferred-goal ledger: `tasks/todos.md`
- Current checks: `.ai/harness/checks/latest.json`
- Run snapshots: `.ai/harness/runs/`
- Scope authority: `tasks/archive/contract-20261001-0113-archctx-maintenance-reminder.md` `allowed_paths`
- Concurrency rule: `.ai/harness/active-plan` selects the active plan for this worktree when present; `.ai/harness/active-worktree` records the owning worktree. If another worktree already owns active work, open or switch to the matching worktree instead of serializing unrelated plans.
- Execution isolation: approved contract-level work projects through `repo-harness run plan-to-todo --plan plans/archive/plan-20261001-0018-archctx-maintenance-reminder.md` and may start `repo-harness run contract-worktree start --plan plans/archive/plan-20261001-0018-archctx-maintenance-reminder.md`.

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
- Contract file: `tasks/archive/contract-20261001-0113-archctx-maintenance-reminder.md`
- Review file: `tasks/archive/review-20261001-0113-archctx-maintenance-reminder.md`
- Implementation notes file: `tasks/archive/notes-20261001-0113-archctx-maintenance-reminder.md`
- Template: `.claude/templates/contract.template.md`
- Verification command: `repo-harness run verify-contract --contract tasks/archive/contract-20261001-0113-archctx-maintenance-reminder.md --strict`
- Active plan rule: this captured plan is written to `.ai/harness/active-plan` and the owning worktree is written to `.ai/harness/active-worktree` unless --no-active is used. Do not infer active execution from the latest non-archived plan.

## Handoff

- Checks file: `.ai/harness/checks/latest.json`
- Session handoff: `.ai/harness/handoff/current.md`

## Promotion Gate

- **Merge/PR unit**: Captured plan `plans/archive/plan-20261001-0018-archctx-maintenance-reminder.md` is the proposed mergeable execution unit; revise before execute if this is only a checklist step.
- **Rollback surface**: Revert reminder and lifecycle probe only
- **Verification boundary**: Managed update lifecycle readback and typed provider failure tests
- **Review/acceptance boundary**: `tasks/archive/review-20261001-0113-archctx-maintenance-reminder.md` must record pass against the captured acceptance criteria.
- **High-risk surface**: Risks named in captured planning output; keep the plan Draft if risk ownership is not concrete.
- **Why not checklist row**: verification_boundary

## Evidence Contract

- **State/progress path**: `plans/archive/plan-20261001-0018-archctx-maintenance-reminder.md` task breakdown, `tasks/todos.md` deferred-goal ledger, `tasks/archive/contract-20261001-0113-archctx-maintenance-reminder.md`, `tasks/archive/review-20261001-0113-archctx-maintenance-reminder.md`, and `tasks/archive/notes-20261001-0113-archctx-maintenance-reminder.md`
- **Verification evidence**: `.ai/harness/checks/latest.json`, `.ai/harness/runs/`, and the commands named in the captured planning output
- **Evaluator rubric**: `tasks/archive/review-20261001-0113-archctx-maintenance-reminder.md` must record a passing Waza /check style recommendation
- **Stop condition**: all task breakdown items are complete, sprint verification passes, and the review recommends pass
- **Rollback surface**: Revert reminder and lifecycle probe only

## Captured Planning Output

P1: Global runtime update owns package installation/readback; archctx-provider owns exact package-local process dispatch; ArchContext owns shared daemon lifecycle and CodeGraph facts. No daemon restart, index deletion, model changes, or unrelated worktree edits.
P2: update -> readManagedRuntime -> static capabilities currently bypasses daemon -> ready; projection -> daemon mismatch envelope -> processFailure truncates the recovery instruction. Pressure points: missing lifecycle probe and lost typed recovery action.
P3: Reuse daemon status and upstream error codes; preserve fail-closed updates and user authorization. Add a bounded status probe after capabilities, expose an authorization reminder on incompatibility, and check index freshness only after authorized daemon replacement. At 10x usage, shared daemon disruption is the primary risk; never perform replacement from checks/hooks.
Allowed paths: src/effects/architecture/archctx-provider.ts, src/cli/commands/global-runtime.ts, tests/architecture-projection-provider.test.ts, tests/cli/global-runtime-init.test.ts, docs/reference-configs/external-tooling.md, assets/reference-configs/external-tooling.md, docs/researches/, plans/, tasks/.
Verification: bun test tests/architecture-projection-provider.test.ts tests/cli/global-runtime-init.test.ts --timeout 60000; bun run check:type; root required integrity commands.
Rollback: revert only this reminder/probe diff. No new dependency or persistent authorization store.
- [x] Preserve typed runtime mismatch recovery guidance without executing recovery.
- [x] Probe daemon lifecycle after managed package readback and cover healthy/stopped/incompatible/malformed outcomes.
- [ ] Document permission boundary, verify focused tests and required checks, close workflow artifacts.

## Annotations
<!-- [NOTE]: prefixed inline. Claude processes all and revises. -->

## Task Breakdown
- [x] Preserve typed runtime mismatch recovery guidance without executing recovery.
- [x] Probe daemon lifecycle after managed package readback and cover healthy/stopped/incompatible/malformed outcomes.
- [ ] Document permission boundary, verify focused tests and required checks, close workflow artifacts.

## Architecture closure

The user approved closing the architecture candidate and landing this change.
The isolated worktree had no CodeGraph index. Its package-local 1.6.1 index is
now complete and current. Provider apply updated only the generated projection
manifest; proof-only candidate b7ebfc46339bc12722ce47e623d3e8a3538c07a3d3568bc582d2f68559c7c6ed
was resolved through deterministic reconciliation with receipt
sha256:c3fe72145b044555f5e373f178d17da2f3e35b96560f2dab74a13968dfe74869.
No capability model or module prose changed; no shared state was deleted.

The first focused run on the correct lockfile passed 89 tests and typecheck.
Final evidence is frozen through verify-sprint preparation, followed by typed
acceptance and contract-worktree finish into main.

> **Substantive Change SHA256**: `sha256:9ce4ef36aefc46d8904c1aa83042a01ca32cc3b7cd904cb0fb582a36b53405f3`

> **Substantive Change SHA256**: `sha256:0ab123a469c0a3a66a9440a7dbe9f1cdc96e3bc087a251c97da4fd5c89814ef6`
