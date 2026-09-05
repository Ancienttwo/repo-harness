# Task Contract: ci-isolate-discover-tsx

> **Status**: Fulfilled
> **Plan**: plans/plan-20260906-0233-ci-isolate-discover-tsx.md
> **Task Profile**: bugfix
> <!-- legal values: code-change | docs-only | ledger-closeout | migration | eval-only | delegated-run | bugfix (omit for legacy passthrough); see docs/reference-configs/sprint-contracts.md -->
> **Owner**: ancienttwo
> **Capability ID**: root
> **Last Updated**: 2026-09-06 02:33
> **Review File**: `tasks/reviews/20260906-0233-ci-isolate-discover-tsx.review.md`
> **Notes File**: `tasks/notes/20260906-0233-ci-isolate-discover-tsx.notes.md`
> **Exemplar**: `docs/reference-configs/contract-brief-example.md`
> **Substantive Change SHA256**: `sha256:ce7464205e19886cbe0afa7357a5f949d1c4df0ea43a9acdff9a73fb376a9ac5`

## Why

CI's `Test` job runs the isolate loop, whose own file discovery is narrower than
bun's. The three `tests/operator-web/*.test.tsx` suites therefore never execute
in CI: a regression in them stays green on every PR while passing locally under
plain `bun test`.

## Goal

The isolate-mode loop in `scripts/lib/ci-run-tests.sh` discovers `*.test.tsx`
alongside `*.test.ts`, so its discovered file count matches bun's own, and a
guard case pins that behaviour.

## Scope

- In scope:
  - `scripts/lib/ci-run-tests.sh`: widen the isolate-mode `find` predicate to include `*.test.tsx`.
  - `tests/check-ci-isolate-aggregation.test.ts`: add the tsx-discovery guard case.
- Out of scope:
  - any other discovery root, file-name pattern, sort order, concurrency, timeouts, workflow YAML.
  - the explicit `BUN_TEST_FILES` selection branch, which is unchanged.
- Taste constraints: minimal predicate change only; no restructuring of the loop.

## Stop Conditions

- Stop and hand back to the parent if the change would require editing a path outside Allowed Paths.
- Stop if an Exit Criteria command cannot be run in this environment.
- Stop if Goal, Scope, or Exit Criteria are internally contradictory.

## Falsifier

If the discovered file count from the widened predicate does not equal the
`across M files` figure bun reports for the full suite, the predicate is still
not equivalent to bun's discovery and this direction is wrong. Cheapest proof:
compare `find tests -type f \( -name '*.test.ts' -o -name '*.test.tsx' \) | wc -l`
against the full-suite summary line.

## Root Cause Evidence

- root_cause: `scripts/lib/ci-run-tests.sh:44` discovers isolate-mode files with `find tests -type f -name '*.test.ts'`, a predicate that omits `*.test.tsx`, so the three `tests/operator-web/*.test.tsx` suites never enter the CI loop.
- repro: from a `tests`-shaped root containing `tests/a.test.ts` and `tests/b.test.tsx`, run `BUN_TEST_ISOLATE_FILES=1 bash -c 'set -euo pipefail; source <abs>/scripts/lib/ci-run-tests.sh; run_bun_tests'` with `BUN_TEST_FILES` unset; only `[ci] test tests/a.test.ts` is printed.
- regression_guard: tests/check-ci-isolate-aggregation.test.ts
- pre_fix_failure_artifact: .ai/harness/evidence/pre-fix/check-ci-isolate-discover-tsx.log

## Workflow Inventory

- Source plan: `plans/plan-20260906-0233-ci-isolate-discover-tsx.md`
- Deferred-goal ledger: `tasks/todos.md`
- Review file: `tasks/reviews/20260906-0233-ci-isolate-discover-tsx.review.md`
- Notes file: `tasks/notes/20260906-0233-ci-isolate-discover-tsx.notes.md`
- Checks file: `.ai/harness/checks/latest.json`
- Run snapshots: `.ai/harness/runs/`
- Scope gate: edit only paths listed under `allowed_paths`; update this contract before widening scope.
- Completion gate: run `verify-sprint --prepare-acceptance`, record one typed AcceptanceReceipt under the frozen policy below, then run `verify-sprint`; review Markdown is projection only.

## Change Assessment

```json
{"protocol":1,"oracles":[{"id":"ci-isolate-discover-tsx-deterministic","kind":"deterministic_test","paths":["scripts/lib/ci-run-tests.sh","tests/check-ci-isolate-aggregation.test.ts"]},{"id":"ci-isolate-discover-tsx-readback","kind":"runtime_readback","paths":["scripts/lib/ci-run-tests.sh"]}]}
```

## Acceptance Policy

```json
{"protocol":2,"reviewer":"Codex","source":"codex-review","user_waiver":"allowed"}
```

## Allowed Paths

```yaml
allowed_paths:
  - scripts/lib/ci-run-tests.sh
  - tests/check-ci-isolate-aggregation.test.ts
  - plans/plan-20260906-0233-ci-isolate-discover-tsx.md
  - tasks/todos.md
  - tasks/contracts/20260906-0233-ci-isolate-discover-tsx.contract.md
  - tasks/reviews/20260906-0233-ci-isolate-discover-tsx.review.md
  - tasks/notes/20260906-0233-ci-isolate-discover-tsx.notes.md
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
    - tests/check-ci-isolate-aggregation.test.ts
  artifacts_exist:
    - tasks/notes/20260906-0233-ci-isolate-discover-tsx.notes.md
  tests_pass:
    - path: tests/check-ci-isolate-aggregation.test.ts
    - path: tests/bootstrap-files.test.ts
  commands_succeed:
    - test "$(find tests -type f \( -name '*.test.ts' -o -name '*.test.tsx' \) | LC_ALL=C sort | wc -l | tr -d ' ')" = "361"
    - bash scripts/check-deploy-sql-order.sh
    - bash scripts/check-architecture-sync.sh
    - bash scripts/check-task-sync.sh
    - bash scripts/check-task-workflow.sh --strict
    - bun scripts/inspect-project-state.ts --repo . --format text
    - bun src/cli/index.ts init --repo . --dry-run
criterion_reuse:
  tests_pass: []
  commands_succeed: []
```

## Acceptance Notes (Human Review)

- Functional behavior: isolate-mode discovery now matches bun's own file set (361 files), so the three `tests/operator-web/*.test.tsx` suites run in CI's `Test` job.
- Edge cases: the explicit `BUN_TEST_FILES` branch is untouched; the `no test files matched` guard and `LC_ALL=C sort` ordering are unchanged.
- Regression risks: the CI `Test` job now executes three additional suites, lengthening the job; a pre-existing failure in those suites would surface as a new CI red.
- Coverage rationale: one full `bun test --timeout 60000` run supplies the `across M files` figure the discovery readback is compared against, so the full suite is both the coverage check and the readback source.

## Rollback Point

- Commit / checkpoint: base main 29b3fd12
- Revert strategy: revert the discovery predicate in `scripts/lib/ci-run-tests.sh` and the guard case in `tests/check-ci-isolate-aggregation.test.ts` together.
