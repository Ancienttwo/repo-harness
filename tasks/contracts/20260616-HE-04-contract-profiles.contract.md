# Task Contract: HE-04 Contract Profiles

> **Status**: Active
> **Plan**: `plans/plan-20260616-HE-04-contract-profiles.md`
> **Task Profile**: migration
> **Owner**: Codex
> **Capability ID**: workflow-engine/contract-profiles
> **Last Updated**: 2026-06-17
> **Review File**: `tasks/reviews/20260616-HE-04-contract-profiles.review.md`
> **Notes File**: `tasks/notes/20260616-HE-04-contract-profiles.notes.md`

## Goal

Add first-class task profile metadata and enforce the most important default
allowed-path narrowing rules in `verify-contract`.

## Scope

- In scope: contract templates, generated contract fallback, profile validation, profile docs, and helper tests.
- Out of scope: matching Review Card `Change type` to profile and strict-exit closeout schema.

## Allowed Paths

```yaml
allowed_paths:
  - .claude/templates/contract.template.md
  - assets/templates/contract.template.md
  - scripts/verify-contract.sh
  - assets/templates/helpers/verify-contract.sh
  - scripts/ensure-task-workflow.sh
  - assets/templates/helpers/ensure-task-workflow.sh
  - scripts/plan-to-todo.sh
  - assets/templates/helpers/plan-to-todo.sh
  - scripts/lib/project-init-lib.sh
  - docs/reference-configs/sprint-contracts.md
  - assets/reference-configs/sprint-contracts.md
  - tests/helper-scripts.test.ts
  - plans/plan-20260616-HE-04-contract-profiles.md
  - tasks/contracts/20260616-HE-04-contract-profiles.contract.md
  - tasks/reviews/20260616-HE-04-contract-profiles.review.md
  - tasks/notes/20260616-HE-04-contract-profiles.notes.md
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
    - scripts/verify-contract.sh
    - assets/templates/helpers/verify-contract.sh
    - .claude/templates/contract.template.md
    - assets/templates/contract.template.md
  commands_succeed:
    - grep -n "Task Profile" .claude/templates/contract.template.md
    - grep -n "unsupported task_profile" scripts/verify-contract.sh
    - grep -n "ledger-closeout profile cannot allow runtime" scripts/verify-contract.sh
    - bun test tests/helper-scripts.test.ts
    - bash scripts/check-task-workflow.sh --strict
  manual_checks:
    - "Evaluator review file recommends pass"
```

## Acceptance Notes (Human Review)

- Functional behavior: unsupported profiles and ledger-closeout runtime paths fail verification.
- Edge cases: no-profile legacy contracts remain accepted.
- Regression risks: profile-to-review-card matching remains a later strict-exit concern.

## Rollback Point

- Commit / checkpoint: staged HE-03 batch.
- Revert strategy: restore verify-contract and contract templates to pre-profile behavior.
