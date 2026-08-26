# Task Contract: hrd09-fixture-home-isolation

> **Status**: Active
> **Plan**: plans/plan-20260827-0229-hrd09-fixture-home-isolation.md
> **Task Profile**: code-change
> **Owner**: ancienttwo
> **Capability ID**: root
> **Last Updated**: 2026-08-27 02:29
> **Review File**: `tasks/reviews/20260827-0229-hrd09-fixture-home-isolation.review.md`
> **Notes File**: `tasks/notes/20260827-0229-hrd09-fixture-home-isolation.notes.md`
> **Exemplar**: `docs/reference-configs/contract-brief-example.md`

## Why

The HRD-09 test sets the fixture HOME to the repo under test, so bun transpile cache files enter the git-status-based architecture changed set and the Stop route spawns one CLI subprocess per path (170-205s against a 120s budget). The resulting coin-flip timeout blocks the ME-1C closeout gate and earlier produced a false regression attribution to the ME-2B merge.

## Goal

Point the HRD-09 fixture HOME at a temp directory outside the repo under test (with teardown cleanup) so the test passes deterministically well under its budget, and record the deferred Stop-cascade scalability ledger row.

## Scope

- In scope:
  - `tests/unit/hrd-09-legacy-retirement-and-adopted-migration.test.ts`: fixture HOME via `mkdtempSync` outside the repo under test, cleaned up on teardown.
  - `tasks/todos.md`: one deferred row for the per-path Stop cascade O(n) subprocess spawn and the `child_processes` telemetry gap.
- Out of scope:
  - Any `src/` product-code change, the cascade redesign itself, ME-1C contract content, any push.
- Taste constraints:

## Stop Conditions

- Stop and hand back to the parent if the change would require editing a path outside Allowed Paths.
- Stop if an Exit Criteria command cannot be run in this environment.
- Stop if Goal, Scope, or Exit Criteria are internally contradictory.

## Falsifier

If the HRD-09 test still exceeds its 120s budget with HOME outside the repo under test, the cache-pollution root cause is wrong; the cheapest proof point is one timed run of the single test file after the change.

## Root Cause Evidence

Required when Task Profile is `bugfix`; leave as-is otherwise.

## Workflow Inventory

- Source plan: `plans/plan-20260827-0229-hrd09-fixture-home-isolation.md`
- Deferred-goal ledger: `tasks/todos.md`
- Review file: `tasks/reviews/20260827-0229-hrd09-fixture-home-isolation.review.md`
- Notes file: `tasks/notes/20260827-0229-hrd09-fixture-home-isolation.notes.md`
- Checks file: `.ai/harness/checks/latest.json`
- Run snapshots: `.ai/harness/runs/`
- Scope gate: edit only paths listed under `allowed_paths`; update this contract before widening scope.
- Completion gate: run `verify-sprint --prepare-acceptance`, record one typed AcceptanceReceipt under the frozen policy below, then run `verify-sprint`; review Markdown is projection only.

## Change Assessment

```json
{"protocol":1,"oracles":[{"id":"hrd09-single-file","kind":"deterministic_test","paths":["tests/unit/hrd-09-legacy-retirement-and-adopted-migration.test.ts"]},{"id":"typecheck","kind":"deterministic_test","paths":["*"]}]}
```

## Acceptance Policy

```json
{"protocol":1,"reviewer":"Claude","user_waiver":"allowed"}
```

## Allowed Paths

```yaml
allowed_paths:
  - plans/
  - tasks/todos.md
  - tasks/contracts/20260827-0229-hrd09-fixture-home-isolation.contract.md
  - tasks/reviews/20260827-0229-hrd09-fixture-home-isolation.review.md
  - tasks/notes/20260827-0229-hrd09-fixture-home-isolation.notes.md
  - tests/unit/hrd-09-legacy-retirement-and-adopted-migration.test.ts
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
    - tasks/notes/20260827-0229-hrd09-fixture-home-isolation.notes.md
  tests_pass:
    - path: tests/unit/hrd-09-legacy-retirement-and-adopted-migration.test.ts
  commands_succeed:
    - bun run check:type
```

## Acceptance Notes (Human Review)

- Functional behavior:
- Edge cases:
- Regression risks:

## Rollback Point

- Commit / checkpoint:
- Revert strategy: revert the single test-hygiene commit
