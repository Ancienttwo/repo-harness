# Task Contract: HE-02 Filing and Terminology Normalization

> **Status**: Active
> **Plan**: `plans/plan-20260616-HE-02-filing-terminology-normalization.md`
> **Task Profile**: migration
> **Owner**: Codex
> **Capability ID**: workflow-engine/filing-terminology
> **Last Updated**: 2026-06-17
> **Review File**: `tasks/reviews/20260616-HE-02-filing-terminology-normalization.review.md`
> **Notes File**: `tasks/notes/20260616-HE-02-filing-terminology-normalization.notes.md`

## Goal

Normalize new workflow artifact terminology so generated plans, task contracts,
and task reviews use the PRD -> Sprint -> Task Contract vocabulary while strict
workflow checks catch drift in generation surfaces.

## Scope

- In scope:
  - Template and helper output wording.
  - Strict workflow gate for generation-surface drift.
  - Tests for new labels and stale wording detection.
  - Reference documentation for legacy filename compatibility.
- Out of scope:
  - Renaming `verify-sprint.sh`, `new-sprint.sh`, or historical archives.
  - Removing migration code that intentionally references legacy paths.

## Allowed Paths

```yaml
allowed_paths:
  - .claude/templates/
  - assets/templates/
  - assets/reference-configs/sprint-contracts.md
  - scripts/capture-plan.sh
  - scripts/new-plan.sh
  - scripts/ensure-task-workflow.sh
  - scripts/plan-to-todo.sh
  - scripts/check-task-workflow.sh
  - scripts/lib/project-init-lib.sh
  - docs/reference-configs/sprint-contracts.md
  - tests/helper-scripts.test.ts
  - tests/contract-run.test.ts
  - tests/hook-protocol.test.ts
  - tests/hook-runtime.test.ts
  - tests/workflow-state-lib.test.ts
  - plans/plan-20260616-HE-02-filing-terminology-normalization.md
  - tasks/contracts/20260616-HE-02-filing-terminology-normalization.contract.md
  - tasks/reviews/20260616-HE-02-filing-terminology-normalization.review.md
  - tasks/notes/20260616-HE-02-filing-terminology-normalization.notes.md
  - "plans/sprints/20260617-Sprint: Harness Engineering Optimization — State, Review, Eval, Delegation.md"
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
    - scripts/check-task-workflow.sh
    - assets/templates/helpers/check-task-workflow.sh
    - docs/reference-configs/sprint-contracts.md
    - assets/reference-configs/sprint-contracts.md
  commands_succeed:
    - bun test tests/helper-scripts.test.ts
    - bash scripts/check-task-workflow.sh --strict
    - '! rg -n "Sprint Contract|Sprint Review" .claude/templates/plan.template.md .claude/templates/contract.template.md .claude/templates/review.template.md assets/templates/plan.template.md assets/templates/contract.template.md assets/templates/review.template.md assets/templates/helpers/new-plan.sh assets/templates/helpers/capture-plan.sh assets/templates/helpers/ensure-task-workflow.sh assets/templates/helpers/plan-to-todo.sh scripts/new-plan.sh scripts/capture-plan.sh scripts/ensure-task-workflow.sh scripts/plan-to-todo.sh scripts/lib/project-init-lib.sh docs/reference-configs/sprint-contracts.md assets/reference-configs/sprint-contracts.md'
  manual_checks:
    - "Evaluator review file recommends pass"
```

## Acceptance Notes (Human Review)

- Functional behavior: new generated artifacts use Task Contract / Task Review.
- Edge cases: old plan metadata using Sprint Contract remains parseable.
- Regression risks: tests using copied package helpers must stay in sync with root helpers.

## Rollback Point

- Commit / checkpoint: staged HE-01 baseline before HE-02 edits.
- Revert strategy: restore template/helper wording and remove the generation-surface strict gate/test.
