# Task Contract: HE-03 Human Review Card

> **Status**: Active
> **Plan**: `plans/plan-20260616-HE-03-human-review-card.md`
> **Task Profile**: migration
> **Owner**: Codex
> **Capability ID**: workflow-engine/human-review-card
> **Last Updated**: 2026-06-17
> **Review File**: `tasks/reviews/20260616-HE-03-human-review-card.review.md`
> **Notes File**: `tasks/notes/20260616-HE-03-human-review-card.notes.md`

## Goal

Make Human Review Card a first-screen review surface and a verification signal
for `verify-sprint`.

## Scope

- In scope: review templates, fallback generators, verify-sprint parsing, checks JSON, and fixtures.
- Out of scope: typed JSON review result schema and full closeout schema.

## Allowed Paths

```yaml
allowed_paths:
  - .claude/templates/review.template.md
  - assets/templates/review.template.md
  - scripts/verify-sprint.sh
  - assets/templates/helpers/verify-sprint.sh
  - scripts/ensure-task-workflow.sh
  - assets/templates/helpers/ensure-task-workflow.sh
  - scripts/plan-to-todo.sh
  - assets/templates/helpers/plan-to-todo.sh
  - scripts/lib/project-init-lib.sh
  - tests/helper-scripts.test.ts
  - tests/hook-runtime.test.ts
  - plans/plan-20260616-HE-03-human-review-card.md
  - tasks/contracts/20260616-HE-03-human-review-card.contract.md
  - tasks/reviews/20260616-HE-03-human-review-card.review.md
  - tasks/notes/20260616-HE-03-human-review-card.notes.md
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
    - .claude/templates/review.template.md
    - assets/templates/review.template.md
    - scripts/verify-sprint.sh
    - assets/templates/helpers/verify-sprint.sh
  commands_succeed:
    - grep -n "## Human Review Card" .claude/templates/review.template.md
    - grep -n "review_card_field" scripts/verify-sprint.sh
    - bun test tests/helper-scripts.test.ts
    - bun test tests/bootstrap-files.test.ts tests/readme-dx.test.ts
    - bash scripts/check-task-workflow.sh --strict
  manual_checks:
    - "Evaluator review file recommends pass"
```

## Acceptance Notes (Human Review)

- Functional behavior: passing verification now requires review card verdict pass.
- Edge cases: card external acceptance can provide `not_required` when the External Acceptance Advice section is unavailable.
- Regression risks: full `bun test` remains for HE-09.

## Rollback Point

- Commit / checkpoint: staged HE-02 batch before HE-03 edits.
- Revert strategy: restore verify-sprint recommendation-only behavior and remove card from templates/tests.
