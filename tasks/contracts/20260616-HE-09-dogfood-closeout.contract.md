# Task Contract: HE-09 Dogfood Closeout

> **Status**: Fulfilled
> **Plan**: `plans/plan-20260616-HE-09-dogfood-closeout.md`
> **Task Profile**: migration
> **Owner**: Codex
> **Capability ID**: workflow/closeout
> **Last Updated**: 2026-06-17
> **Review File**: `tasks/reviews/20260616-HE-09-dogfood-closeout.review.md`
> **Notes File**: `tasks/notes/20260616-HE-09-dogfood-closeout.notes.md`

## Goal

Close the Harness Engineering Optimization sprint through repo-harness itself:
row completion, review pass, checks snapshot, trace grading, changelog, and
staged closeout evidence without absorbing unrelated dirty files.

## Scope

- In scope: full sprint diff verification, HE-09 filing, final sprint review, sprint checklist status, changelog entry, generated current snapshot if refreshed, and local closeout verification.
- Out of scope: runtime behavior changes, release publishing, pushing a branch, opening a PR, merging to `main`, or cleaning sibling worktrees.

## Allowed Paths

```yaml
allowed_paths:
  - .ai/harness/workflow-contract.json
  - .ai/hooks/
  - .claude/templates/
  - README.md
  - README.zh-CN.md
  - assets/hooks/
  - assets/reference-configs/
  - assets/templates/
  - assets/workflow-contract.v1.json
  - docs/
  - plans/
  - scripts/
  - tasks/contracts/
  - tasks/notes/
  - tasks/reviews/
  - docs/CHANGELOG.md
  - tasks/current.md
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
    parent:
      mode: narrate_and_gatekeep
      purpose: closeout_decision_owner
    explorer:
      mode: read_only
      purpose: artifact_audit
    worker:
      mode: edit_within_allowed_paths
      purpose: closeout_filing
    verifier:
      mode: read_only
      purpose: full_gate_review
```

## Exit Criteria (Machine Verifiable)

```yaml
exit_criteria:
  files_exist:
    - plans/plan-20260616-HE-09-dogfood-closeout.md
    - tasks/contracts/20260616-HE-09-dogfood-closeout.contract.md
    - tasks/reviews/20260616-HE-09-dogfood-closeout.review.md
    - tasks/notes/20260616-HE-09-dogfood-closeout.notes.md
    - docs/CHANGELOG.md
  commands_succeed:
    - bash scripts/check-task-sync.sh
    - bash scripts/check-task-workflow.sh --strict
    - bash scripts/check-architecture-sync.sh
    - bun test
    - bun scripts/inspect-project-state.ts --repo . --format text
    - bash scripts/migrate-project-template.sh --repo . --dry-run
  manual_checks:
    - "Evaluator review file recommends pass"
```

## Acceptance Notes (Human Review)

- Functional behavior: no additional runtime behavior change in HE-09; it validates and closes the full sprint migration diff.
- Edge cases: default `repo-harness-ship` push/PR mode is intentionally not run because the user requested staged phases only.
- Regression risks: full checks cover runtime regressions from HE-01 through HE-08; archive movement remains for the actual ship/finish step.
- Additional closeout gates: run `verify-sprint` and `harness-trace-grade` after
  contract verification, then confirm no unrelated files are staged.

## Rollback Point

- Commit / checkpoint: staged HE-08 batch.
- Revert strategy: remove HE-09 closeout files, revert sprint/changelog updates, and restore the previous active plan marker if needed.
