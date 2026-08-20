> **Archived**: 2026-08-20 16:17
> **Related Plan**: plans/archive/plan-20260530-1023-tracked-current-status-snapshot.md
> **Outcome**: Superseded
> **Lifecycle**: contract
> **Parent Run ID**: run-20260820-1617

# Sprint Contract: tracked-current-status-snapshot

> **Status**: Active
> **Plan**: plans/plan-20260530-1023-tracked-current-status-snapshot.md
> **Owner**: ancienttwo
> **Capability ID**: root
> **Last Updated**: 2026-05-30 10:23
> **Review File**: `tasks/reviews/tracked-current-status-snapshot.review.md`
> **Notes File**: `tasks/notes/tracked-current-status-snapshot.notes.md`

## Goal

Describe the exact outcome this task must deliver.

## Scope

- In scope:
- Out of scope:

## Workflow Inventory

- Source plan: `plans/plan-20260530-1023-tracked-current-status-snapshot.md`
- Deferred-goal ledger: `tasks/todo.md`
- Review file: `tasks/reviews/tracked-current-status-snapshot.review.md`
- Notes file: `tasks/notes/tracked-current-status-snapshot.notes.md`
- Checks file: `.ai/harness/checks/latest.json`
- Run snapshots: `.ai/harness/runs/`
- Scope gate: edit only paths listed under `allowed_paths`; update this contract before widening scope.
- Completion gate: `scripts/verify-sprint.sh` must see this contract pass and the review recommend pass.

## Allowed Paths

```yaml
allowed_paths:
  - docs/spec.md
  - plans/
  - tasks/todo.md
  - tasks/contracts/tracked-current-status-snapshot.contract.md
  - tasks/reviews/tracked-current-status-snapshot.review.md
  - tasks/notes/tracked-current-status-snapshot.notes.md
  - .ai/context/capabilities.json
  - src/
  - tests/
```

## Exit Criteria (Machine Verifiable)

```yaml
exit_criteria:
  files_exist:
    - docs/spec.md
  artifacts_exist:
    - .ai/harness/checks/latest.json
    - tasks/notes/tracked-current-status-snapshot.notes.md
  tests_pass:
    - path: tests/unit/tracked-current-status-snapshot.test.ts
  commands_succeed:
    - bun run typecheck
  qa_scores:
    - dimension: functionality
      min: 7
  manual_checks:
    - "Evaluator review file recommends pass"
```

## Acceptance Notes (Human Review)

- Functional behavior:
- Edge cases:
- Regression risks:

## Rollback Point

- Commit / checkpoint:
- Revert strategy:
