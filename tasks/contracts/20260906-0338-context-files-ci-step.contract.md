# Task Contract: context-files-ci-step

> **Status**: Active
> **Plan**: plans/plan-20260906-0338-context-files-ci-step.md
> **Task Profile**: code-change
> <!-- legal values: code-change | docs-only | ledger-closeout | migration | eval-only | delegated-run | bugfix (omit for legacy passthrough); see docs/reference-configs/sprint-contracts.md -->
> **Owner**: ancienttwo
> **Capability ID**: root
> **Last Updated**: 2026-09-06 03:38
> **Review File**: `tasks/reviews/20260906-0338-context-files-ci-step.review.md`
> **Notes File**: `tasks/notes/20260906-0338-context-files-ci-step.notes.md`
> **Exemplar**: `docs/reference-configs/contract-brief-example.md`

## Why

The prompt-injection and secret scan over agent context files runs only when an operator remembers `check:context-files`. Nothing on the PR path executes it, so an injected instruction or secret in a context file merges silently.

## Goal

`scripts/check-ci.sh` runs `bash scripts/check-context-files.sh` as a named `[ci] context files` step in the workflow-checks block, after deploy-sql-order and before architecture-sync; the scan exits 0 on this branch.

## Scope

- In scope: the two-line step in `scripts/check-ci.sh`; `tests/bootstrap-files.test.ts` only if it asserts the step list.
- Out of scope: changing the scan, package.json, workflow YAML, or any other check.
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

- Source plan: `plans/plan-20260906-0338-context-files-ci-step.md`
- Deferred-goal ledger: `tasks/todos.md`
- Review file: `tasks/reviews/20260906-0338-context-files-ci-step.review.md`
- Notes file: `tasks/notes/20260906-0338-context-files-ci-step.notes.md`
- Checks file: `.ai/harness/checks/latest.json`
- Run snapshots: `.ai/harness/runs/`
- Scope gate: edit only paths listed under `allowed_paths`; update this contract before widening scope.
- Completion gate: run `verify-sprint --prepare-acceptance`, record one typed AcceptanceReceipt under the frozen policy below, then run `verify-sprint`; review Markdown is projection only.

## Change Assessment

```json
{"protocol":1,"oracles":[{"id":"ci-step-wiring","kind":"deterministic_test","paths":["scripts/check-ci.sh","tests/bootstrap-files.test.ts"]}]}
```

## Acceptance Policy

```json
{"protocol":2,"reviewer":"Codex","source":"codex-review","user_waiver":"allowed"}
```

## Allowed Paths

```yaml
allowed_paths:
  - plans/plan-20260906-0338-context-files-ci-step.md
  - tasks/contracts/20260906-0338-context-files-ci-step.contract.md
  - tasks/reviews/20260906-0338-context-files-ci-step.review.md
  - tasks/notes/20260906-0338-context-files-ci-step.notes.md
  - tasks/todos.md
  - scripts/check-ci.sh
  - tests/bootstrap-files.test.ts
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

Choose the smallest checks that cover the changed behavior. Add a full suite
only for an explicit release requirement or an observed cross-module coverage
gap; state that reason and expected cost in Acceptance Notes. Do not duplicate
coverage between `tests_pass` and `commands_succeed`. Before the first run,
list eligible deterministic criteria in `criterion_reuse`; eligibility requires
all inputs to be bound by the frozen subject/toolchain context. Leave external
or mutable-state criteria ineligible. The canonical acceptance runner owns the
expensive execution; workers and reviewers consume its evidence.

If a full suite already passed before a bounded follow-up edit, preserve its
run identity as baseline evidence and choose focused checks for the actual delta.
The parent revises these criteria and records the baseline plus coverage rationale
in Acceptance Notes, unless an explicit user/release requirement still requires
a full run on the new subject. A cache miss alone does not justify another full
suite; never label the old subject's pass as a full pass for the new subject.

```yaml
exit_criteria:
  files_exist:
    - scripts/check-ci.sh
  artifacts_exist:
    - .ai/harness/checks/latest.json
    - tasks/notes/20260906-0338-context-files-ci-step.notes.md
  tests_pass:
    - path: tests/bootstrap-files.test.ts
  commands_succeed:
    - bash -n scripts/check-ci.sh
    - bash scripts/check-context-files.sh
criterion_reuse:
  tests_pass:
    - path: tests/bootstrap-files.test.ts
  commands_succeed:
    - bash -n scripts/check-ci.sh
    - bash scripts/check-context-files.sh
```

## Acceptance Notes (Human Review)

- Functional behavior:
- Edge cases:
- Regression risks:

## Rollback Point

- Commit / checkpoint:
- Revert strategy:
