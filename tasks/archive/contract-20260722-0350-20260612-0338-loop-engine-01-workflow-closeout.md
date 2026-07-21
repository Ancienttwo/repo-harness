# Sprint Contract: loop-engine-01-workflow-closeout

> **Status**: Fulfilled
> **Plan**: plans/plan-20260612-0338-loop-engine-01-workflow-closeout.md
> **Owner**: chris
> **Capability ID**: root
> **Last Updated**: 2026-06-12 03:41
> **Review File**: `tasks/reviews/20260612-0338-loop-engine-01-workflow-closeout.review.md`
> **Notes File**: `tasks/notes/20260612-0338-loop-engine-01-workflow-closeout.notes.md`

## Goal

Close the workflow ledger for `loop-engine-01-snapshot-and-nl-table` without
changing state snapshot runtime behavior, advancing A/B eval, or cutting over
the prompt classifier.

## Scope

- In scope: sprint backlog row 1 closeout, loop-engine-01 acceptance review,
  closeout review, notes, and verification evidence for the already-merged
  `ff13087` implementation.
- Out of scope: state snapshot implementation changes, routing A/B eval,
  shadow injection, classifier deletion, contract-run, heartbeat, or cleanup of
  unrelated active worktrees.

## Workflow Inventory

- Source plan: `plans/plan-20260612-0338-loop-engine-01-workflow-closeout.md`
- Deferred-goal ledger: `tasks/todo.md`
- Review file: `tasks/reviews/20260612-0338-loop-engine-01-workflow-closeout.review.md`
- Notes file: `tasks/notes/20260612-0338-loop-engine-01-workflow-closeout.notes.md`
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
  - tasks/sprints/20260612-0236-loop-engine.sprint.md
  - tasks/contracts/20260612-0338-loop-engine-01-workflow-closeout.contract.md
  - tasks/reviews/20260612-0245-loop-engine-01-state-snapshot-nl-decision-table.review.md
  - tasks/reviews/20260612-0338-loop-engine-01-workflow-closeout.review.md
  - tasks/notes/20260612-0338-loop-engine-01-workflow-closeout.notes.md
  - src/cli/hook/state-snapshot.ts
  - src/cli/hook-entry.ts
  - docs/reference-configs/loop-engine-nl-decision-table.md
  - tests/cli/state-snapshot.test.ts
```

## Exit Criteria (Machine Verifiable)

```yaml
exit_criteria:
  files_exist:
    - docs/spec.md
    - tasks/sprints/20260612-0236-loop-engine.sprint.md
    - tasks/reviews/20260612-0245-loop-engine-01-state-snapshot-nl-decision-table.review.md
    - src/cli/hook/state-snapshot.ts
    - src/cli/hook-entry.ts
    - docs/reference-configs/loop-engine-nl-decision-table.md
    - tests/cli/state-snapshot.test.ts
  artifacts_exist:
    - .ai/harness/checks/latest.json
    - tasks/notes/20260612-0338-loop-engine-01-workflow-closeout.notes.md
  tests_pass:
    - path: tests/cli/state-snapshot.test.ts
  commands_succeed:
    - bash scripts/check-task-workflow.sh --strict
    - bash scripts/check-task-sync.sh
    - test "$(bun src/cli/hook-entry.ts state-snapshot --json | wc -c | tr -d ' ')" -le 1024
  qa_scores:
    - dimension: functionality
      min: 8
    - dimension: code quality
      min: 8
  manual_checks:
    - "Evaluator review file recommends pass"
```

## Acceptance Notes (Human Review)

- Functional behavior: workflow ledger records `ff13087` as accepted and leaves
  `loop-engine-02-routing-ab-eval` as the next unstarted backlog row.
- Edge cases: mainline handoff freshness is handled separately in the primary
  worktree because `.ai/harness/handoff/*` is runtime state and not part of the
  closeout branch diff.
- Regression risks: low; no runtime code was changed in this closeout slice.

## Rollback Point

- Commit / checkpoint: `ff13087` for the implementation; this closeout branch
  carries only ledger and review updates.
- Revert strategy: revert the closeout branch diff; state snapshot runtime code
  remains owned by `ff13087`.
