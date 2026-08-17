# Plan: Typed errors for effective-state transient classification

> **Status**: Archived
> **Created**: 20260818-0126
> **Slug**: typed-lock-transient-errors
> **Planning Source**: repo-harness-plan
> **Orchestration Kind**: host-plan
> **Source Ref**: (none)
> **Artifact Level**: work-package
> **Promotion Reason**: merge_boundary
> **Verification Boundary**: bun test tests/state/ tests/session-state-authority.test.ts + root required checks, incl. new regression test for lost-ownership transient classification
> **Rollback Surface**: single revertable commit, no state/schema changes
> **Spec**: `docs/spec.md`
> **Research**: See `docs/researches/`
> **Task Contract**: `tasks/contracts/20260818-0126-typed-lock-transient-errors.contract.md`
> **Task Review**: `tasks/reviews/20260818-0126-typed-lock-transient-errors.review.md`
> **Implementation Notes**: `tasks/notes/20260818-0126-typed-lock-transient-errors.notes.md`

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

- Active plan: `plans/plan-20260818-0126-typed-lock-transient-errors.md`
- Sprint contract: `tasks/contracts/20260818-0126-typed-lock-transient-errors.contract.md`
- Sprint review: `tasks/reviews/20260818-0126-typed-lock-transient-errors.review.md`
- Implementation notes: `tasks/notes/20260818-0126-typed-lock-transient-errors.notes.md`
- Deferred-goal ledger: `tasks/todos.md`
- Current checks: `.ai/harness/checks/latest.json`
- Run snapshots: `.ai/harness/runs/`
- Scope authority: `tasks/contracts/20260818-0126-typed-lock-transient-errors.contract.md` `allowed_paths`
- Concurrency rule: `.ai/harness/active-plan` selects the active plan for this worktree when present; `.ai/harness/active-worktree` records the owning worktree. If another worktree already owns active work, open or switch to the matching worktree instead of serializing unrelated plans.
- Execution isolation: approved contract-level work projects through `repo-harness run plan-to-todo --plan plans/plan-20260818-0126-typed-lock-transient-errors.md` and may start `repo-harness run contract-worktree start --plan plans/plan-20260818-0126-typed-lock-transient-errors.md`.

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
- Contract file: `tasks/contracts/20260818-0126-typed-lock-transient-errors.contract.md`
- Review file: `tasks/reviews/20260818-0126-typed-lock-transient-errors.review.md`
- Implementation notes file: `tasks/notes/20260818-0126-typed-lock-transient-errors.notes.md`
- Template: `.claude/templates/contract.template.md`
- Verification command: `repo-harness run verify-contract --contract tasks/contracts/20260818-0126-typed-lock-transient-errors.contract.md --strict`
- Active plan rule: this captured plan is written to `.ai/harness/active-plan` and the owning worktree is written to `.ai/harness/active-worktree` unless --no-active is used. Do not infer active execution from the latest non-archived plan.

## Handoff

- Checks file: `.ai/harness/checks/latest.json`
- Session handoff: `.ai/harness/handoff/current.md`

## Promotion Gate

- **Merge/PR unit**: Captured plan `plans/plan-20260818-0126-typed-lock-transient-errors.md` is the proposed mergeable execution unit; revise before execute if this is only a checklist step.
- **Rollback surface**: single revertable commit, no state/schema changes
- **Verification boundary**: bun test tests/state/ tests/session-state-authority.test.ts + root required checks, incl. new regression test for lost-ownership transient classification
- **Review/acceptance boundary**: `tasks/reviews/20260818-0126-typed-lock-transient-errors.review.md` must record pass against the captured acceptance criteria.
- **High-risk surface**: Risks named in captured planning output; keep the plan Draft if risk ownership is not concrete.
- **Why not checklist row**: merge_boundary

## Evidence Contract

- **State/progress path**: `plans/plan-20260818-0126-typed-lock-transient-errors.md` task breakdown, `tasks/todos.md` deferred-goal ledger, `tasks/contracts/20260818-0126-typed-lock-transient-errors.contract.md`, `tasks/reviews/20260818-0126-typed-lock-transient-errors.review.md`, and `tasks/notes/20260818-0126-typed-lock-transient-errors.notes.md`
- **Verification evidence**: `.ai/harness/checks/latest.json`, `.ai/harness/runs/`, and the commands named in the captured planning output
- **Evaluator rubric**: `tasks/reviews/20260818-0126-typed-lock-transient-errors.review.md` must record a passing Waza /check style recommendation
- **Stop condition**: all task breakdown items are complete, sprint verification passes, and the review recommends pass
- **Rollback surface**: single revertable commit, no state/schema changes

## Captured Planning Output

# Typed errors for effective-state transient classification

## Goal

Fix the correctness bug where exclusive-lock contention is misclassified as a permanent `state_resolution_failed` instead of transient `state_resolution_unstable`, by replacing message-text matching with typed errors. This is T1 of the 2026-08-18 deep-research batch in `tasks/todos.md`, cross-verified 2026-08-18 by two independent explorer passes (all assertions CONFIRMED, line numbers exact).

## Verified problem statement

