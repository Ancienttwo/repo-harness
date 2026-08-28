# Plan: ME3 acceptance follow-up: MCP read-only path and argv single source

> **Status**: Executing
> **Created**: 20260828-1100
> **Slug**: me3-acceptance-followup
> **Planning Source**: repo-harness-plan
> **Orchestration Kind**: host-plan
> **Source Ref**: (none)
> **Artifact Level**: work-package
> **Promotion Reason**: verification_boundary
> **Verification Boundary**: Focused six-file bun test run plus typecheck plus gatekeeper re-review
> **Rollback Surface**: Single revertable merge commit off main cbda7ab4; no schema or receipt changes
> **Spec**: `docs/spec.md`
> **Research**: See `docs/researches/`
> **Task Contract**: `tasks/contracts/20260828-1100-me3-acceptance-followup.contract.md`
> **Task Review**: `tasks/reviews/20260828-1100-me3-acceptance-followup.review.md`
> **Implementation Notes**: `tasks/notes/20260828-1100-me3-acceptance-followup.notes.md`

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

- Active plan: `plans/plan-20260828-1100-me3-acceptance-followup.md`
- Sprint contract: `tasks/contracts/20260828-1100-me3-acceptance-followup.contract.md`
- Sprint review: `tasks/reviews/20260828-1100-me3-acceptance-followup.review.md`
- Implementation notes: `tasks/notes/20260828-1100-me3-acceptance-followup.notes.md`
- Deferred-goal ledger: `tasks/todos.md`
- Current checks: `.ai/harness/checks/latest.json`
- Run snapshots: `.ai/harness/runs/`
- Scope authority: `tasks/contracts/20260828-1100-me3-acceptance-followup.contract.md` `allowed_paths`
- Concurrency rule: `.ai/harness/active-plan` selects the active plan for this worktree when present; `.ai/harness/active-worktree` records the owning worktree. If another worktree already owns active work, open or switch to the matching worktree instead of serializing unrelated plans.
- Execution isolation: approved contract-level work projects through `repo-harness run plan-to-todo --plan plans/plan-20260828-1100-me3-acceptance-followup.md` and may start `repo-harness run contract-worktree start --plan plans/plan-20260828-1100-me3-acceptance-followup.md`.

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
- Contract file: `tasks/contracts/20260828-1100-me3-acceptance-followup.contract.md`
- Review file: `tasks/reviews/20260828-1100-me3-acceptance-followup.review.md`
- Implementation notes file: `tasks/notes/20260828-1100-me3-acceptance-followup.notes.md`
- Template: `.claude/templates/contract.template.md`
- Verification command: `repo-harness run verify-contract --contract tasks/contracts/20260828-1100-me3-acceptance-followup.contract.md --strict`
- Active plan rule: this captured plan is written to `.ai/harness/active-plan` and the owning worktree is written to `.ai/harness/active-worktree` unless --no-active is used. Do not infer active execution from the latest non-archived plan.

## Handoff

- Checks file: `.ai/harness/checks/latest.json`
- Session handoff: `.ai/harness/handoff/current.md`

## Promotion Gate

- **Merge/PR unit**: Captured plan `plans/plan-20260828-1100-me3-acceptance-followup.md` is the proposed mergeable execution unit; revise before execute if this is only a checklist step.
- **Rollback surface**: Single revertable merge commit off main cbda7ab4; no schema or receipt changes
- **Verification boundary**: Focused six-file bun test run plus typecheck plus gatekeeper re-review
- **Review/acceptance boundary**: `tasks/reviews/20260828-1100-me3-acceptance-followup.review.md` must record pass against the captured acceptance criteria.
- **High-risk surface**: Risks named in captured planning output; keep the plan Draft if risk ownership is not concrete.
- **Why not checklist row**: verification_boundary

## Evidence Contract

- **State/progress path**: `plans/plan-20260828-1100-me3-acceptance-followup.md` task breakdown, `tasks/todos.md` deferred-goal ledger, `tasks/contracts/20260828-1100-me3-acceptance-followup.contract.md`, `tasks/reviews/20260828-1100-me3-acceptance-followup.review.md`, and `tasks/notes/20260828-1100-me3-acceptance-followup.notes.md`
- **Verification evidence**: `.ai/harness/checks/latest.json`, `.ai/harness/runs/`, and the commands named in the captured planning output
- **Evaluator rubric**: `tasks/reviews/20260828-1100-me3-acceptance-followup.review.md` must record a passing Waza /check style recommendation
- **Stop condition**: all task breakdown items are complete, sprint verification passes, and the review recommends pass
- **Rollback surface**: Single revertable merge commit off main cbda7ab4; no schema or receipt changes

