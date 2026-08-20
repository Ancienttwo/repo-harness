# Plan: archctx 0.4.2 version sync and clean-room proof refresh

> **Status**: Archived
> **Created**: 20260811-2137
> **Slug**: archctx-042-version-sync
> **Planning Source**: repo-harness-plan
> **Orchestration Kind**: host-plan
> **Source Ref**: (none)
> **Artifact Level**: work-package
> **Promotion Reason**: verification_boundary
> **Verification Boundary**: axr5 clean-room readback + full bun test + architecture-projection queue drained
> **Rollback Surface**: single revert of the version-sync commit; published npm packages unaffected
> **Spec**: `docs/spec.md`
> **Research**: See `docs/researches/`
> **Task Contract**: `tasks/contracts/20260811-2137-archctx-042-version-sync.contract.md`
> **Task Review**: `tasks/reviews/20260811-2137-archctx-042-version-sync.review.md`
> **Implementation Notes**: `tasks/notes/20260811-2137-archctx-042-version-sync.notes.md`

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

- Active plan: `plans/plan-20260811-2137-archctx-042-version-sync.md`
- Sprint contract: `tasks/contracts/20260811-2137-archctx-042-version-sync.contract.md`
- Sprint review: `tasks/reviews/20260811-2137-archctx-042-version-sync.review.md`
- Implementation notes: `tasks/notes/20260811-2137-archctx-042-version-sync.notes.md`
- Deferred-goal ledger: `tasks/todos.md`
- Current checks: `.ai/harness/checks/latest.json`
- Run snapshots: `.ai/harness/runs/`
- Scope authority: `tasks/contracts/20260811-2137-archctx-042-version-sync.contract.md` `allowed_paths`
- Concurrency rule: `.ai/harness/active-plan` selects the active plan for this worktree when present; `.ai/harness/active-worktree` records the owning worktree. If another worktree already owns active work, open or switch to the matching worktree instead of serializing unrelated plans.
- Execution isolation: approved contract-level work projects through `repo-harness run plan-to-todo --plan plans/plan-20260811-2137-archctx-042-version-sync.md` and may start `repo-harness run contract-worktree start --plan plans/plan-20260811-2137-archctx-042-version-sync.md`.

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
- Contract file: `tasks/contracts/20260811-2137-archctx-042-version-sync.contract.md`
- Review file: `tasks/reviews/20260811-2137-archctx-042-version-sync.review.md`
- Implementation notes file: `tasks/notes/20260811-2137-archctx-042-version-sync.notes.md`
- Template: `.claude/templates/contract.template.md`
- Verification command: `repo-harness run verify-contract --contract tasks/contracts/20260811-2137-archctx-042-version-sync.contract.md --strict`
- Active plan rule: this captured plan is written to `.ai/harness/active-plan` and the owning worktree is written to `.ai/harness/active-worktree` unless --no-active is used. Do not infer active execution from the latest non-archived plan.

## Handoff

- Checks file: `.ai/harness/checks/latest.json`
- Session handoff: `.ai/harness/handoff/current.md`

## Promotion Gate

- **Merge/PR unit**: Captured plan `plans/plan-20260811-2137-archctx-042-version-sync.md` is the proposed mergeable execution unit; revise before execute if this is only a checklist step.
- **Rollback surface**: single revert of the version-sync commit; published npm packages unaffected
- **Verification boundary**: axr5 clean-room readback + full bun test + architecture-projection queue drained
- **Review/acceptance boundary**: `tasks/reviews/20260811-2137-archctx-042-version-sync.review.md` must record pass against the captured acceptance criteria.
- **High-risk surface**: Risks named in captured planning output; keep the plan Draft if risk ownership is not concrete.
- **Why not checklist row**: verification_boundary

## Evidence Contract

