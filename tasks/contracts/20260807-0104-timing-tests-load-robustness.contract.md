# Task Contract: timing-tests-load-robustness

> **Status**: Active
> **Plan**: plans/plan-20260807-0104-timing-tests-load-robustness.md
> **Task Profile**: code-change
> <!-- legal values: code-change | docs-only | ledger-closeout | migration | eval-only | delegated-run | bugfix (omit for legacy passthrough); see docs/reference-configs/sprint-contracts.md -->
> **Owner**: ancienttwo
> **Capability ID**: root
> **Last Updated**: 2026-08-07 01:04
> **Review File**: `tasks/reviews/20260807-0104-timing-tests-load-robustness.review.md`
> **Notes File**: `tasks/notes/20260807-0104-timing-tests-load-robustness.notes.md`
> **Exemplar**: `docs/reference-configs/contract-brief-example.md`

## Why

Five timing-sensitive tests fail under concurrent load and have blocked four consecutive bundle verification rounds (retained log run-20260807T004613-2770-bun-test.log names them; in-round bun test runs 14-42% slower than standalone). Skipped: any loaded machine periodically trips every future contract's full-suite criterion on these five. Shipped wrong (assertions gutted): the tests stop guarding their invariants — hang detection, bounded-error return, and lock-drain ordering.

## Goal

The five named tests pass repeatedly under load while still guarding their invariants: three subprocess tests in tests/continuation-attempt.test.ts carry explicit generous timeouts (hang detection preserved); the bounded-error threshold in tests/unit/closeout-runner-guardrails.test.ts widens only enough to distinguish bounded-return from hang; the Bun.sleep(100) race is replaced by synchronization on the observable state it asserts. No production code changes.

## Scope

- In scope: the five named tests in tests/continuation-attempt.test.ts and tests/unit/closeout-runner-guardrails.test.ts.
- Out of scope: production code, other tests, bun global config, per-suite timeout defaults.
- Taste constraints: <!-- advisory only, no run gate; default style/taste lives in AGENTS.md and the minimal-change policy, use this to record a per-task override -->

## Stop Conditions

- Stop and hand back to the parent if the change would require editing a path outside Allowed Paths.
- Stop if an Exit Criteria command cannot be run in this environment.
- Stop if Goal, Scope, or Exit Criteria are internally contradictory.

## Falsifier

If any of the five tests fails for a reason other than the timing assumption (e.g. the bounded-error guarantee genuinely exceeds its bound in product code), widening is the wrong move — that is a product defect and the slice must stop and report it. Cheapest proof: read each failure's retained output before touching the assertion; live proof: the next bundle verification round under load passes its full suite.

## Root Cause Evidence

Required when Task Profile is `bugfix`; leave as-is otherwise.

- root_cause: one sentence naming file:line/condition (testable, not "a state issue").
- repro: the command or UI path that reproduces the symptom.
- regression_guard: path to a test that fails on the unfixed code and passes after the fix (must also appear under exit_criteria.tests_pass).
- pre_fix_failure_artifact: path to a captured run of regression_guard on the UNFIXED code. Capture with `bun test <regression_guard> > <artifact> 2>&1; echo "PRE_FIX_EXIT=$?" >> <artifact>` (no pipes — pipes swallow the exit status). The gate requires a non-zero `PRE_FIX_EXIT=` line plus the regression_guard path string in the artifact (see the Root Cause Evidence Gate section in docs/reference-configs/sprint-contracts.md).

## Workflow Inventory

- Source plan: `plans/plan-20260807-0104-timing-tests-load-robustness.md`
- Deferred-goal ledger: `tasks/todos.md`
- Review file: `tasks/reviews/20260807-0104-timing-tests-load-robustness.review.md`
- Notes file: `tasks/notes/20260807-0104-timing-tests-load-robustness.notes.md`
- Checks file: `.ai/harness/checks/latest.json`
- Run snapshots: `.ai/harness/runs/`
- Scope gate: edit only paths listed under `allowed_paths`; update this contract before widening scope.
- Completion gate: run `verify-sprint --prepare-acceptance`, record one typed AcceptanceReceipt under the frozen policy below, then run `verify-sprint`; review Markdown is projection only.

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
  - tasks/contracts/20260807-0104-timing-tests-load-robustness.contract.md
  - tasks/reviews/20260807-0104-timing-tests-load-robustness.review.md
  - tasks/notes/20260807-0104-timing-tests-load-robustness.notes.md
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
      - codex-exec
      - main-thread
    fallback: main-thread
    brief_is_authoritative: true
```

## Exit Criteria (Machine Verifiable)

```yaml
exit_criteria:
  files_exist:
    - docs/spec.md
  artifacts_exist:
    - .ai/harness/checks/latest.json
    - tasks/notes/20260807-0104-timing-tests-load-robustness.notes.md
  tests_pass:
    - path: tests/continuation-attempt.test.ts
    - path: tests/unit/closeout-runner-guardrails.test.ts
  commands_succeed:
    - bun run check:type
    - bash scripts/check-task-sync.sh
```

## Acceptance Notes (Human Review)

- Functional behavior:
- Edge cases:
- Regression risks:

## Rollback Point

- Commit / checkpoint: worktree branch `codex/timing-tests-load-robustness` off `c94a5d41`
- Revert strategy: revert the single commit; the five tests return to their load-sensitive form.
