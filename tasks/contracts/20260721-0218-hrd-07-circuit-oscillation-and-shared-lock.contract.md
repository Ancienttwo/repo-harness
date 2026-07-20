# Task Contract: hrd-07-circuit-oscillation-and-shared-lock

> **Status**: Fulfilled
> **Plan**: plans/plan-20260721-0218-hrd-07-circuit-oscillation-and-shared-lock.md
> **Task Profile**: code-change
> **Owner**: kito
> **Capability ID**: root
> **Last Updated**: 2026-07-21 04:06 (strict contract verification fulfilled; merge authorization pending)
> **Execution Base**: `origin/main@3776fb7dc2ddb5cd2602e45a37ee0f64c319856b`
> **Review File**: `tasks/reviews/20260721-0218-hrd-07-circuit-oscillation-and-shared-lock.review.md`
> **Notes File**: `tasks/notes/20260721-0218-hrd-07-circuit-oscillation-and-shared-lock.notes.md`

## Why

The existing breaker hashes action rendering and progress into one exact key.
That catches identical retries, but the same unresolved blocker escapes by
alternating actions (`A -> B -> A`) or changing reason/path/fingerprint text.
The breaker also owns a second bespoke lock protocol even though the repository
now has a hardened shared directory-lock primitive. If HRD-07 ships wrong, it
either remains fail-open under cosmetic churn, resets without authoritative
progress, loses concurrent attempt increments, or reclaims a lock whose owner
may still be live.

## Goal

Make `recordCircuitAttempt()` keep one bounded action stream per `kind`, use
`hash(kind + guard)` as the stable blocker identity, count exact/render-churn
streaks, trip an unchanged-progress `A-B-A` blocker oscillation immediately,
and reset the stream only when the existing LSC-04 `progressToken` changes.
Replace the bespoke
`openSync`/`Atomics.wait` file lock with breaker-local
`withExclusiveDirectoryLock` use that explicitly sets
`reclaimStaleOwner: false` and keeps the two-second wait. Preserve existing
per-kind limits, decisions, concurrency serialization, and live callers.

## Scope

- In scope:
  - Protocol-2 ignored runtime state keyed by `kind`, with `progress_token`,
    current `hash(kind + guard)` blocker key, render key, capped streak, at
    most two blocker observations, and latest deterministic pattern.
  - Render key from `reason + pathOrAction + fingerprint`; these fields never
    identify blockers or determine semantic progress.
  - `withExclusiveDirectoryLock` option forwarding plus a validated wait-time
    override; breaker call pins no reclaim and 2,000 ms.
  - Positive and negative fixtures for exact repeat, A-B-A, superficial churn,
    and real progress; concurrent-process serialization and stale/live-owner
    preservation.
  - One-shot replacement of structurally valid protocol-1 runtime state and
    the file-shaped lock; malformed/unknown/read-error state fails closed and
    preserves evidence, with no dual semantic read.
- Out of scope:
  - Recomputing or changing LSC-04 progress-token inputs.
  - Adding caller fields, shell hook changes/projections, or heuristic parsing
    of reason/path/fingerprint.
  - HRD-06 delegation-state locking, any global lock, HRD-08 telemetry, HRD-09
    adopted migration, and unrelated documentation drift.
- Taste constraints: one source of progress truth, bounded state, fail closed,
  no compatibility reader/fallback, no drive-by refactor.

## Stop Conditions

- Stop if a live caller disproves that `kind + guard` is a stable blocker class
  under one authoritative progress token.
- Stop if the shared wrapper cannot preserve breaker-local two-second wait,
  no-stale-reclaim, token-owned release, or 12-process serialization.
- Stop if implementation requires a caller/schema/path outside Allowed Paths;
  update this contract only after a new design decision.
- Stop if an Exit Criteria command cannot run, or after three fail/fix/reverify
  rounds for the same issue.

## Falsifier

A current live caller that intentionally uses the same `kind + guard` for two
unrelated blockers while LSC-04 emits the same progress token would falsify the
chosen stream identity. The pre-implementation caller enumeration found none.

## Workflow Inventory