## Captured Planning Output

# ME3 Acceptance Follow-up: MCP read-only status path and argv single source

## Goal

Close the three confirmed findings from the ME3 acceptance gate review (ME-3A `2d05129f`, ME-3B face of `7e8d3560`):

1. `engineer_thread_effect_status` MCP tool advertises `readOnlyHint: true` but routes through `withEffectLock`/`prepareStore`/`replaceCanonical`, creating lock/store directories and repairing `current.json` for effects owned by any Engineer.
2. `CODEX_READ_ONLY_ARGV_TEMPLATE` (frozen into capability receipts and byte-compared at admission) and the actually spawned argv in `delegated-run-store.ts` are two independent literals with no correspondence check.
3. `tasks/todos.md:44` revisit trigger points at "ME-3A provider observation wiring", which was already stale when written; the real collision surface is the ME-1B engineering-overlay two-pass read semantics.

## Scope

- `src/cli/mcp/engineer-tools.ts`: route the list branch through `observeProviderThreadEffects` and the single-effect branch through the pure-read `observeProviderThreadEffectStatus`; ownership check before audit/return.
- `src/effects/engineers/provider-thread-effect-store.ts`: export `observeProviderThreadEffectStatus` as the pure single-effect read (extracted from `observeProviderThreadEffects`, same never-repair/never-mkdir semantics).
- `src/effects/engineers/delegated-run-store.ts`: derive the spawned argv from `CODEX_READ_ONLY_ARGV_TEMPLATE` by placeholder substitution (single source of truth).
- `tests/cli/mcp-engineer-tools.test.ts`: assert the MCP status read creates no store/lock directories and rewrites no `current.json`.
- `tests/unit/me2a-me3b-readonly-delegation.test.ts`: assert spawned argv equals the template after placeholder substitution where applicable.
- `tasks/todos.md`: retarget the row-44 revisit trigger to the next slice touching the engineering-overlay two-pass read semantics.

Out of scope: any other MCP tool, architecture projections, engineering-overlay semantics themselves, delegation admission logic, ME-3B writable paths.

## Task Breakdown

- [ ] Extract and export the pure single-effect read `observeProviderThreadEffectStatus`; list function reuses it.
- [ ] Switch both MCP `engineer_thread_effect_status` branches to the pure reads; ownership check precedes audit/return.
- [ ] Replace the literal spawn argv in `delegated-run-store.ts` with template placeholder substitution.
- [ ] Add MCP no-write-on-read test assertion (snapshot store/lock dirs and `current.json` bytes before/after).
- [ ] Add argv/template correspondence assertion without duplicating a third literal.
- [ ] Retarget the `tasks/todos.md:44` revisit trigger.

## Acceptance Oracles

- `bun test tests/cli/mcp-engineer-tools.test.ts tests/unit/me3a-provider-thread-effect.test.ts tests/unit/me2a-me3b-readonly-delegation.test.ts tests/cli/engineer.test.ts tests/cli/delegation.test.ts tests/unit/me1c-module-inbox.test.ts --timeout 60000` passes with the two new assertions present.
- `bun run check:type` clean.
- MCP status call against a nonexistent or foreign effect leaves the filesystem byte-identical (asserted by the new test).
- Spawned delegation argv is derived from `CODEX_READ_ONLY_ARGV_TEMPLATE`, not an independent literal (asserted by test or by construction).

## Verification Boundary

Focused six-file test run plus typecheck; gatekeeper re-review of the diff against the three findings before merge.

## Rollback Surface

Single squash-mergeable branch off main `cbda7ab4`; revert of the one merge commit restores prior behavior. No schema, storage-format, or receipt changes.

## Annotations
<!-- [NOTE]: prefixed inline. Claude processes all and revises. -->

## Task Breakdown
- [ ] Extract and export the pure single-effect read `observeProviderThreadEffectStatus`; list function reuses it.
- [ ] Switch both MCP `engineer_thread_effect_status` branches to the pure reads; ownership check precedes audit/return.
- [ ] Replace the literal spawn argv in `delegated-run-store.ts` with template placeholder substitution.
- [ ] Add MCP no-write-on-read test assertion (snapshot store/lock dirs and `current.json` bytes before/after).
- [ ] Add argv/template correspondence assertion without duplicating a third literal.
- [ ] Retarget the `tasks/todos.md:44` revisit trigger.
