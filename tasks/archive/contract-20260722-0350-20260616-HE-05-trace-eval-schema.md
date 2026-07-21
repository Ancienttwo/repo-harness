# Task Contract: HE-05 Trace/Eval Evidence Schema v1

> **Status**: Fulfilled
> **Plan**: `plans/plan-20260616-HE-05-trace-eval-schema.md`
> **Task Profile**: migration
> **Owner**: Codex
> **Capability ID**: verification-evals-checks/trace-evidence
> **Last Updated**: 2026-06-17
> **Review File**: `tasks/reviews/20260616-HE-05-trace-eval-schema.review.md`
> **Notes File**: `tasks/notes/20260616-HE-05-trace-eval-schema.notes.md`

## Goal

Upgrade latest checks and run snapshots from raw verification JSON into a local
`repo-harness-run-trace.v1` evidence record, and add a lightweight local grader.

## Scope

- In scope: `verify-sprint` trace output, strict workflow trace shape validation, local trace grader, fixtures, manifest/helper registration, and reference docs.
- Out of scope: cloud trace ingestion, model-call spans, dataset management, and release closeout automation.

## Allowed Paths

```yaml
allowed_paths:
  - .ai/harness/workflow-contract.json
  - .claude/templates
  - assets
  - docs
  - plans
  - scripts
  - tasks
  - tests
```

## Delegation Contract

```yaml
delegation:
  budget:
    tokens: null
    tool_calls: null
    wall_time_minutes: null
  permission_scope:
    mode: inherit_allowed_paths
    writable_paths: []
    network: inherited
  roles:
    parent: narrate_and_gatekeep
    worker: implement_contract
    verifier: review_exit_criteria
```

## Exit Criteria (Machine Verifiable)

```yaml
exit_criteria:
  files_exist:
    - scripts/harness-trace-grade.sh
    - assets/templates/helpers/harness-trace-grade.sh
    - tests/fixtures/harness-traces/code-change-pass.json
    - tests/fixtures/harness-traces/docs-only-pass.json
    - tests/fixtures/harness-traces/ledger-closeout-pass.json
    - tests/fixtures/harness-traces/migration-pass.json
    - tests/fixtures/harness-traces/eval-only-pass.json
  commands_succeed:
    - grep -n "repo-harness-run-trace.v1" scripts/verify-sprint.sh
    - grep -n "trace_schema_error" scripts/check-task-workflow.sh
    - bash scripts/harness-trace-grade.sh --run tests/fixtures/harness-traces/code-change-pass.json --strict
    - bash scripts/harness-trace-grade.sh --run tests/fixtures/harness-traces/docs-only-pass.json --strict
    - bash scripts/harness-trace-grade.sh --run tests/fixtures/harness-traces/ledger-closeout-pass.json --strict
    - bash scripts/harness-trace-grade.sh --run tests/fixtures/harness-traces/migration-pass.json --strict
    - bash scripts/harness-trace-grade.sh --run tests/fixtures/harness-traces/eval-only-pass.json --strict
    - bun test tests/helper-scripts.test.ts
    - bash scripts/check-task-workflow.sh --strict
  manual_checks:
    - "Evaluator review file recommends pass"
```

## Acceptance Notes (Human Review)

- Functional behavior: latest checks include schema v1 fields and run snapshots keep the same shape.
- Edge cases: empty `{}` latest checks remain valid for fresh repos; malformed non-empty latest checks fail strict workflow.
- Regression risks: allowed-path file matching remains prefix-based and intentionally simple for v1.

## Rollback Point

- Commit / checkpoint: staged HE-04 batch.
- Revert strategy: remove trace schema fields, grader, fixtures, manifest entries, and docs.
