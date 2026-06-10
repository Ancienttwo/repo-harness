# Sprint Contract: hook-framework-audit-fixes

> **Status**: Active
> **Plan**: plans/plan-20260610-1040-hook-framework-audit-fixes.md
> **Owner**: chris
> **Capability ID**: root
> **Last Updated**: 2026-06-10 10:40
> **Review File**: `tasks/reviews/20260610-1040-hook-framework-audit-fixes.review.md`
> **Notes File**: `tasks/notes/20260610-1040-hook-framework-audit-fixes.notes.md`

## Goal

Describe the exact outcome this task must deliver.

## Scope

- In scope:
- Out of scope:

## Workflow Inventory

- Source plan: `plans/plan-20260610-1040-hook-framework-audit-fixes.md`
- Deferred-goal ledger: `tasks/todo.md`
- Review file: `tasks/reviews/20260610-1040-hook-framework-audit-fixes.review.md`
- Notes file: `tasks/notes/20260610-1040-hook-framework-audit-fixes.notes.md`
- Checks file: `.ai/harness/checks/latest.json`
- Run snapshots: `.ai/harness/runs/`
- Scope gate: edit only paths listed under `allowed_paths`; update this contract before widening scope.
- Completion gate: `scripts/verify-sprint.sh` must see this contract pass, the review recommend pass, and `## External Acceptance Advice` pass or record a manual override.

## Allowed Paths

```yaml
allowed_paths:
  - docs/spec.md
  - plans/
  - tasks/todo.md
  - tasks/contracts/20260610-1040-hook-framework-audit-fixes.contract.md
  - tasks/reviews/20260610-1040-hook-framework-audit-fixes.review.md
  - tasks/notes/20260610-1040-hook-framework-audit-fixes.notes.md
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
    - tasks/notes/20260610-1040-hook-framework-audit-fixes.notes.md
  tests_pass:
    - path: tests/unit/hook-framework-audit-fixes.test.ts
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