- `src/cli/hook/runtime.ts:298-302` `isTransientResolutionInstability` string-matches only two messages: `STABILITY_UNSTABLE_MESSAGE` and prefix `timed out waiting for exclusive lock `.
- `src/effects/locking/exclusive-directory-lock.ts` has three throw signatures: timeout (`:319-322`), and `lost exclusive lock ownership: <path>` at `:357` (acquire-phase contention) and `:385` (`assertOwned()` hold-phase loss). The lost-ownership signature is the same transient class as the timeout but is NOT matched, so contention surfaces as `[HarnessStateUnavailable]` with reason `state_resolution_failed` (permanent) via `runtime.ts:275`.
- `STABILITY_UNSTABLE_MESSAGE` is duplicated as a string literal across `runtime.ts:284`, `src/effects/state/resolve-effective-state.ts:805,835`, and asserted as message text in `tests/state/state-concurrency.test.ts:450,597` and `tests/session-state-authority.test.ts:19` (plus a comment mention in `tests/state/effective-state-stability.test.ts:28`).
- Typed-error precedent already exists in the same flow: `StateVersionConfirmMismatchError` (`resolve-effective-state.ts:36,793,804`).

## Design decision

Introduce two typed errors in `src/effects/` (owned by the throw sites, imported by the classifier — same dependency direction as `StateVersionConfirmMismatchError`):

1. `ExclusiveLockContentionError` in `src/effects/locking/exclusive-directory-lock.ts` (or a sibling errors module matching local pattern), thrown at all three lock-failure sites (`:320`, `:357`, `:385`); keep the existing human-readable messages as the error message, carry `lockPath` and a `kind: 'timeout' | 'lost-ownership'` field.
2. `StateResolutionUnstableError` in `src/effects/state/resolve-effective-state.ts` (alongside the existing typed-error precedent), thrown at `:805` and `:835` in place of the raw `Error(STABILITY_UNSTABLE_MESSAGE)`.

Then `isTransientResolutionInstability` in `runtime.ts` becomes pure `instanceof` checks (`StateResolutionUnstableError || ExclusiveLockContentionError`) and the `STABILITY_UNSTABLE_MESSAGE` / `LOCK_TIMEOUT_MESSAGE_PREFIX` string constants in `runtime.ts:284-285` are deleted. Per the no-compatibility-fallback rule, the string-match path is removed in the same change — no dual matching, no message-prefix fallback.

Tests migrate in the same change: `tests/state/state-concurrency.test.ts:450,597` and `tests/session-state-authority.test.ts:19` switch from message-text assertions to typed-error assertions (`instanceof` / error name), and any test constructing these failures by message must construct the typed error instead.

## Explicitly out of scope (EXECUTION_BOUNDARY)

- NO retry-backoff changes, NO `withStateLock` scope narrowing, NO changes to the 3-attempt loop shape (that is T2, tracked separately in `tasks/todos.md`, materially riskier and must not land here).
- NO telemetry, session-context, trace-observer, or architecture-doc changes (T3-T8).
- Absent requirements are forbidden design space; unrequested extras fail closed.

## Task Breakdown

- [x] Add `ExclusiveLockContentionError` and throw it at the three sites in `src/effects/locking/exclusive-directory-lock.ts` (`:320,:357,:385`), preserving current message text.
- [x] Add `StateResolutionUnstableError` in `src/effects/state/resolve-effective-state.ts` and throw it at `:805,:835`; remove the local string literal duplication.
- [x] Rewrite `isTransientResolutionInstability` (`src/cli/hook/runtime.ts:284-302`) as typed `instanceof` checks; delete `STABILITY_UNSTABLE_MESSAGE` and `LOCK_TIMEOUT_MESSAGE_PREFIX` constants from `runtime.ts`.
- [x] Migrate the message-text assertions in `tests/state/state-concurrency.test.ts:450,597` and `tests/session-state-authority.test.ts:19` to typed-error assertions; update the `tests/state/effective-state-stability.test.ts:28` comment if it references the deleted literal.
- [x] Add one regression test: a `lost exclusive lock ownership` failure from the lock layer is classified transient (`state_resolution_unstable`), not permanent.
- [x] Run verification: `bun test tests/state/ tests/session-state-authority.test.ts` plus root required checks.

## Verification boundary

`bun test tests/state/ tests/session-state-authority.test.ts` must pass, including a new regression test proving lock contention classifies as `state_resolution_unstable`. Root required checks (`bun test`, `repo-harness run check-task-workflow --strict`, `bun src/cli/index.ts init --repo . --dry-run`) must stay green.

## Rollback surface

Single revertable commit; no state-file, schema, or wire-format changes. Reverting restores the string-match classifier with no data migration.

## Annotations
<!-- [NOTE]: prefixed inline. Claude processes all and revises. -->

## Task Breakdown
- [x] Add `ExclusiveLockContentionError` and throw it at the three sites in `src/effects/locking/exclusive-directory-lock.ts` (`:320,:357,:385`), preserving current message text.
- [x] Add `StateResolutionUnstableError` in `src/effects/state/resolve-effective-state.ts` and throw it at `:805,:835`; remove the local string literal duplication.
- [x] Rewrite `isTransientResolutionInstability` (`src/cli/hook/runtime.ts:284-302`) as typed `instanceof` checks; delete `STABILITY_UNSTABLE_MESSAGE` and `LOCK_TIMEOUT_MESSAGE_PREFIX` constants from `runtime.ts`.
- [x] Migrate the message-text assertions in `tests/state/state-concurrency.test.ts:450,597` and `tests/session-state-authority.test.ts:19` to typed-error assertions; update the `tests/state/effective-state-stability.test.ts:28` comment if it references the deleted literal.
- [x] Add one regression test: a `lost exclusive lock ownership` failure from the lock layer is classified transient (`state_resolution_unstable`), not permanent.
- [x] Run verification: `bun test tests/state/ tests/session-state-authority.test.ts` plus root required checks.
