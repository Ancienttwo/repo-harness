# Sprint Contract: loop-engine-04-contract-kappa-fields

> **Status**: Fulfilled
> **Plan**: plans/plan-20260612-1224-loop-engine-04-contract-kappa-fields.md
> **Owner**: chris
> **Capability ID**: root
> **Last Updated**: 2026-06-12 12:24
> **Review File**: `tasks/reviews/20260612-1224-loop-engine-04-contract-kappa-fields.review.md`
> **Notes File**: `tasks/notes/20260612-1224-loop-engine-04-contract-kappa-fields.notes.md`

## Goal

Add backward-compatible contract-kappa metadata fields (`budget`, `permission_scope`, `roles`) to the contract template and `plan-to-todo.sh` projection surface, with tests and reference documentation.

## Scope

- In scope: self-host and distributed contract templates, `plan-to-todo.sh` fallback projection, workflow bootstrap fallback templates, tests proving new and old contract compatibility, and reference documentation.
- Out of scope: `contract-run` execution, child-agent spawning, heartbeat automation, shadow prompt injection, or changing `prompt-guard` classifier authority.

## Workflow Inventory

- Source plan: `plans/plan-20260612-1224-loop-engine-04-contract-kappa-fields.md`
- Deferred-goal ledger: `tasks/todo.md`
- Review file: `tasks/reviews/20260612-1224-loop-engine-04-contract-kappa-fields.review.md`
- Notes file: `tasks/notes/20260612-1224-loop-engine-04-contract-kappa-fields.notes.md`
- Checks file: `.ai/harness/checks/latest.json`
- Run snapshots: `.ai/harness/runs/`
- Scope gate: edit only paths listed under `allowed_paths`; update this contract before widening scope.
- Completion gate: `scripts/verify-sprint.sh` must see this contract pass, the review recommend pass, and `## External Acceptance Advice` pass or record a manual override.

## Allowed Paths

```yaml
allowed_paths:
  - .claude/templates/contract.template.md
  - assets/templates/contract.template.md
  - assets/templates/helpers/ensure-task-workflow.sh
  - assets/templates/helpers/plan-to-todo.sh
  - assets/reference-configs/sprint-contracts.md
  - docs/reference-configs/sprint-contracts.md
  - docs/spec.md
  - plans/
  - scripts/ensure-task-workflow.sh
  - scripts/lib/project-init-lib.sh
  - scripts/plan-to-todo.sh
  - tasks/sprints/20260612-0236-loop-engine.sprint.md
  - tasks/todo.md
  - tasks/contracts/20260612-1224-loop-engine-04-contract-kappa-fields.contract.md
  - tasks/reviews/20260612-1224-loop-engine-04-contract-kappa-fields.review.md
  - tasks/notes/20260612-1224-loop-engine-04-contract-kappa-fields.notes.md
  - .ai/context/capabilities.json
  - src/
  - tests/
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
    - docs/spec.md
    - .claude/templates/contract.template.md
    - assets/templates/contract.template.md
  artifacts_exist:
    - .ai/harness/checks/latest.json
    - tasks/notes/20260612-1224-loop-engine-04-contract-kappa-fields.notes.md
  commands_succeed:
    - bun test tests/helper-scripts.test.ts --test-name-pattern 'plan-to-todo should archive previous todo|verify-contract should ignore allowed_paths|verify-contract should ignore delegation metadata'
    - bun test tests/scaffold-parity.test.ts
    - bash scripts/check-task-workflow.sh --strict
  files_contain:
    - path: .claude/templates/contract.template.md
      pattern: "## Delegation Contract"
    - path: assets/templates/contract.template.md
      pattern: "permission_scope"
    - path: scripts/plan-to-todo.sh
      pattern: "roles:"
    - path: docs/reference-configs/sprint-contracts.md
      pattern: "budget"
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
