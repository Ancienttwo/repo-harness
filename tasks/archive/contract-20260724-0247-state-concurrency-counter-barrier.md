> **Archived**: 2026-07-24 02:47
> **Related Plan**: plans/archive/plan-20260724-0232-state-concurrency-counter-barrier.md
> **Outcome**: Completed
> **Lifecycle**: contract
> **Parent Run ID**: run-20260724-0247

# Task Contract: state-concurrency-counter-barrier

> **Status**: Fulfilled
> **Plan**: plans/plan-20260724-0232-state-concurrency-counter-barrier.md
> **Task Profile**: bugfix
> <!-- legal values: code-change | docs-only | ledger-closeout | migration | eval-only | delegated-run | bugfix (omit for legacy passthrough); see docs/reference-configs/sprint-contracts.md -->
> **Owner**: kito
> **Capability ID**: root
> **Last Updated**: 2026-07-24 02:32
> **Review File**: `tasks/reviews/20260724-0232-state-concurrency-counter-barrier.review.md`
> **Notes File**: `tasks/notes/20260724-0232-state-concurrency-counter-barrier.notes.md`
> **Exemplar**: `docs/reference-configs/contract-brief-example.md`

## Why

Three concurrency fixtures publish their ready marker before the counter consumed
immediately after that barrier exists. Under full-suite scheduling pressure the
parent can therefore throw `ENOENT` before it reaches the Effective State
resolver, making the repository test gate nondeterministic.

## Goal

Make all three continuous-mutation fixtures publish readiness only after their
initial counter write, prove the formerly failing interleaving before and after
the change, and remove the resolved deferred-goal row without changing
production Effective State behavior.

## Scope

- In scope:
  - `tests/state/state-concurrency.test.ts` ready/counter ordering in the two same-shape mutators.
  - `tests/state/effective-state-stability.test.ts` ready/counter ordering in the shared continuous mutator.
  - Deterministic pre-fix scheduling evidence under the task run directory.
  - The matching known-flake row in `tasks/todos.md`.
- Out of scope:
  - Production resolver, lock, version, cache, retry, timeout, and process-runner behavior.
  - Other flaky tests and any compatibility or fallback path.
- Taste constraints: preserve the existing fixture structure and use the
  existing ready marker as the single synchronization authority.

## Stop Conditions

- Stop and hand back to the parent if the change would require editing a path outside Allowed Paths.
- Stop if an Exit Criteria command cannot be run in this environment.
- Stop if Goal, Scope, or Exit Criteria are internally contradictory.

## Falsifier

If an instrumented run can observe `counterPath` already existing for every
legal schedule after `startedPath` becomes visible on the unfixed code, the
ordering hypothesis is wrong. The cheapest proof is a forced preemption
immediately after the current ready-marker write.

## Root Cause Evidence

Required when Task Profile is `bugfix`; leave as-is otherwise.

- root_cause: `tests/state/state-concurrency.test.ts:408-436,548-576` and `tests/state/effective-state-stability.test.ts:92-150` publish `startedPath` before writing `counterPath`, while their parents wait only for `startedPath` and then read `counterPath`, so a valid child preemption produces `ENOENT`.
- repro: `PATH="$PWD/.ai/harness/runs/20260724-0232-state-concurrency-counter-barrier/bin:$PATH" bun test tests/state/state-concurrency.test.ts -t "continuous capability-registry mutation|source mutation on every confirm-window"` deterministically delays the unfixed child immediately after ready publication.
- regression_guard: tests/state/state-concurrency.test.ts
- pre_fix_failure_artifact: .ai/harness/runs/20260724-0232-state-concurrency-counter-barrier/pre-fix.log

## Workflow Inventory

- Source plan: `plans/plan-20260724-0232-state-concurrency-counter-barrier.md`
- Deferred-goal ledger: `tasks/todos.md`
- Review file: `tasks/reviews/20260724-0232-state-concurrency-counter-barrier.review.md`
- Notes file: `tasks/notes/20260724-0232-state-concurrency-counter-barrier.notes.md`
- Checks file: `.ai/harness/checks/latest.json`
- Run snapshots: `.ai/harness/runs/`
- Scope gate: edit only paths listed under `allowed_paths`; update this contract before widening scope.
- Completion gate: run `verify-sprint --prepare-acceptance`, record one typed AcceptanceReceipt under the frozen policy below, then run `verify-sprint`; review Markdown is projection only.

## Acceptance Policy

```json
{"protocol":1,"reviewer":"Codex","user_waiver":"allowed"}
```

## Allowed Paths

```yaml
allowed_paths:
  - tasks/todos.md
  - plans/plan-20260724-0232-state-concurrency-counter-barrier.md
  - tasks/contracts/20260724-0232-state-concurrency-counter-barrier.contract.md
  - tasks/reviews/20260724-0232-state-concurrency-counter-barrier.review.md
  - tasks/notes/20260724-0232-state-concurrency-counter-barrier.notes.md
  - tests/state/state-concurrency.test.ts
  - tests/state/effective-state-stability.test.ts
  - .ai/harness/runs/20260724-0232-state-concurrency-counter-barrier/
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
      - codex-exec
      - main-thread
    fallback: main-thread
    brief_is_authoritative: true
```

## Exit Criteria (Machine Verifiable)

```yaml
exit_criteria:
  files_exist:
    - tests/state/state-concurrency.test.ts
    - tests/state/effective-state-stability.test.ts
  artifacts_exist:
    - tasks/notes/20260724-0232-state-concurrency-counter-barrier.notes.md
    - .ai/harness/runs/20260724-0232-state-concurrency-counter-barrier/pre-fix.log
  tests_pass:
    - path: tests/state/state-concurrency.test.ts
    - path: tests/state/effective-state-stability.test.ts
  commands_succeed:
    - bun run check:type
    - bash scripts/check-task-sync.sh
    - git diff --check
```

## Acceptance Notes (Human Review)

- Functional behavior: each ready barrier implies the counter consumed after it exists.
- Edge cases: slow or preempted child scheduling; all three sibling continuous mutators.
- Regression risks: moving readiness too late could weaken mutation overlap; repeated targeted execution must retain the intended resolver failure assertions.

## Rollback Point

- Commit / checkpoint: task branch base `a4c31ab1`.
- Revert strategy: revert the three ready-marker reorderings and restore the Todo row.
