# Sprint Contract: loop-engine-04-contract-kappa-fields

> **Status**: Fulfilled
> **Plan**: plans/plan-20260612-0457-loop-engine-04-contract-kappa-fields.md
> **Owner**: chris
> **Capability ID**: root
> **Last Updated**: 2026-06-12 05:09
> **Review File**: `tasks/reviews/20260612-0457-loop-engine-04-contract-kappa-fields.review.md`
> **Notes File**: `tasks/notes/20260612-0457-loop-engine-04-contract-kappa-fields.notes.md`

## Goal

Add backward-compatible contract delegation metadata for future child-agent execution without changing current contract verification semantics.

## Scope

- In scope:
  - Add backward-compatible `delegation` κ metadata defaults to contract templates and plan-to-todo fallback projection.
  - Document `budget`, `permission_scope`, and `roles` semantics for future `contract-run`.
  - Verify both old contracts without `delegation` and new contracts with `delegation` continue to pass `verify-contract.sh`.
- Out of scope:
  - Implementing `contract-run`.
  - Making κ fields mandatory.
  - Changing `verify-contract.sh` exit criteria semantics.

## Workflow Inventory

- Source plan: `plans/plan-20260612-0457-loop-engine-04-contract-kappa-fields.md`
- Deferred-goal ledger: `tasks/todo.md`
- Review file: `tasks/reviews/20260612-0457-loop-engine-04-contract-kappa-fields.review.md`
- Notes file: `tasks/notes/20260612-0457-loop-engine-04-contract-kappa-fields.notes.md`
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
  - tasks/contracts/20260612-0457-loop-engine-04-contract-kappa-fields.contract.md
  - tasks/reviews/20260612-0457-loop-engine-04-contract-kappa-fields.review.md
  - tasks/notes/20260612-0457-loop-engine-04-contract-kappa-fields.notes.md
  - .ai/context/capabilities.json
  - .ai/hooks/lib/workflow-state.sh
  - assets/hooks/lib/workflow-state.sh
  - .claude/templates/contract.template.md
  - assets/templates/contract.template.md
  - scripts/plan-to-todo.sh
  - assets/templates/helpers/plan-to-todo.sh
  - scripts/ensure-task-workflow.sh
  - assets/templates/helpers/ensure-task-workflow.sh
  - scripts/lib/project-init-lib.sh
  - docs/reference-configs/sprint-contracts.md
  - assets/reference-configs/sprint-contracts.md
  - tests/
```

## Exit Criteria (Machine Verifiable)

```yaml
exit_criteria:
  files_exist:
    - docs/spec.md
  artifacts_exist:
    - .ai/harness/checks/latest.json
    - tasks/notes/20260612-0457-loop-engine-04-contract-kappa-fields.notes.md
  tests_pass:
    - path: tests/helper-scripts.test.ts
    - path: tests/scaffold-parity.test.ts
  commands_succeed:
    - bun test tests/helper-scripts.test.ts tests/scaffold-parity.test.ts
    - bash scripts/check-task-workflow.sh --strict
  files_contain:
    - path: .claude/templates/contract.template.md
      pattern: "Delegation Fields"
    - path: assets/templates/contract.template.md
      pattern: "permission_scope"
    - path: docs/reference-configs/sprint-contracts.md
      pattern: "verify-contract.sh.*backward compatible"
  qa_scores:
    - dimension: functionality
      min: 7
  manual_checks:
    - "Evaluator review file recommends pass"
```

## Acceptance Notes (Human Review)

- Functional behavior: contract templates and plan projection now include nullable `budget`, conservative `permission_scope`, and role defaults for parent/worker/verifier.
- Edge cases: contract YAML readers now select the YAML block that contains `allowed_paths`, so adding an earlier `delegation` block does not break scope checks or path-reference checks.
- Regression risks: `verify-contract.sh` still gates only existing exit criteria; κ fields are metadata only until `contract-run` consumes them.

## Rollback Point

- Commit / checkpoint: row4 branch before finish.
- Revert strategy: revert the row4 commit; no runtime state snapshot or classifier routing behavior is changed by this slice.
