> **Archived**: 2026-08-07 00:45
> **Related Plan**: plans/archive/plan-20260807-0014-verifier-failure-log-retention.md
> **Outcome**: Completed
> **Lifecycle**: contract
> **Parent Run ID**: run-20260807-0045

# Task Contract: verifier-failure-log-retention

> **Status**: Fulfilled
> **Plan**: plans/plan-20260807-0014-verifier-failure-log-retention.md
> **Task Profile**: code-change
> <!-- legal values: code-change | docs-only | ledger-closeout | migration | eval-only | delegated-run | bugfix (omit for legacy passthrough); see docs/reference-configs/sprint-contracts.md -->
> **Owner**: ancienttwo
> **Capability ID**: root
> **Last Updated**: 2026-08-07 00:14
> **Review File**: `tasks/reviews/20260807-0014-verifier-failure-log-retention.review.md`
> **Notes File**: `tasks/notes/20260807-0014-verifier-failure-log-retention.notes.md`
> **Exemplar**: `docs/reference-configs/contract-brief-example.md`

## Why

`verify-contract.sh` runs every criterion through the bounded runner with `--log` under `mktemp -d`, and `trap rm -rf EXIT` (:632-633) destroys it when the round ends; snapshots keep only `exit_code`. Two in-round `bun test` exit=1 failures on the bundle shipment (2026-08-06/07) consumed ~25 min and produced zero attribution — the failing test cannot be named, so every flake costs a full re-round and teaches nothing. Shipped wrong (retention on success too): runs/ bloats with multi-MB logs of green rounds.

## Goal

When a bounded tests_pass/commands_succeed run exits nonzero, its runner log survives the round at `.ai/harness/runs/<run-snapshot-stem>-<criterion-slug>.log`; successful criteria retain nothing; `run-bounded-verifier-command.ts` untouched; both `verify-contract.sh` copies byte-identical.

## Scope

- In scope: the failure-path log copy in `scripts/verify-contract.sh` (tests_pass at :940 and commands_succeed at :977 result handling); the identical mirror in `assets/templates/helpers/verify-contract.sh`; regression test `tests/unit/verifier-failure-log-retention.test.ts`.
- Out of scope: `run-bounded-verifier-command.ts`, judgment/gating logic, retention for passing criteria, log rotation/GC, snapshot schema changes.
- Taste constraints: <!-- advisory only, no run gate; default style/taste lives in AGENTS.md and the minimal-change policy, use this to record a per-task override -->

## Stop Conditions

- Stop and hand back to the parent if the change would require editing a path outside Allowed Paths.
- Stop if an Exit Criteria command cannot be run in this environment.
- Stop if Goal, Scope, or Exit Criteria are internally contradictory.

## Falsifier

If a failing in-round criterion still leaves no log under `.ai/harness/runs/` after this merges, the retention hook is on the wrong path (e.g. the failure exits before the copy). Cheapest proof: the regression test's failing-fixture case; live proof: the next bundle verification round that fails names its failing test from the retained log.

## Root Cause Evidence

Required when Task Profile is `bugfix`; leave as-is otherwise.

- root_cause: one sentence naming file:line/condition (testable, not "a state issue").
- repro: the command or UI path that reproduces the symptom.
- regression_guard: path to a test that fails on the unfixed code and passes after the fix (must also appear under exit_criteria.tests_pass).
- pre_fix_failure_artifact: path to a captured run of regression_guard on the UNFIXED code. Capture with `bun test <regression_guard> > <artifact> 2>&1; echo "PRE_FIX_EXIT=$?" >> <artifact>` (no pipes — pipes swallow the exit status). The gate requires a non-zero `PRE_FIX_EXIT=` line plus the regression_guard path string in the artifact (see the Root Cause Evidence Gate section in docs/reference-configs/sprint-contracts.md).

## Workflow Inventory

- Source plan: `plans/plan-20260807-0014-verifier-failure-log-retention.md`
- Deferred-goal ledger: `tasks/todos.md`
- Review file: `tasks/reviews/20260807-0014-verifier-failure-log-retention.review.md`
- Notes file: `tasks/notes/20260807-0014-verifier-failure-log-retention.notes.md`
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
  - tasks/contracts/20260807-0014-verifier-failure-log-retention.contract.md
  - tasks/reviews/20260807-0014-verifier-failure-log-retention.review.md
  - tasks/notes/20260807-0014-verifier-failure-log-retention.notes.md
  - .ai/context/capabilities.json
  - .claude/templates/
  - src/
  - tests/
  - scripts/verify-contract.sh
  - assets/templates/helpers/verify-contract.sh
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
    - tasks/notes/20260807-0014-verifier-failure-log-retention.notes.md
  tests_pass:
    - path: tests/unit/verifier-failure-log-retention.test.ts
    - path: tests/unit/helper-projection-drift.test.ts
  commands_succeed:
    - bun run check:type
    - cmp scripts/verify-contract.sh assets/templates/helpers/verify-contract.sh
    - bash scripts/check-task-sync.sh
```

## Acceptance Notes (Human Review)

- Functional behavior:
- Edge cases:
- Regression risks:

## Rollback Point

- Commit / checkpoint: worktree branch `codex/verifier-failure-log-retention` off `dbf0a397`
- Revert strategy: revert the single commit; failure logs stop being retained, nothing else changes.
