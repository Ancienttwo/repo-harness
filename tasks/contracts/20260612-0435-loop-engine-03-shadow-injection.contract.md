# Sprint Contract: loop-engine-03-shadow-injection

> **Status**: Fulfilled
> **Plan**: plans/plan-20260612-0435-loop-engine-03-shadow-injection.md
> **Owner**: chris
> **Capability ID**: root
> **Last Updated**: 2026-06-12 04:35
> **Review File**: `tasks/reviews/20260612-0435-loop-engine-03-shadow-injection.review.md`
> **Notes File**: `tasks/notes/20260612-0435-loop-engine-03-shadow-injection.notes.md`

## Goal

Describe the exact outcome this task must deliver.

## Scope

- In scope:
  - Enable loop-engine shadow injection only after G1 route eval evidence recommends go.
  - Record one prompt-level `.claude/.trace.jsonl` shadow event per prompt while keeping the TS verdict authoritative.
  - Add a bounded summary report for the 14-day or 100-prompt shadow timebox.
- Out of scope:
  - Classifier cutover or deletion.
  - Claude re-verification for row 2; this Goal uses the owner override already recorded there.

## Workflow Inventory

- Source plan: `plans/plan-20260612-0435-loop-engine-03-shadow-injection.md`
- Deferred-goal ledger: `tasks/todo.md`
- Review file: `tasks/reviews/20260612-0435-loop-engine-03-shadow-injection.review.md`
- Notes file: `tasks/notes/20260612-0435-loop-engine-03-shadow-injection.notes.md`
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
  - tasks/contracts/20260612-0435-loop-engine-03-shadow-injection.contract.md
  - tasks/reviews/20260612-0435-loop-engine-03-shadow-injection.review.md
  - tasks/notes/20260612-0435-loop-engine-03-shadow-injection.notes.md
  - .ai/context/capabilities.json
  - .ai/hooks/
  - assets/hooks/
  - scripts/loop-engine-shadow-report.ts
  - .ai/harness/runs/loop-engine-03-shadow-summary.json
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
    - tasks/notes/20260612-0435-loop-engine-03-shadow-injection.notes.md
    - .ai/harness/runs/loop-engine-03-shadow-summary.json
  tests_pass:
    - path: tests/hook-runtime.test.ts
    - path: tests/loop-engine-shadow-report.test.ts
  commands_succeed:
    - bun test tests/hook-runtime.test.ts tests/loop-engine-shadow-report.test.ts tests/workflow-contract.test.ts
    - bun scripts/loop-engine-shadow-report.ts --out .ai/harness/runs/loop-engine-03-shadow-summary.json
    - bun scripts/loop-engine-shadow-report.ts --check --out .ai/harness/runs/loop-engine-03-shadow-summary.json
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
