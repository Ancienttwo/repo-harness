> **Archived**: 2026-08-18 02:21
> **Related Plan**: plans/archive/plan-20260818-0126-typed-lock-transient-errors.md
> **Outcome**: Completed
> **Lifecycle**: contract
> **Parent Run ID**: run-20260818-0221

# Task Contract: typed-lock-transient-errors

> **Status**: Fulfilled
> **Plan**: plans/plan-20260818-0126-typed-lock-transient-errors.md
> **Task Profile**: bugfix
> <!-- legal values: code-change | docs-only | ledger-closeout | migration | eval-only | delegated-run | bugfix (omit for legacy passthrough); see docs/reference-configs/sprint-contracts.md -->
> **Owner**: ancienttwo
> **Capability ID**: root
> **Last Updated**: 2026-08-18 01:26
> **Review File**: `tasks/reviews/20260818-0126-typed-lock-transient-errors.review.md`
> **Notes File**: `tasks/notes/20260818-0126-typed-lock-transient-errors.notes.md`
> **Exemplar**: `docs/reference-configs/contract-brief-example.md`

## Why

Exclusive-lock contention during effective-state resolution is misclassified as permanent failure: `lost exclusive lock ownership` throws from the lock layer are not matched by `isTransientResolutionInstability`, so a transient contention surfaces as `[HarnessStateUnavailable]` with reason `state_resolution_failed` instead of `state_resolution_unstable`. Under concurrent agents this turns recoverable contention into hard fail-closed sessions with the wrong diagnostic. The classifier is also message-text-coupled (the `STABILITY_UNSTABLE_MESSAGE` literal is duplicated across 2 source files and asserted in 3 test files), a coupling this repo's rules otherwise forbid.

## Goal

Replace the message-text transient classifier with typed errors so all three lock/stability failure signatures classify correctly:

1. `ExclusiveLockContentionError` thrown at the three failure sites in `src/effects/locking/exclusive-directory-lock.ts` (timeout at `:320`, lost-ownership at `:357` and `:385`), carrying `lockPath` and `kind: 'timeout' | 'lost-ownership'`, preserving the current message text.
2. `StateResolutionUnstableError` thrown at `src/effects/state/resolve-effective-state.ts:805,835` in place of `new Error(STABILITY_UNSTABLE_MESSAGE)`.
3. `isTransientResolutionInstability` (`src/cli/hook/runtime.ts:284-302`) rewritten as pure `instanceof` checks; the `STABILITY_UNSTABLE_MESSAGE` and `LOCK_TIMEOUT_MESSAGE_PREFIX` string constants in `runtime.ts` deleted in the same change (no dual matching, no message-prefix fallback).
4. Message-text assertions migrated to typed-error assertions in `tests/state/state-concurrency.test.ts` (~`:450,:597`) and `tests/session-state-authority.test.ts` (~`:19`); the stale literal mention in the `tests/state/effective-state-stability.test.ts:28` comment updated.
5. A new regression test proves a lost-ownership lock failure classifies as transient (`state_resolution_unstable`), failing on the unfixed code.

## Scope

- In scope: the four files named in Goal, their listed tests, one new regression test file, and this contract's workflow artifacts (notes/review/plan checkboxes).
- Out of scope (EXECUTION_BOUNDARY — absent requirements are forbidden design space; unrequested extras fail closed): retry backoff, `withStateLock` scope narrowing, any change to the 3-attempt loop shape (that is T2 in `tasks/todos.md`); telemetry, session-context, trace-observer, architecture docs (T3-T8); any refactor beyond the typed-error introduction.
- Taste constraints: <!-- advisory only, no run gate; default style/taste lives in AGENTS.md and the minimal-change policy, use this to record a per-task override -->

## Stop Conditions

- Stop and hand back to the parent if the change would require editing a path outside Allowed Paths.
- Stop if an Exit Criteria command cannot be run in this environment.
- Stop if Goal, Scope, or Exit Criteria are internally contradictory.

## Falsifier

If `lost exclusive lock ownership` is actually raised only in situations where retrying cannot succeed (i.e. it is genuinely permanent), the transient classification would be wrong. Cheapest proof point: read `src/effects/locking/exclusive-directory-lock.ts:340-390` — lost-ownership at `:357` fires when another process wins the acquire race and at `:385` when ownership lapses mid-hold; both are the same contention class as the already-transient timeout at `:320`, so a fresh attempt can succeed. Verified by direct read on 2026-08-18.