- Source plan: `plans/plan-20260721-0218-hrd-07-circuit-oscillation-and-shared-lock.md`
- Sprint: `plans/sprints/20260719-1531-hook-runtime-diet.sprint.md`, row 7
- Review: `tasks/reviews/20260721-0218-hrd-07-circuit-oscillation-and-shared-lock.review.md`
- Notes: `tasks/notes/20260721-0218-hrd-07-circuit-oscillation-and-shared-lock.notes.md`
- Checks/run cache: `.ai/harness/checks/latest.json`, `.ai/harness/runs/`
- Completion gate: internal review must pass for the normalized subject;
  canonical external acceptance or a fresh explicit user waiver is required
  before sprint closeout. Merge remains separately authorized.

## Allowed Paths

```yaml
allowed_paths:
  - plans/plan-20260721-0218-hrd-07-circuit-oscillation-and-shared-lock.md
  - plans/sprints/20260719-1531-hook-runtime-diet.sprint.md
  - tasks/current.md
  - tasks/contracts/20260721-0218-hrd-07-circuit-oscillation-and-shared-lock.contract.md
  - tasks/reviews/20260721-0218-hrd-07-circuit-oscillation-and-shared-lock.review.md
  - tasks/notes/20260721-0218-hrd-07-circuit-oscillation-and-shared-lock.notes.md
  - src/cli/hook/circuit-breaker.ts
  - src/effects/locking/exclusive-directory-lock.ts
  - tests/harness-circuit-breakers.test.ts
```

## Evidence Requirements

```yaml
evidence_requirements:
  benchmark: not_applicable
```

## Delegation Contract

```yaml
delegation:
  budget:
    tokens: null
    runner_invocations: 4
    wall_time_minutes: 30
  permission_scope:
    mode: inherit_allowed_paths
    writable_paths: []
    network: inherited
  roles:
    parent:
      mode: narrate_and_gatekeep
      purpose: plan_and_acceptance_owner
    explorer:
      mode: read_only
      purpose: caller_and_lock_surface_map
    worker:
      mode: edit_within_allowed_paths
      purpose: detector_and_lock_implementation
    verifier:
      mode: read_only
      purpose: contract_acceptance_review
  runner:
    preferred:
      - subagent
      - main-thread
    fallback: main-thread
    brief_is_authoritative: true
```

## Exit Criteria (Machine Verifiable)

```yaml
exit_criteria:
  files_contain:
    - path: src/cli/hook/circuit-breaker.ts
      pattern: "withExclusiveDirectoryLock"
    - path: src/cli/hook/circuit-breaker.ts
      pattern: "superficial-churn"
    - path: src/cli/hook/circuit-breaker.ts
      pattern: "real-progress-reset"
  tests_pass:
    - path: tests/harness-circuit-breakers.test.ts
  commands_succeed:
    - bun test tests/mutation-guard.test.ts tests/cli/hook.test.ts tests/hook-runtime-characterization.test.ts
    - bun run check:type
    - bash scripts/check-architecture-sync.sh
    - bash scripts/check-task-sync.sh
    - repo-harness run check-task-workflow --strict
  qa_scores:
    - dimension: functionality
      min: 9
    - dimension: code_quality
      min: 8
  manual_checks:
    - "Exact repeat, A-B-A, and superficial churn trip only under unchanged progress"
    - "Changed progress token resets count and bounded action history to one"
    - "Shared breaker lock preserves concurrent counts and never reclaims stale/live owners"
    - "Evaluator review recommends pass for the normalized current subject"
```

## Acceptance Notes (Human Review)

- Functional behavior: one bounded stream per kind; exact/churn share the
  current blocker streak, A-B-A trips immediately, and non-cycling blocker
  changes begin at one under the existing decision/limit contract.
- Edge cases: empty/missing token remains a stable fail-closed token; protocol-1
  state is not accepted as protocol 2; malformed or unknown state is preserved
  and rejected; old file-shaped lock is never removed automatically.
- Regression risks: false positives if guard identity is reused across unrelated
  blockers; lock wait regression; dropped concurrent increments.

## Rollback Point

- Commit/checkpoint: execution base `3776fb7dc2ddb5cd2602e45a37ee0f64c319856b`.
- Revert strategy: revert the HRD-07 commit/PR. After confirming no live hook
  owner, remove ignored protocol-2 state/lock if an operator wants a clean
  first attempt; no durable product data migration exists.
