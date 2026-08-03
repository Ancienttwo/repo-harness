# Task Contract: prepublish-fast-gate

> **Status**: Active
> **Plan**: plans/plan-20260804-0130-prepublish-fast-gate.md
> **Task Profile**: code-change
> <!-- legal values: code-change | docs-only | ledger-closeout | migration | eval-only | delegated-run | bugfix (omit for legacy passthrough); see docs/reference-configs/sprint-contracts.md -->
> **Owner**: kito
> **Capability ID**: root
> **Last Updated**: 2026-08-04 01:30
> **Review File**: `tasks/reviews/20260804-0130-prepublish-fast-gate.review.md`
> **Notes File**: `tasks/notes/20260804-0130-prepublish-fast-gate.notes.md`
> **Exemplar**: `docs/reference-configs/contract-brief-example.md`

## Why

The 0.13.0 release measured the same full test suite running four times (CI, check:release, and once per publish attempt via prepublishOnly), ~11 minutes per pass; publish latency was dominated by redundant re-verification. The publish-time invariant that must stay fail-closed in seconds is version/package sanity; the heavy suite already has two mandatory owners (CI + explicit `check:release` on the exact release commit).

## Goal

`scripts/check-npm-release.sh` gains a `--prepublish` mode running only the fast checks (check:hooks, check:helpers, npm availability proof) and exiting before `scripts/check-ci.sh`, with the default no-arg path byte-equivalent to today; `package.json` `prepublishOnly` becomes `bash scripts/check-npm-release.sh --prepublish`. Mode guard must use `"${1:-}"` (script runs under `set -u` with no args from npm).

## Scope

- In scope: `scripts/check-npm-release.sh` (mode block + early exit), `package.json` (prepublishOnly line), the contract's notes file.
- Out of scope: `scripts/check-ci.sh`; any change to the default full-gate path's behavior; release checklists; version bumps.
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
- regression_guard: path to a test that fails on the unfixed code and passes after the fix (must also appear under exit_criteria.tests_pass).
- pre_fix_failure_artifact: path to a captured run of regression_guard on the UNFIXED code. Capture with `bun test <regression_guard> > <artifact> 2>&1; echo "PRE_FIX_EXIT=$?" >> <artifact>` (no pipes — pipes swallow the exit status). The gate requires a non-zero `PRE_FIX_EXIT=` line plus the regression_guard path string in the artifact (see the Root Cause Evidence Gate section in docs/reference-configs/sprint-contracts.md).

## Workflow Inventory

- Source plan: `plans/plan-20260804-0130-prepublish-fast-gate.md`
- Deferred-goal ledger: `tasks/todos.md`
- Review file: `tasks/reviews/20260804-0130-prepublish-fast-gate.review.md`
- Notes file: `tasks/notes/20260804-0130-prepublish-fast-gate.notes.md`
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
  - scripts/check-npm-release.sh
  - package.json
  - plans/
  - tasks/todos.md
  - tasks/contracts/20260804-0130-prepublish-fast-gate.contract.md
  - tasks/reviews/20260804-0130-prepublish-fast-gate.review.md
  - tasks/notes/20260804-0130-prepublish-fast-gate.notes.md
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
    - scripts/check-npm-release.sh
  artifacts_exist:
    - .ai/harness/checks/latest.json
    - tasks/notes/20260804-0130-prepublish-fast-gate.notes.md
  tests_pass: []
  commands_succeed:
    - bash -n scripts/check-npm-release.sh
    - bun run check:hooks
    - bun run check:helpers
```

## Acceptance Notes (Human Review)

- Functional behavior:
- Edge cases:
- Regression risks:

## Rollback Point

- Commit / checkpoint:
- Revert strategy:
