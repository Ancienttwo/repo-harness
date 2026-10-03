# Task Contract: oracle-flag-probe

> **Status**: Active
> **Plan**: plans/plan-20260909-0305-oracle-flag-probe.md
> **Task Profile**: code-change
> <!-- legal values: code-change | docs-only | ledger-closeout | migration | eval-only | delegated-run | bugfix (omit for legacy passthrough); see docs/reference-configs/sprint-contracts.md -->
> **Owner**: ancienttwo
> **Capability ID**: root
> **Last Updated**: 2026-09-09 03:05
> **Review File**: `tasks/reviews/20260909-0305-oracle-flag-probe.review.md`
> **Notes File**: `tasks/notes/20260909-0305-oracle-flag-probe.notes.md`
> **Exemplar**: `docs/reference-configs/contract-brief-example.md`

## Why

`browser-doctor` reported `ready` for an upstream `@steipete/oracle@0.20.0` binary that rejects the session-descriptor and evidence flags every browser consult sends. A green doctor followed by an argument-parse failure mid-consult wastes a real GPT Pro run and hides the actual cause.

## Goal

`browser-doctor` fails closed (`action_required` / `ORACLE_INCOMPATIBLE`) when the resolved oracle does not accept the flags the real consult path passes, and `runOracleProvider` refuses before spawning with `ORACLE_RUNTIME_FLAGS_UNSUPPORTED` instead of surfacing `ORACLE_EXIT_NONZERO`.

## Scope

- In scope: the Oracle capability probe, doctor capability reporting and recovery text, the pre-spawn consult guard, and the oracle test fixture.
- Out of scope: Oracle version pinning, the native provider, and any change to what `buildOracleCommand` emits.
- Taste constraints: <!-- advisory only, no run gate; default style/taste lives in AGENTS.md and the minimal-change policy, use this to record a per-task override -->

## Stop Conditions

- Stop and hand back to the parent if the change would require editing a path outside Allowed Paths.
- Stop if an Exit Criteria command cannot be run in this environment.
- Stop if Goal, Scope, or Exit Criteria are internally contradictory.

## Falsifier

What observable evidence would prove this task's direction wrong, and the cheapest proof point to check first. Leave as-is if not applicable.

## Root Cause Evidence

Required when Task Profile is `bugfix`; leave as-is otherwise.

- root_cause: one sentence naming file:line/condition (testable, not "a state issue").
- repro: the command or UI path that reproduces the symptom.
- regression_guard: path to a test that fails on the unfixed code and passes after the fix (must also appear as a `package_test` check in Verification Plan).
- pre_fix_failure_artifact: path to a captured run of regression_guard on the UNFIXED code. Capture with `bun test <regression_guard> > <artifact> 2>&1; echo "PRE_FIX_EXIT=$?" >> <artifact>` (no pipes — pipes swallow the exit status). The gate requires a non-zero `PRE_FIX_EXIT=` line plus the regression_guard path string in the artifact (see the Root Cause Evidence Gate section in docs/reference-configs/sprint-contracts.md).

## Workflow Inventory

- Source plan: `plans/plan-20260909-0305-oracle-flag-probe.md`
- Deferred-goal ledger: `tasks/todos.md`
- Review file: `tasks/reviews/20260909-0305-oracle-flag-probe.review.md`
- Notes file: `tasks/notes/20260909-0305-oracle-flag-probe.notes.md`
- Checks file: `.ai/harness/checks/latest.json`
- Run snapshots: `.ai/harness/runs/`
- Scope gate: edit only paths listed under `allowed_paths`; update this contract before widening scope.
- Completion gate: run `verify-sprint --prepare-acceptance`, record one typed AcceptanceReceipt under the frozen policy below, then run `verify-sprint`; review Markdown is projection only.

## Change Assessment

```json
{"protocol":1,"oracles":[]}
```

## Acceptance Policy

```json
{"protocol":2,"reviewer":"Codex","source":"codex-plugin","user_waiver":"allowed"}
```

## Allowed Paths

```yaml
allowed_paths:
  - docs/spec.md
  - plans/
  - tasks/todos.md
  - tasks/contracts/20260909-0305-oracle-flag-probe.contract.md
  - tasks/reviews/20260909-0305-oracle-flag-probe.review.md
  - tasks/notes/20260909-0305-oracle-flag-probe.notes.md
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

This block contains only non-executable artifact requirements. Define every
executable check once in the canonical Verification Plan below. Each check must
state its phase, cost, evidence policy, necessity, and input environment; a
missing or malformed plan fails closed.

```yaml
exit_criteria:
  files_exist:
    - docs/spec.md
  artifacts_exist:
    - .ai/harness/checks/latest.json
    - tasks/notes/20260909-0305-oracle-flag-probe.notes.md
```

## Verification Plan

```json
{
  "protocol": 1,
  "checks": [
    {
      "id": "focused-regression",
      "kind": "package_test",
      "path": "tests/cli/chatgpt-browser.test.ts",
      "cwd": ".",
      "phase": "verification",
      "cost": "normal",
      "evidence_policy": "current_exact",
      "necessity": "Covers the changed behavior named by this contract.",
      "inputs": { "env": [] }
    },
    {
      "id": "typecheck",
      "kind": "command",
      "command": "bun run check:type",
      "cwd": ".",
      "phase": "preflight",
      "cost": "normal",
      "evidence_policy": "current_exact",
      "necessity": "Checks TypeScript contracts before behavioral verification.",
      "inputs": { "env": [] }
    }
  ]
}
```

This is the sole executable verification authority. Use `baseline_with_delta`
only when a referenced immutable baseline plus named current delta checks prove
the intended coverage; do not infer that choice from paths or command text.

## Acceptance Notes (Human Review)

- Functional behavior:
- Edge cases:
- Regression risks:

## Rollback Point

- Commit / checkpoint:
- Revert strategy:
