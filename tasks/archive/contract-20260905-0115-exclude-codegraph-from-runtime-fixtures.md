> **Archived**: 2026-09-05 01:15
> **Related Plan**: plans/archive/plan-20260905-0109-exclude-codegraph-from-runtime-fixtures.md
> **Outcome**: Completed
> **Lifecycle**: contract
> **Parent Run ID**: run-20260905-0115
> **Archive Projection V1**: `plans/plan-20260905-0109-exclude-codegraph-from-runtime-fixtures.md` => `plans/archive/plan-20260905-0109-exclude-codegraph-from-runtime-fixtures.md`
> **Archive Projection V1**: `tasks/notes/20260905-0109-exclude-codegraph-from-runtime-fixtures.notes.md` => `tasks/archive/notes-20260905-0115-exclude-codegraph-from-runtime-fixtures.md`
> **Archive Projection V1**: `tasks/contracts/20260905-0109-exclude-codegraph-from-runtime-fixtures.contract.md` => `tasks/archive/contract-20260905-0115-exclude-codegraph-from-runtime-fixtures.md`
> **Archive Projection V1**: `tasks/reviews/20260905-0109-exclude-codegraph-from-runtime-fixtures.review.md` => `tasks/archive/review-20260905-0115-exclude-codegraph-from-runtime-fixtures.md`

# Task Contract: exclude-codegraph-from-runtime-fixtures

> **Status**: Fulfilled
> **Plan**: plans/archive/plan-20260905-0109-exclude-codegraph-from-runtime-fixtures.md
> **Task Profile**: code-change
> <!-- legal values: code-change | docs-only | ledger-closeout | migration | eval-only | delegated-run | bugfix (omit for legacy passthrough); see docs/reference-configs/sprint-contracts.md -->
> **Owner**: ancienttwo
> **Capability ID**: root
> **Last Updated**: 2026-09-05 01:09
> **Review File**: `tasks/archive/review-20260905-0115-exclude-codegraph-from-runtime-fixtures.md`
> **Notes File**: `tasks/archive/notes-20260905-0115-exclude-codegraph-from-runtime-fixtures.md`
> **Exemplar**: `docs/reference-configs/contract-brief-example.md`

## Why

Whole-repository test fixtures currently copy ignored CodeGraph runtime state. A live or stale Unix socket cannot be copied by `fs.cpSync`, so the full suite fails for reasons unrelated to the runtime behavior under test.

## Goal

Keep runtime fixture copies source-complete while excluding the repository-local `.codegraph/` cache, so the affected tests pass even when `daemon.sock` exists.

## Scope

- In scope: the two test helpers that recursively copy `ROOT` into isolated runtime fixtures.
- Out of scope: production install/update behavior, CodeGraph lifecycle, and removal of local CodeGraph state.
- Taste constraints: <!-- advisory only, no run gate; default style/taste lives in AGENTS.md and the minimal-change policy, use this to record a per-task override -->

## Stop Conditions

- Stop and hand back to the parent if the change would require editing a path outside Allowed Paths.
- Stop if an Exit Criteria command cannot be run in this environment.
- Stop if Goal, Scope, or Exit Criteria are internally contradictory.

## Falsifier

If either copied fixture needs `.codegraph/` to exercise the behavior under test, excluding it would break the focused files; run both files with the socket present.

## Root Cause Evidence

Required when Task Profile is `bugfix`; leave as-is otherwise.

- root_cause: one sentence naming file:line/condition (testable, not "a state issue").
- repro: the command or UI path that reproduces the symptom.
- regression_guard: path to a test that fails on the unfixed code and passes after the fix (must also appear under exit_criteria.tests_pass).
- pre_fix_failure_artifact: path to a captured run of regression_guard on the UNFIXED code. Capture with `bun test <regression_guard> > <artifact> 2>&1; echo "PRE_FIX_EXIT=$?" >> <artifact>` (no pipes — pipes swallow the exit status). The gate requires a non-zero `PRE_FIX_EXIT=` line plus the regression_guard path string in the artifact (see the Root Cause Evidence Gate section in docs/reference-configs/sprint-contracts.md).

## Workflow Inventory

- Source plan: `plans/archive/plan-20260905-0109-exclude-codegraph-from-runtime-fixtures.md`
- Deferred-goal ledger: `tasks/todos.md`
- Review file: `tasks/archive/review-20260905-0115-exclude-codegraph-from-runtime-fixtures.md`
- Notes file: `tasks/archive/notes-20260905-0115-exclude-codegraph-from-runtime-fixtures.md`
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
  - tasks/archive/contract-20260905-0115-exclude-codegraph-from-runtime-fixtures.md
  - tasks/archive/review-20260905-0115-exclude-codegraph-from-runtime-fixtures.md
  - tasks/archive/notes-20260905-0115-exclude-codegraph-from-runtime-fixtures.md
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
    - tasks/archive/notes-20260905-0115-exclude-codegraph-from-runtime-fixtures.md
  tests_pass:
    - path: tests/unit/candidate-bound-global-runtime-reconciliation.test.ts
    - path: tests/cli/global-runtime-init.test.ts
  commands_succeed:
    - bun run check:type
    - bash scripts/check-task-sync.sh
    - bash scripts/check-task-workflow.sh --strict
# Optional exact-subject reuse is fail-closed and opt-in. List only deterministic
# criteria whose inputs are fully bound by the frozen subject/toolchain context.
# criterion_reuse:
#   tests_pass:
#     - path/to/deterministic.test.ts
#   commands_succeed:
#     - bun test --timeout 60000
```

## Acceptance Notes (Human Review)

- Functional behavior: fixture copies omit ignored local CodeGraph state and retain all source inputs.
- Edge cases: `.codegraph/daemon.sock` exists while tests run.
- Regression risks: excluding a source-owned path by basename; bounded because `.codegraph/` is an ignored repository runtime cache.

## Rollback Point

- Commit / checkpoint:
- Revert strategy:
