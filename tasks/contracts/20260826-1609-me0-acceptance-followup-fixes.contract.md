# Task Contract: me0-acceptance-followup-fixes

> **Status**: Active
> **Plan**: plans/plan-20260826-1609-me0-acceptance-followup-fixes.md
> **Task Profile**: code-change
> <!-- legal values: code-change | docs-only | ledger-closeout | migration | eval-only | delegated-run | bugfix (omit for legacy passthrough); see docs/reference-configs/sprint-contracts.md -->
> **Owner**: ancienttwo
> **Capability ID**: root
> **Last Updated**: 2026-08-26 16:09
> **Review File**: `tasks/reviews/20260826-1609-me0-acceptance-followup-fixes.review.md`
> **Notes File**: `tasks/notes/20260826-1609-me0-acceptance-followup-fixes.notes.md`
> **Exemplar**: `docs/reference-configs/contract-brief-example.md`

## Why

Gatekeeper acceptance of ME-0A/ME-0B passed with non-blocking findings; the engineer CLI currently reports argument/internal failures under the protocol code `engineer_binding_invalid`, so machine consumers branch incorrectly, and the archived ME-0A review header contradicts its own acceptance receipt.

## Goal

Land the three approved acceptance follow-up fixes with a regression test: layered engineer CLI error codes (`invalid_argument` / `internal_error` for non-domain failures), resynced ME-0A archived review header, and canonical-bytes comparison in the binding-store retire-resume path.

## Scope

- In scope:
  - `src/cli/commands/engineer.ts` error-code layering via a local `CliArgumentError` marker type.
  - One regression test in `tests/cli/engineer.test.ts` asserting invalid `--expected-binding-generation` reports `invalid_argument`.
  - Header resync (Status / Recommendation / Reviewed Subject SHA256) in `tasks/archive/review-20260824-2341-me0a-engineer-profile-binding.md`.
  - `src/effects/engineers/binding-store.ts` retire-resume comparison switched to `canonicalEngineerBindingBytes`.
- Out of scope:
  - the five swept sibling fallback-code sites, `guards.edit_plan_gate` policy, exitCode unification, capture-plan template dedup.
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

- Source plan: `plans/plan-20260826-1609-me0-acceptance-followup-fixes.md`
- Deferred-goal ledger: `tasks/todos.md`
- Review file: `tasks/reviews/20260826-1609-me0-acceptance-followup-fixes.review.md`
- Notes file: `tasks/notes/20260826-1609-me0-acceptance-followup-fixes.notes.md`
- Checks file: `.ai/harness/checks/latest.json`
- Run snapshots: `.ai/harness/runs/`
- Scope gate: edit only paths listed under `allowed_paths`; update this contract before widening scope.
- Completion gate: run `verify-sprint --prepare-acceptance`, record one typed AcceptanceReceipt under the frozen policy below, then run `verify-sprint`; review Markdown is projection only.

## Change Assessment

```json
{"protocol":1,"oracles":["bun test tests/cli/engineer.test.ts tests/unit/engineer-binding-store.test.ts tests/unit/engineer-profile-binding-v1.test.ts --timeout 60000","bun run check:type","bash scripts/check-task-sync.sh"]}
```

## Acceptance Policy

```json
{"protocol":2,"reviewer":"Codex","source":"codex-review","user_waiver":"allowed"}
```

## Allowed Paths

```yaml
allowed_paths:
  - docs/spec.md
  - plans/
  - tasks/todos.md
  - tasks/contracts/20260826-1609-me0-acceptance-followup-fixes.contract.md
  - tasks/reviews/20260826-1609-me0-acceptance-followup-fixes.review.md
  - tasks/notes/20260826-1609-me0-acceptance-followup-fixes.notes.md
  - .ai/context/capabilities.json
  - .claude/templates/
  - src/
  - tests/
  - tasks/archive/review-20260824-2341-me0a-engineer-profile-binding.md
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

```yaml
exit_criteria:
  files_exist:
    - docs/spec.md
  artifacts_exist:
    - .ai/harness/checks/latest.json
    - tasks/notes/20260826-1609-me0-acceptance-followup-fixes.notes.md
  tests_pass:
    - path: tests/cli/engineer.test.ts
    - path: tests/unit/engineer-binding-store.test.ts
    - path: tests/unit/engineer-profile-binding-v1.test.ts
  commands_succeed:
    - bun run check:type
    - bash scripts/check-task-sync.sh
# Optional exact-subject reuse is fail-closed and opt-in. List only deterministic
# criteria whose inputs are fully bound by the frozen subject/toolchain context.
# criterion_reuse:
#   tests_pass:
#     - path/to/deterministic.test.ts
#   commands_succeed:
#     - bun test --timeout 60000
```

## Acceptance Notes (Human Review)

- Functional behavior:
- Edge cases:
- Regression risks:

## Rollback Point

- Commit / checkpoint:
- Revert strategy:
