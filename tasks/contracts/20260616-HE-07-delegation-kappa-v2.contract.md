# Task Contract: HE-07 Delegation Contract Kappa v2

> **Status**: Active
> **Plan**: `plans/plan-20260616-HE-07-delegation-kappa-v2.md`
> **Task Profile**: migration
> **Owner**: Codex
> **Capability ID**: workflow-engine/delegation-contract
> **Last Updated**: 2026-06-17
> **Review File**: `tasks/reviews/20260616-HE-07-delegation-kappa-v2.review.md`
> **Notes File**: `tasks/notes/20260616-HE-07-delegation-kappa-v2.notes.md`

## Goal

Upgrade delegation metadata from a loose placeholder into a conservative v2
contract surface consumed by `contract-run` dry-run/run manifests.

## Scope

- In scope: delegation YAML templates, `contract-run` parser/manifest/prompts, documentation, tests, and HE-07 filing.
- Out of scope: autonomous child-agent spawning or permissions outside explicit command execution.

## Allowed Paths

```yaml
allowed_paths:
  - .claude/templates/contract.template.md
  - assets/templates/contract.template.md
  - scripts/contract-run.ts
  - assets/templates/helpers/contract-run.ts
  - scripts/ensure-task-workflow.sh
  - assets/templates/helpers/ensure-task-workflow.sh
  - scripts/plan-to-todo.sh
  - assets/templates/helpers/plan-to-todo.sh
  - scripts/lib/project-init-lib.sh
  - docs/reference-configs/sprint-contracts.md
  - assets/reference-configs/sprint-contracts.md
  - tests/contract-run.test.ts
  - plans/plan-20260616-HE-07-delegation-kappa-v2.md
  - tasks/contracts/20260616-HE-07-delegation-kappa-v2.contract.md
  - tasks/reviews/20260616-HE-07-delegation-kappa-v2.review.md
  - tasks/notes/20260616-HE-07-delegation-kappa-v2.notes.md
  - "plans/sprints/20260617-Sprint: Harness Engineering Optimization — State, Review, Eval, Delegation.md"
```

## Delegation Contract

```yaml
delegation:
  budget:
    tokens: null
    tool_calls: 2
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
```

## Exit Criteria (Machine Verifiable)

```yaml
exit_criteria:
  files_exist:
    - scripts/contract-run.ts
    - assets/templates/helpers/contract-run.ts
    - .claude/templates/contract.template.md
    - assets/templates/contract.template.md
  commands_succeed:
    - grep -n "explorer:" .claude/templates/contract.template.md
    - grep -n "delegation_plan" scripts/contract-run.ts
    - grep -n "CONTRACT_RUN_ALLOWED_PATHS" scripts/contract-run.ts
    - bun test tests/contract-run.test.ts
    - bun scripts/contract-run.ts dry-run --contract tasks/contracts/20260616-HE-07-delegation-kappa-v2.contract.md --out .ai/harness/runs/he07-delegation-dry-run --json
    - bash scripts/check-task-workflow.sh --strict
  manual_checks:
    - "Evaluator review file recommends pass"
```

## Acceptance Notes (Human Review)

- Functional behavior: dry-run manifest records role separation, allowed paths, budget semantics, and verifier rubric.
- Edge cases: old scalar role contracts still parse as mode/purpose pairs.
- Regression risks: only `tool_calls` is enforced today; token/time remain documented/advisory until a runner can enforce them.

## Rollback Point

- Commit / checkpoint: staged HE-06 batch.
- Revert strategy: restore scalar delegation roles and previous contract-run parser/manifest.
