# Task Contract: ci-test-gate-aggregate-failures

> **Status**: Fulfilled
> **Plan**: plans/plan-20260905-2354-ci-test-gate-aggregate-failures.md
> **Task Profile**: bugfix
> <!-- legal values: code-change | docs-only | ledger-closeout | migration | eval-only | delegated-run | bugfix (omit for legacy passthrough); see docs/reference-configs/sprint-contracts.md -->
> **Owner**: ancienttwo
> **Capability ID**: root
> **Last Updated**: 2026-09-05 23:54
> **Review File**: `tasks/reviews/20260905-2354-ci-test-gate-aggregate-failures.review.md`
> **Notes File**: `tasks/notes/20260905-2354-ci-test-gate-aggregate-failures.notes.md`
> **Exemplar**: `docs/reference-configs/contract-brief-example.md`
> **Substantive Change SHA256**: `sha256:a7aecd7a4d02994ab8860415580fc7bd9dadfe4f6935b6c17ba35671c70838cf`

## Why

The `Test` job in `.github/workflows/ci.yml` runs `scripts/check-ci.sh` with `BUN_TEST_ISOLATE_FILES=1`, and the per-file loop ran under `set -euo pipefail`, so the first failing file aborted the gate. On 2026-09-05 every file sorting after `tests/architecture-projection-provider.test.ts` went unexercised for several `main` commits: the red set changed three times in one hour and no PR author could see the real failure surface. Left unfixed, every red `main` keeps hiding an unknown number of additional failures and turns each repair into serial guesswork.

## Goal

In isolate mode the CI test loop runs every selected test file regardless of earlier failures, prints each file's own `[ci] test <file>` line and bun output unchanged, and after the loop emits `[ci] failed test files (N):` with one indented `<file> (exit <code>)` line per failure to stderr before returning 1. A run with no failures prints nothing extra and returns 0. Non-isolate mode, `BUN_TEST_FILES` selection, the "no test files matched" error, and the rest of the gate's phase order and exit semantics are unchanged.

## Scope

- In scope: extract `run_bun_test_file`/`run_bun_tests` into the sourceable `scripts/lib/ci-run-tests.sh`, aggregate per-file failures there, source it from `scripts/check-ci.sh`, and add `tests/check-ci-isolate-aggregation.test.ts` as the regression guard.
- Out of scope:
  - changing which checks run, timeouts, concurrency, bun version, or any test outside the new file.
  - editing `.github/workflows/ci.yml`, and continuing the gate past a failed test phase into later phases.
- Taste constraints: keep `scripts/check-ci.sh` byte-identical apart from replacing the two inlined functions with the `source` line; no `|| true` anywhere in the loop.

## Stop Conditions

- Stop and hand back to the parent if the change would require editing a path outside Allowed Paths.
- Stop if an Exit Criteria command cannot be run in this environment.
- Stop if Goal, Scope, or Exit Criteria are internally contradictory.

## Falsifier

If the fail-fast abort came from something other than the per-file loop under `set -e` — for example bun itself terminating the outer shell — then tolerating a per-file non-zero exit would not change the observed behavior. Cheapest proof point: run the pre-fix copy of the loop with a failing file first and confirm the second file's `[ci] test` line is absent, then confirm it appears with the aggregating loop (both captured; see Root Cause Evidence).

## Root Cause Evidence

- root_cause: `scripts/check-ci.sh` called `run_bun_test_file "$file"` bare inside the isolate-mode loop (pre-fix lines 26-34) under `set -euo pipefail`, so the first file's non-zero exit terminated the script and every later selected file was never run.
- repro: `BUN_TEST_ISOLATE_FILES=1 BUN_TEST_FILES="<failing>.test.ts tests/check-ci-isolate-aggregation.test.ts" bash -c 'set -euo pipefail; source <pre-fix loop copy>; run_bun_tests'` prints only the failing file's `[ci] test` line and no summary.
- regression_guard: tests/check-ci-isolate-aggregation.test.ts
- pre_fix_failure_artifact: .ai/harness/evidence/pre-fix/check-ci-isolate-aggregation.log