- **State/progress path**: `plans/plan-20260811-2137-archctx-042-version-sync.md` task breakdown, `tasks/todos.md` deferred-goal ledger, `tasks/contracts/20260811-2137-archctx-042-version-sync.contract.md`, `tasks/reviews/20260811-2137-archctx-042-version-sync.review.md`, and `tasks/notes/20260811-2137-archctx-042-version-sync.notes.md`
- **Verification evidence**: `.ai/harness/checks/latest.json`, `.ai/harness/runs/`, and the commands named in the captured planning output
- **Evaluator rubric**: `tasks/reviews/20260811-2137-archctx-042-version-sync.review.md` must record a passing Waza /check style recommendation
- **Stop condition**: all task breakdown items are complete, sprint verification passes, and the review recommends pass
- **Rollback surface**: single revert of the version-sync commit; published npm packages unaffected

## Captured Planning Output

# archctx 0.4.2 version sync and clean-room proof refresh

## Context

archctx / archctx-contracts 0.4.2 are published on npm (operator confirmed). The repo
pinned 0.4.1 across its binding points, and the strict architecture-projection Stop
gate was blocking on the stale chain. Package pins, policy `projection_version`,
`ARCHCTX_REQUIRED_VERSION`, the downstream policy template, and the five affected
test fixtures are already bumped; `bun install` is done; the projection queue drained
successfully on the 0.4.2 chain after an archctxd daemon restart.

## Task Breakdown

- [x] Bump package.json pins, `.ai/harness/policy.json` projection_version,
      `src/core/architecture/projection.ts` ARCHCTX_REQUIRED_VERSION,
      `assets/templates/helpers/ensure-task-workflow.sh`, and five test files;
      `bun install`; drain projection queue to applied/empty.
- [ ] Patch `scripts/axr5-archctx-clean-room.ts`: VERSION 0.4.1 -> 0.4.2, and
      rewrite `linkBuildDependencies` to enumerate workspace packages from the
      checkout package.json workspaces list instead of the source repo's
      `node_modules/@archcontext` layout (bun 1.3 no longer materializes all
      workspace symlinks there, which breaks `@archcontext/core` resolution in
      the clean-room checkout).
- [ ] Bump remaining archctx 0.4.1 references to 0.4.2:
      `scripts/axr6-stop-host-cycle.ts` (4 fixture references),
      `scripts/axr7-consumer-e2e.ts` (VERSION const; REPO_HARNESS_VERSION stays),
      `scripts/ensure-task-workflow.sh:1147`,
      `scripts/lib/project-init-lib.sh:1795`.
      Historical records stay untouched: `assets/skill-version.json` changelog,
      `deploy/release-checklists/*`.
- [ ] Regenerate `docs/verification/axr5-archctx-clean-room-readback.json` by
      running `bun scripts/axr5-archctx-clean-room.ts` against the clean 0.4.2
      arch-context checkout; expect status verified, contracts 0.4.2, dirty false.
- [ ] Verify: `bun test` full suite green locally; `bash
      scripts/check-architecture-sync.sh` non-blocking; projection queue stays
      pending=0 dead_letters=0.

## Out of Scope

- The concurrent cross-review changes in the worktree
  (`src/cli/commands/cross-review.ts`, `src/core/review/cross-review.ts`,
  `src/effects/review/cross-review-runner.ts`, `tests/cli/cross-review.test.ts`)
  are parallel WIP owned by another session; this plan does not touch or commit
  them.
- Publishing repo-harness 0.14.2 to npm and refreshing the bun-global CLI remain
  operator actions outside this plan.

## Annotations
<!-- [NOTE]: prefixed inline. Claude processes all and revises. -->

## Task Breakdown
- [x] Bump package.json pins, `.ai/harness/policy.json` projection_version,
- [ ] Patch `scripts/axr5-archctx-clean-room.ts`: VERSION 0.4.1 -> 0.4.2, and
- [ ] Bump remaining archctx 0.4.1 references to 0.4.2:
- [ ] Regenerate `docs/verification/axr5-archctx-clean-room-readback.json` by
- [ ] Verify: `bun test` full suite green locally; `bash
