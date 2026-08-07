# Task Contract: test-timeout-sibling-sweep

> **Status**: Active
> **Plan**: plans/plan-20260807-1930-test-timeout-sibling-sweep.md
> **Task Profile**: code-change
> <!-- legal values: code-change | docs-only | ledger-closeout | migration | eval-only | delegated-run | bugfix (omit for legacy passthrough); see docs/reference-configs/sprint-contracts.md -->
> **Owner**: ancienttwo
> **Capability ID**: root
> **Last Updated**: 2026-08-07 19:30
> **Review File**: `tasks/reviews/20260807-1930-test-timeout-sibling-sweep.review.md`
> **Notes File**: `tasks/notes/20260807-1930-test-timeout-sibling-sweep.notes.md`
> **Exemplar**: `docs/reference-configs/contract-brief-example.md`

## Why

The a2381159 convention (subprocess-spawning tests carry explicit generous timeouts) was applied to five instances, not the class. Threshold-marginal siblings keep tripping verify-sprint's contended `bun test` — three consecutive blocked acceptance runs on mcp-scope-retirement, each a different test, each passing standalone. Every future contract on this repo blocks on this until the class is closed.

## Goal

Every test in `tests/` that spawns CLI subprocesses (directly via spawnSync/spawn or through fixture helpers) declares an explicit positional timeout in the a2381159 shape (`30_000`; `45_000` for factor-factory lifecycle whose existing 15000 was observed insufficient at 29.3s). Assertion-only tests keep the default. Full `bun test` green. Minimum confirmed set covered: remaining continuation-attempt no-progress-breaker siblings, session-context-packet-panel fixture builder, factor-factory lifecycle.

## Scope

- In scope: timeout declarations in `tests/**` files only.
- Out of scope: production code, test-logic changes, timeout removals, verify-sprint/harness runner changes.
- Taste constraints: <!-- advisory only, no run gate; default style/taste lives in AGENTS.md and the minimal-change policy, use this to record a per-task override -->

## Stop Conditions

- Stop and hand back to the parent if the change would require editing a path outside Allowed Paths.
- Stop if an Exit Criteria command cannot be run in this environment.
- Stop if Goal, Scope, or Exit Criteria are internally contradictory.

## Falsifier

If a swept test still times out under normal load (~<4) with its explicit 30s bound, the problem is a hang, not load sensitivity — the timeout sweep direction is wrong for that test and it needs investigation instead. Cheapest proof point: each previously failing test passes standalone 3/3 before the sweep.

## Root Cause Evidence

Required when Task Profile is `bugfix`; leave as-is otherwise.

- root_cause: one sentence naming file:line/condition (testable, not "a state issue").
- repro: the command or UI path that reproduces the symptom.
- regression_guard: path to a test that fails on the unfixed code and passes after the fix (must also appear under exit_criteria.tests_pass).
- pre_fix_failure_artifact: path to a captured run of regression_guard on the UNFIXED code. Capture with `bun test <regression_guard> > <artifact> 2>&1; echo "PRE_FIX_EXIT=$?" >> <artifact>` (no pipes — pipes swallow the exit status). The gate requires a non-zero `PRE_FIX_EXIT=` line plus the regression_guard path string in the artifact (see the Root Cause Evidence Gate section in docs/reference-configs/sprint-contracts.md).

## Workflow Inventory

- Source plan: `plans/plan-20260807-1930-test-timeout-sibling-sweep.md`
- Deferred-goal ledger: `tasks/todos.md`
- Review file: `tasks/reviews/20260807-1930-test-timeout-sibling-sweep.review.md`
- Notes file: `tasks/notes/20260807-1930-test-timeout-sibling-sweep.notes.md`
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
  - tasks/contracts/20260807-1930-test-timeout-sibling-sweep.contract.md
  - tasks/reviews/20260807-1930-test-timeout-sibling-sweep.review.md
  - tasks/notes/20260807-1930-test-timeout-sibling-sweep.notes.md
  - .ai/context/capabilities.json
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
    - tasks/notes/20260807-1930-test-timeout-sibling-sweep.notes.md
  tests_pass:
    - path: tests/continuation-attempt.test.ts
  commands_succeed:
    - bun run check:type
    - bun test
```

## Acceptance Notes (Human Review)

- Functional behavior:
- Edge cases:
- Regression risks:

## Rollback Point

- Commit / checkpoint:
- Revert strategy:
