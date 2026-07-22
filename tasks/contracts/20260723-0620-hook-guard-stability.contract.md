# Task Contract: hook-guard-stability

> **Status**: Active
> **Plan**: plans/plan-20260723-0620-hook-guard-stability.md
> **Task Profile**: bugfix
> **Owner**: kito
> **Reviewer**: Claude
> **Waiver Policy**: user_waiver allowed, owner kito only, per Acceptance Policy below
> **Base SHA**: `bd461142c7b74a5be73b0eac5fe1b632b4d1a121` (fresh worktree branched from `origin/main` at package start; verified equal to `origin/main` after fetch — includes PRs #126, #127, and #112, none of which touch this package's fix surface)
> **Target Branch**: main (via one independent PR)
> **Working Branch**: `codex/hook-guard-stability`
> **PR Unit**: one PR carrying the stability-set partition, the typed hook-wrapper resolution outcome with bounded retry and distinct diagnostics, the red-first regression guard with its captured pre-fix failure artifact, and this package's workflow artifacts
> **Capability ID**: root
> **Last Updated**: 2026-07-23 06:20
> **Review File**: `tasks/reviews/20260723-0620-hook-guard-stability.review.md`
> **Notes File**: `tasks/notes/20260723-0620-hook-guard-stability.notes.md`
> **Exemplar**: `docs/reference-configs/contract-brief-example.md`

## Why

The PreEdit WorkflowProfileGuard collapses three unrelated conditions —
resolution threw, effective state genuinely blocked, profile unsupported —
into one `null` and one misleading fail-closed banner. The dominant throw
is the stability contract aborting on churn of non-authority surfaces
(working-tree diff fingerprint, checks/latest, tasks/current,
handoff/resume), so ordinary concurrent work blocks innocent edits.
Every linked-worktree package since EPC has paid repeated false
Edit/Write blocks and worked around them with heredoc writes, which
bypasses the guard entirely — the current behavior is both noisy and
weaker than a truthful gate.

## Goal

Deliver the plan's four-point partition (plan `## Goal`): non-authority
churn excluded from the stability-abort decision; typed wrapper outcomes
with bounded retry; residual instability still fail-closed but with a
distinct truthful diagnostic; genuine blockers byte-identical to today.
The regression guard proves both directions red-first.

## Scope

- In scope: `src/cli/hook/runtime.ts` (typed resolution outcome, bounded
  retry, lock-timeout handling); `src/effects/state/resolve-effective-state.ts`
  (stability-set partition only — output fields, including subject and
  evidence revisions, keep their current shape and content);
  `src/cli/hook/mutation-guard.ts` (only the guard branch that renders
  the distinct instability diagnostic; blocker and unsupported-profile
  branches byte-unchanged); new `tests/state/effective-state-stability.test.ts`;
  narrow updates to existing tests ONLY if one pins the collapsed
  throw-to-banner behavior (list each with justification);
  `.ai/harness/runs/hook-guard-stability/` (pre-fix artifact + copied
  diagnosis probes); this package's plan/contract/review/notes;
  `tasks/todos.md` projection if a row needs updating.
- Out of scope: circuit-breaker emission (`src/cli/hook/circuit-breaker.ts`);
  every SSD surface (`src/core/skill-surface/`, installer, sync script,
  `assets/skill-commands/`); plan-transition and blocker semantics;
  `src/effects/locking/` internals (timeout value unchanged; only the
  wrapper's handling of its throw); global CLI refresh (post-merge
  operator action); any fail-open path.
- Taste constraints: smallest change satisfying the partition; no new
  config knobs; diagnostics name the mechanism in one line.

## Execution Boundary

Requirements absent from the plan are forbidden design space. Do not
refactor state resolution, add retry configuration, introduce telemetry,
or touch surfaces beyond the fix. Fail closed on ambiguity: stop and
report rather than widening scope.

## Stop Conditions

- Stop and hand back to the parent if the change would require editing a
  path outside Allowed Paths; update this contract first.
- Stop if partitioning the stability set changes any resolved-state
  output field shape or value for a stable repository (byte-parity
  falsifier below).
- Stop if the regression guard cannot be made deterministic (no
  sleep-based timing races committed to the suite).
- Stop after three fail-fix-reverify rounds on one issue.

## Falsifier

The direction is wrong if excluding non-authority churn from the
stability-abort set changes resolved output for a quiescent repo (it
must not — the same sources are still read once and reported), or if the
bounded retry masks a genuine blocker (the real-conflict regression case
must still block with today's exact message). Cheapest proof: the
regression guard's two directions — churn-no-block and
real-conflict-still-blocks — plus a byte-diff of `state resolve --json`
output on a quiescent repo before/after the fix.

## Root Cause Evidence

- root_cause: `src/cli/hook/runtime.ts:246-261` catch-all converts the
  stability-contract throw from
  `src/effects/state/resolve-effective-state.ts:582-634` (whose
  `source_hashes` at :482-501 include non-authority churn surfaces:
  `review_subject` working-tree diff fingerprint,
  `.ai/harness/checks/latest.json`, `tasks/current.md`, handoff/resume)
  into `null`, which `src/cli/hook/mutation-guard.ts:398-406` cannot
  distinguish from a genuine blocker, so `mutation-guard.ts:275-285`
  fails closed with the generic banner. Secondary same-shape path: the
  5 s exclusive-lock timeout throw
  (`src/effects/locking/exclusive-directory-lock.ts:19`).
- repro: loop `resolveEffectiveState` (or the verbatim hook-wrapper
  probe) while a concurrent writer churns a hashed non-authority source;
  the stability loop exhausts and throws. Diagnosis probes (2026-07-23,
  root-cause-prover): baseline 0/200 blocked; single-source churn 16/200
  throws; sustained git-churn 30/30 blocked at ~375 ms/resolution. Probe
  scripts and JSON results are copied into
  `.ai/harness/runs/hook-guard-stability/`.
- regression_guard: tests/state/effective-state-stability.test.ts
- pre_fix_failure_artifact: .ai/harness/runs/hook-guard-stability/pre-fix-regression.log

## Concurrency and Ownership

- Fix surface is disjoint from the active SSD work-package's
  `allowed_paths` (verified: PRs #126/#127/#112 and the SSD families do
  not intersect this package's paths); both packages proceed in parallel
  with independent PRs.
- The orchestrator is the only committer/pusher/merger.

## No-Compatibility Declaration

No alias, dual read path, semantic fallback, or migration shim. The old
collapsed behavior is removed in the same package that replaces it; no
flag preserves it.

## Workflow Inventory

- Source plan: `plans/plan-20260723-0620-hook-guard-stability.md`
- Deferred-goal ledger: `tasks/todos.md`
- Review file: `tasks/reviews/20260723-0620-hook-guard-stability.review.md`
- Notes file: `tasks/notes/20260723-0620-hook-guard-stability.notes.md`
- Checks file: `.ai/harness/checks/latest.json`
- Run snapshots: `.ai/harness/runs/hook-guard-stability/`
- Scope gate: edit only paths listed under `allowed_paths`; update this
  contract before widening scope.
- Completion gate: run `verify-sprint --prepare-acceptance`, record one
  typed AcceptanceReceipt under the frozen policy below, then run
  `verify-sprint`; review Markdown is projection only.

## Acceptance Policy

```json
{"protocol":1,"reviewer":"Claude","user_waiver":"allowed"}
```

## Allowed Paths

```yaml
allowed_paths:
  - src/cli/hook/runtime.ts
  - src/cli/hook/mutation-guard.ts
  - src/effects/state/resolve-effective-state.ts
  - tests/state/effective-state-stability.test.ts
  - tests/state/
  - tests/cli/
  - .ai/harness/runs/hook-guard-stability/
  - plans/plan-20260723-0620-hook-guard-stability.md
  - tasks/contracts/20260723-0620-hook-guard-stability.contract.md
  - tasks/reviews/20260723-0620-hook-guard-stability.review.md
  - tasks/notes/20260723-0620-hook-guard-stability.notes.md
  - tasks/todos.md
  - .ai/harness/worktrees/hook-guard-stability.json
```

## Forbidden Paths and Actions

```yaml
forbidden:
  paths:
    - src/cli/hook/circuit-breaker.ts
    - src/effects/locking/
    - src/core/skill-surface/
    - src/cli/installer/
    - scripts/
    - assets/
    - package.json
  actions:
    - any fail-open path (residual instability must still block)
    - changing blocker or unsupported-profile messages or exit codes
    - retry configuration knobs or telemetry
    - sleep-based nondeterministic tests
    - push, PR open, or merge (orchestrator-only)
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
      - codex-exec
      - main-thread
    fallback: main-thread
    brief_is_authoritative: true
```

## Exit Criteria (Machine Verifiable)

```yaml
exit_criteria:
  files_exist:
    - tests/state/effective-state-stability.test.ts
  artifacts_exist:
    - .ai/harness/checks/latest.json
    - tasks/notes/20260723-0620-hook-guard-stability.notes.md
    - .ai/harness/runs/hook-guard-stability/pre-fix-regression.log
  tests_pass:
    - path: tests/state/effective-state-stability.test.ts
  commands_succeed:
    - bun run check:type
    - bun test tests/state/
  manual_checks:
    - "Regression guard proves both directions: non-authority churn no longer blocks; a real plan-contract conflict still blocks with today's exact message and exit code"
    - "Pre-fix failure artifact shows the regression guard red on unfixed code with non-zero PRE_FIX_EXIT"
    - "state resolve --json output on a quiescent repo is byte-identical before and after the fix"
    - "Residual-instability diagnostic is distinct, names concurrent-write instability and the bounded retry, and still fails closed"
    - "Diagnosis probe artifacts copied into the package run snapshots"
```

## Acceptance Notes (Human Review)

- Functional behavior:
- Edge cases:
- Regression risks:

## Rollback Point

- Commit / checkpoint: `bd461142c7b74a5be73b0eac5fe1b632b4d1a121`
  (worktree base).
- Revert strategy: revert the single PR; the guard returns to the
  current collapse-and-block behavior; no state artifacts or installed
  surfaces are migrated either way.