## Root Cause Evidence

- root_cause: `src/cli/hook/runtime.ts:298-302` `isTransientResolutionInstability` matches only `STABILITY_UNSTABLE_MESSAGE` and the `timed out waiting for exclusive lock ` prefix, so the third real throw signature `lost exclusive lock ownership: <path>` (`src/effects/locking/exclusive-directory-lock.ts:357,385`) falls through to the permanent `state_resolution_failed` branch at `runtime.ts:275`.
- repro: construct an `Error('lost exclusive lock ownership: /tmp/x')` failure from the lock layer during `resolveEffectiveStateWithTransientRetry` — the run fails permanently with `state_resolution_failed` instead of retrying/classifying `state_resolution_unstable` (regression guard below encodes this).
- regression_guard: tests/state/effective-state-transient-classification.test.ts
- pre_fix_failure_artifact: tasks/notes/20260818-0126-typed-lock-transient-errors.prefix-failure.txt

## Workflow Inventory

- Source plan: `plans/plan-20260818-0126-typed-lock-transient-errors.md`
- Deferred-goal ledger: `tasks/todos.md`
- Review file: `tasks/reviews/20260818-0126-typed-lock-transient-errors.review.md`
- Notes file: `tasks/notes/20260818-0126-typed-lock-transient-errors.notes.md`
- Checks file: `.ai/harness/checks/latest.json`
- Run snapshots: `.ai/harness/runs/`
- Scope gate: edit only paths listed under `allowed_paths`; update this contract before widening scope.
- Completion gate: run `verify-sprint --prepare-acceptance`, record one typed AcceptanceReceipt under the frozen policy below, then run `verify-sprint`; review Markdown is projection only.

## Change Assessment

```json
{"protocol":1,"oracles":[{"id":"transient-classification-regression","kind":"deterministic_test","paths":["*"]}]}
```

## Acceptance Policy

```json
{"protocol":1,"reviewer":"Claude","user_waiver":"allowed"}
```

## Allowed Paths

```yaml
allowed_paths:
  - docs/spec.md
  - plans/
  - tasks/todos.md
  - tasks/contracts/20260818-0126-typed-lock-transient-errors.contract.md
  - tasks/reviews/20260818-0126-typed-lock-transient-errors.review.md
  - tasks/notes/20260818-0126-typed-lock-transient-errors.notes.md
  - tasks/notes/20260818-0126-typed-lock-transient-errors.prefix-failure.txt
  - .ai/context/capabilities.json
  - .claude/templates/
  - src/
  - tests/
```

## Evidence Requirements

```yaml
evidence_requirements:
  # Set benchmark to required when this contract consumes the harness profile benchmark matrix.
  benchmark: not_applicable
```

## Delegation Contract

```yaml
delegation:
  budget:
    tokens: null
    runner_invocations: null
    wall_time_minutes: null
  permission_scope:
    mode: inherit_allowed_paths
    writable_paths: []
    network: inherited
  roles:
    parent:
      mode: narrate_and_gatekeep
      purpose: approval_checkpoint_owner
    explorer:
      mode: read_only
      purpose: codebase_research
    worker:
      mode: edit_within_allowed_paths
      purpose: implementation
    verifier:
      mode: read_only
      purpose: exit_criteria_review
  runner:
    preferred:
      - subagent
    fallback: null
    brief_is_authoritative: true
```

## Exit Criteria (Machine Verifiable)

```yaml
exit_criteria:
  files_exist:
    - docs/spec.md
  artifacts_exist:
    - .ai/harness/checks/latest.json
    - tasks/notes/20260818-0126-typed-lock-transient-errors.notes.md
  tests_pass:
    - path: tests/state/effective-state-transient-classification.test.ts
    - path: tests/state/state-concurrency.test.ts
    - path: tests/state/effective-state-stability.test.ts
    - path: tests/session-state-authority.test.ts
  commands_succeed:
    - bun run check:type
    - bun test
```

## Acceptance Notes (Human Review)

- Functional behavior:
- Edge cases:
- Regression risks:

## Rollback Point

- Commit / checkpoint: worktree base `1d1b702a` (branch `codex/typed-lock-transient-errors`)
- Revert strategy: single revertable commit; no state-file, schema, or wire-format changes — reverting restores the string-match classifier with no data migration.
