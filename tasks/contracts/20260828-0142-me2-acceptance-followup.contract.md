# Task Contract: me2-acceptance-followup

> **Status**: Active
> **Plan**: plans/plan-20260828-0142-me2-acceptance-followup.md
> **Task Profile**: code-change
> <!-- legal values: code-change | docs-only | ledger-closeout | migration | eval-only | delegated-run | bugfix (omit for legacy passthrough); see docs/reference-configs/sprint-contracts.md -->
> **Owner**: ancienttwo
> **Capability ID**: root
> **Last Updated**: 2026-08-28 01:42
> **Review File**: `tasks/reviews/20260828-0142-me2-acceptance-followup.review.md`
> **Notes File**: `tasks/notes/20260828-0142-me2-acceptance-followup.notes.md`
> **Exemplar**: `docs/reference-configs/contract-brief-example.md`

## Why

ME-2A acceptance found three MEDIUM gaps: admission evidence is extrapolated from a different Codex subcommand than dispatch actually runs, child processes inherit the full parent environment with no receipt binding (a hard prerequisite gap for any future writable delegation), and the PRD-promised typed rejection is a dead enum that leaks host-absolute paths. ME-2C acceptance surfaced two low-cost validation gaps (duplicate catalog silently takes the first, check/verifier receipts may be the same artifact).

## Goal

Bind the delegated-run environment into the evidence chain, cover or explicitly record the dispatch-surface proof gap, deliver typed rejections with path hygiene and dead-enum cleanup, and land the two verified-context hardening checks — each with regression tests.

## Scope

- In scope:
  - `src/effects/engineers/delegated-run-store.ts`: `inheritEnv: false` + minimal env allowlist for canary and dispatch; env-set digest recorded in process and capability receipts; dispatch-surface denial probe (or explicit Known Unknowns + receipt record if infeasible); `trackedRegularFile` ENOENT -> `delegated_run_profile_unavailable`; admission `role_profile_unavailable`; repo-relative error paths; dead-enum cleanup.
  - `src/core/engineers/delegation.ts`: rejection enum adjustments to match real producers.
  - `src/effects/engineers/verified-context-store.ts`: exactly-one catalog assertion.
  - `src/core/engineers/verified-context.ts`: check/verifier receipt distinctness.
  - Regression tests in `tests/unit/me2a-me3b-readonly-delegation.test.ts`, `tests/cli/delegation.test.ts`, `tests/unit/me2c-verified-evidence-context.test.ts`.
  - `plans/prds/20260825-1551-delegated-run-adapter.prd.md` Known Unknowns entry only if the probe route is infeasible.
- Out of scope:
  - any writable delegation surface, ME-2B canary changes, `role_unavailable` naming beyond what the delegation schema already declares, PRD rewrites beyond the Known Unknowns entry if the probe route is infeasible.
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

- Source plan: `plans/plan-20260828-0142-me2-acceptance-followup.md`
- Deferred-goal ledger: `tasks/todos.md`
- Review file: `tasks/reviews/20260828-0142-me2-acceptance-followup.review.md`
- Notes file: `tasks/notes/20260828-0142-me2-acceptance-followup.notes.md`
- Checks file: `.ai/harness/checks/latest.json`
- Run snapshots: `.ai/harness/runs/`
- Scope gate: edit only paths listed under `allowed_paths`; update this contract before widening scope.
- Completion gate: run `verify-sprint --prepare-acceptance`, record one typed AcceptanceReceipt under the frozen policy below, then run `verify-sprint`; review Markdown is projection only.

## Change Assessment

```json
{"protocol":1,"oracles":[{"id":"me2a-delegation-suite","kind":"deterministic_test","paths":["src/effects/engineers/delegated-run-store.ts","src/core/engineers/delegation.ts","tests/unit/me2a-me3b-readonly-delegation.test.ts","tests/cli/delegation.test.ts"]},{"id":"me2c-verified-context-suite","kind":"deterministic_test","paths":["src/effects/engineers/verified-context-store.ts","src/core/engineers/verified-context.ts","tests/unit/me2c-verified-evidence-context.test.ts","tests/cli/verified-context.test.ts"]},{"id":"typecheck","kind":"deterministic_test","paths":["*"]},{"id":"task-sync","kind":"deterministic_test","paths":["*"]}]}
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
  - tasks/contracts/20260828-0142-me2-acceptance-followup.contract.md
  - tasks/reviews/20260828-0142-me2-acceptance-followup.review.md
  - tasks/notes/20260828-0142-me2-acceptance-followup.notes.md
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

```yaml
exit_criteria:
  files_exist:
    - docs/spec.md
  artifacts_exist:
    - .ai/harness/checks/latest.json
    - tasks/notes/20260828-0142-me2-acceptance-followup.notes.md
  tests_pass:
    - path: tests/unit/me2a-me3b-readonly-delegation.test.ts
    - path: tests/cli/delegation.test.ts
    - path: tests/unit/me2c-verified-evidence-context.test.ts
    - path: tests/cli/verified-context.test.ts
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