## Workflow Inventory

- Source plan: `plans/plan-20260905-2354-ci-test-gate-aggregate-failures.md`
- Deferred-goal ledger: `tasks/todos.md`
- Review file: `tasks/reviews/20260905-2354-ci-test-gate-aggregate-failures.review.md`
- Notes file: `tasks/notes/20260905-2354-ci-test-gate-aggregate-failures.notes.md`
- Checks file: `.ai/harness/checks/latest.json`
- Run snapshots: `.ai/harness/runs/`
- Scope gate: edit only paths listed under `allowed_paths`; update this contract before widening scope.
- Completion gate: run `verify-sprint --prepare-acceptance`, record one typed AcceptanceReceipt under the frozen policy below, then run `verify-sprint`; review Markdown is projection only.

## Change Assessment

```json
{"protocol":1,"oracles":[{"id":"isolate-aggregation-guard","kind":"deterministic_test","paths":["scripts/lib/ci-run-tests.sh","scripts/check-ci.sh","tests/check-ci-isolate-aggregation.test.ts"]},{"id":"isolate-loop-runtime-readback","kind":"runtime_readback","paths":["scripts/lib/ci-run-tests.sh","scripts/check-ci.sh"]}]}
```

## Acceptance Policy

```json
{"protocol":2,"reviewer":"Codex","source":"codex-review","user_waiver":"allowed"}
```

## Allowed Paths

```yaml
allowed_paths:
  - scripts/check-ci.sh
  - scripts/lib/ci-run-tests.sh
  - tests/check-ci-isolate-aggregation.test.ts
  - plans/plan-20260905-2354-ci-test-gate-aggregate-failures.md
  - tasks/todos.md
  - tasks/contracts/20260905-2354-ci-test-gate-aggregate-failures.contract.md
  - tasks/reviews/20260905-2354-ci-test-gate-aggregate-failures.review.md
  - tasks/notes/20260905-2354-ci-test-gate-aggregate-failures.notes.md
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
    - scripts/lib/ci-run-tests.sh
  files_contain:
    - path: scripts/check-ci.sh
      pattern: "source .*scripts/lib/ci-run-tests"
    - path: scripts/lib/ci-run-tests.sh
      pattern: "failed test files"
  artifacts_exist:
    - tasks/notes/20260905-2354-ci-test-gate-aggregate-failures.notes.md
    - .ai/harness/evidence/pre-fix/check-ci-isolate-aggregation.log
  tests_pass:
    - path: tests/check-ci-isolate-aggregation.test.ts
    - path: tests/bootstrap-files.test.ts
  commands_succeed:
    - bun run check:helpers
    - bash scripts/check-architecture-sync.sh
    - bash scripts/check-task-workflow.sh --strict
criterion_reuse:
  tests_pass: []
  commands_succeed: []
```

## Acceptance Notes (Human Review)

- Functional behavior: isolate mode runs every selected file and ends with a stderr summary naming each failing file and its exit code; a clean run adds no output and exits 0.
- Edge cases: empty selection still fails with "[ci] no test files matched"; the loop captures each file's status into a local before use, so the reported exit code belongs to that file; non-isolate mode still delegates to a single `bun test` invocation.
- Regression risks: the gate's phase order depends on `run_bun_tests` returning non-zero when any file fails, which the guard asserts; `scripts/check-ci.sh` is not a projected helper, so no `assets/templates/helpers/` mirror is involved (`bun run check:helpers` still reports 56 helpers).

## Rollback Point

- Commit / checkpoint: 64953b6f (branch base)
- Revert strategy: revert the test commit and the fix commit together; `scripts/lib/ci-run-tests.sh` is new and `scripts/check-ci.sh` returns to its inlined functions with no state or data migration.
