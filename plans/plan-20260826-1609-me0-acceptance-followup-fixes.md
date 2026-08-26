# Plan: ME-0 acceptance follow-up fixes

> **Status**: Executing
> **Created**: 20260826-1609
> **Slug**: me0-acceptance-followup-fixes
> **Planning Source**: repo-harness-plan
> **Orchestration Kind**: host-plan
> **Source Ref**: (none)
> **Artifact Level**: work-package
> **Promotion Reason**: verification_boundary
> **Verification Boundary**: Focused engineer CLI/binding-store oracles plus typecheck and task-sync green before commit
> **Rollback Surface**: Single revertable commit on main touching four files
> **Spec**: `docs/spec.md`
> **Research**: See `docs/researches/`
> **Task Contract**: `tasks/contracts/20260826-1609-me0-acceptance-followup-fixes.contract.md`
> **Task Review**: `tasks/reviews/20260826-1609-me0-acceptance-followup-fixes.review.md`
> **Implementation Notes**: `tasks/notes/20260826-1609-me0-acceptance-followup-fixes.notes.md`

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

- Active plan: `plans/plan-20260826-1609-me0-acceptance-followup-fixes.md`
- Sprint contract: `tasks/contracts/20260826-1609-me0-acceptance-followup-fixes.contract.md`
- Sprint review: `tasks/reviews/20260826-1609-me0-acceptance-followup-fixes.review.md`
- Implementation notes: `tasks/notes/20260826-1609-me0-acceptance-followup-fixes.notes.md`
- Deferred-goal ledger: `tasks/todos.md`
- Current checks: `.ai/harness/checks/latest.json`
- Run snapshots: `.ai/harness/runs/`
- Scope authority: `tasks/contracts/20260826-1609-me0-acceptance-followup-fixes.contract.md` `allowed_paths`
- Concurrency rule: `.ai/harness/active-plan` selects the active plan for this worktree when present; `.ai/harness/active-worktree` records the owning worktree. If another worktree already owns active work, open or switch to the matching worktree instead of serializing unrelated plans.
- Execution isolation: approved contract-level work projects through `repo-harness run plan-to-todo --plan plans/plan-20260826-1609-me0-acceptance-followup-fixes.md` and may start `repo-harness run contract-worktree start --plan plans/plan-20260826-1609-me0-acceptance-followup-fixes.md`.

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
- Contract file: `tasks/contracts/20260826-1609-me0-acceptance-followup-fixes.contract.md`
- Review file: `tasks/reviews/20260826-1609-me0-acceptance-followup-fixes.review.md`
- Implementation notes file: `tasks/notes/20260826-1609-me0-acceptance-followup-fixes.notes.md`
- Template: `.claude/templates/contract.template.md`
- Verification command: `repo-harness run verify-contract --contract tasks/contracts/20260826-1609-me0-acceptance-followup-fixes.contract.md --strict`
- Active plan rule: this captured plan is written to `.ai/harness/active-plan` and the owning worktree is written to `.ai/harness/active-worktree` unless --no-active is used. Do not infer active execution from the latest non-archived plan.

## Handoff

- Checks file: `.ai/harness/checks/latest.json`
- Session handoff: `.ai/harness/handoff/current.md`

## Promotion Gate

- **Merge/PR unit**: Captured plan `plans/plan-20260826-1609-me0-acceptance-followup-fixes.md` is the proposed mergeable execution unit; revise before execute if this is only a checklist step.
- **Rollback surface**: Single revertable commit on main touching four files
- **Verification boundary**: Focused engineer CLI/binding-store oracles plus typecheck and task-sync green before commit
- **Review/acceptance boundary**: `tasks/reviews/20260826-1609-me0-acceptance-followup-fixes.review.md` must record pass against the captured acceptance criteria.
- **High-risk surface**: Risks named in captured planning output; keep the plan Draft if risk ownership is not concrete.
- **Why not checklist row**: verification_boundary

## Evidence Contract

- **State/progress path**: `plans/plan-20260826-1609-me0-acceptance-followup-fixes.md` task breakdown, `tasks/todos.md` deferred-goal ledger, `tasks/contracts/20260826-1609-me0-acceptance-followup-fixes.contract.md`, `tasks/reviews/20260826-1609-me0-acceptance-followup-fixes.review.md`, and `tasks/notes/20260826-1609-me0-acceptance-followup-fixes.notes.md`
- **Verification evidence**: `.ai/harness/checks/latest.json`, `.ai/harness/runs/`, and the commands named in the captured planning output
- **Evaluator rubric**: `tasks/reviews/20260826-1609-me0-acceptance-followup-fixes.review.md` must record a passing Waza /check style recommendation
- **Stop condition**: all task breakdown items are complete, sprint verification passes, and the review recommends pass
- **Rollback surface**: Single revertable commit on main touching four files

## Captured Planning Output

## Goal

Close the ME-0A/ME-0B acceptance findings: engineer CLI error-code layering (with regression test), ME-0A archived review header resync, and binding-store canonical-bytes comparison.

## Context

Gatekeeper acceptance of ME-0A (0e8f63d5) and ME-0B (9913846f..374d97cb^2) returned PASS with four non-blocking findings. This slice lands the three approved fixes; the capture-plan template duplication stays deferred.

## Scope

- `src/cli/commands/engineer.ts`: non-domain failures no longer reuse the protocol error vocabulary; `CliArgumentError` -> `invalid_argument` (existing repo convention), unknown -> `internal_error`.
- `tests/cli/engineer.test.ts`: add one regression test asserting an invalid `--expected-binding-generation` reports `invalid_argument`, not `engineer_binding_invalid`.
- `tasks/archive/review-20260824-2341-me0a-engineer-profile-binding.md`: resync header Status/Recommendation/Reviewed Subject SHA256/Reviewed Target Revision with the acceptance receipt in the same file.
- `src/effects/engineers/binding-store.ts`: replace the JSON.stringify structural comparison at the retire-resume path with `canonicalEngineerBindingBytes`, matching sibling sites.

Out of scope: the five swept sibling fallback-code sites, `guards.edit_plan_gate` policy, exitCode unification, capture-plan template dedup.

## Verification Boundary

Focused oracles below plus typecheck and task-sync run green on the combined change before commit.

## Rollback Surface

Single commit on main touching the four files above; revert of that commit restores prior behavior.

## Oracles

- `bun test tests/cli/engineer.test.ts tests/unit/engineer-binding-store.test.ts tests/unit/engineer-profile-binding-v1.test.ts --timeout 60000`
- `bun run check:type`
- `bash scripts/check-task-sync.sh`

## Task Breakdown

- [x] Layer engineer CLI error codes (`CliArgumentError` -> `invalid_argument`, unknown -> `internal_error`).
- [x] Resync ME-0A archived review header with its acceptance receipt.
- [x] Replace JSON.stringify comparison with canonical bytes in binding-store retire-resume path.
- [x] Add the `invalid_argument` regression test to `tests/cli/engineer.test.ts` and run the oracles.

## Annotations
<!-- [NOTE]: prefixed inline. Claude processes all and revises. -->

## Task Breakdown
- [x] Layer engineer CLI error codes (`CliArgumentError` -> `invalid_argument`, unknown -> `internal_error`).
- [x] Resync ME-0A archived review header with its acceptance receipt.
- [x] Replace JSON.stringify comparison with canonical bytes in binding-store retire-resume path.
- [x] Add the `invalid_argument` regression test to `tests/cli/engineer.test.ts` and run the oracles.
