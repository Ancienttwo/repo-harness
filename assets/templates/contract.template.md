# Sprint Contract: {{TASK_SLUG}}

> **Status**: Active
> **Plan**: {{PLAN_FILE}}
> **Owner**: {{OWNER}}
> **Capability ID**: {{CAPABILITY_ID}}
> **Last Updated**: {{TIMESTAMP}}
> **Review File**: `tasks/reviews/{{TASK_SLUG}}.review.md`
> **Notes File**: `tasks/notes/{{TASK_SLUG}}.notes.md`

## Goal

Describe the exact outcome this task must deliver.

## Scope

- In scope:
- Out of scope:

## Workflow Inventory

- Source plan: `{{PLAN_FILE}}`
- Todo projection: `tasks/todo.md`
- Review file: `tasks/reviews/{{TASK_SLUG}}.review.md`
- Notes file: `tasks/notes/{{TASK_SLUG}}.notes.md`
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
  - tasks/contracts/{{TASK_SLUG}}.contract.md
  - tasks/reviews/{{TASK_SLUG}}.review.md
  - tasks/notes/{{TASK_SLUG}}.notes.md
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
    - tasks/notes/{{TASK_SLUG}}.notes.md
  tests_pass:
    - path: tests/unit/{{TASK_SLUG}}.test.ts
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
