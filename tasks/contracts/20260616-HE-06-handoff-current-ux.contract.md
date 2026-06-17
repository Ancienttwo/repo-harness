# Task Contract: HE-06 Handoff and Current Snapshot UX

> **Status**: Active
> **Plan**: `plans/plan-20260616-HE-06-handoff-current-ux.md`
> **Task Profile**: migration
> **Owner**: Codex
> **Capability ID**: workflow-engine/handoff-current-ux
> **Last Updated**: 2026-06-17
> **Review File**: `tasks/reviews/20260616-HE-06-handoff-current-ux.review.md`
> **Notes File**: `tasks/notes/20260616-HE-06-handoff-current-ux.notes.md`

## Goal

Make handoff restore deterministic while keeping `tasks/current.md` a generated
orientation snapshot rather than a live task source.

## Scope

- In scope: handoff template, handoff CLI status/reason flags, resume freshness checks, handoff docs, and helper tests.
- Out of scope: changing task execution source-of-truth or adding a new persistence layer.

## Allowed Paths

```yaml
allowed_paths:
  - .ai/hooks/lib/workflow-state.sh
  - assets/hooks/lib/workflow-state.sh
  - scripts/prepare-handoff.sh
  - assets/templates/helpers/prepare-handoff.sh
  - scripts/check-task-workflow.sh
  - assets/templates/helpers/check-task-workflow.sh
  - docs/reference-configs/handoff-protocol.md
  - assets/reference-configs/handoff-protocol.md
  - tests/helper-scripts.test.ts
  - plans/plan-20260616-HE-06-handoff-current-ux.md
  - tasks/contracts/20260616-HE-06-handoff-current-ux.contract.md
  - tasks/reviews/20260616-HE-06-handoff-current-ux.review.md
  - tasks/notes/20260616-HE-06-handoff-current-ux.notes.md
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
    - .ai/hooks/lib/workflow-state.sh
    - assets/hooks/lib/workflow-state.sh
    - scripts/prepare-handoff.sh
    - assets/templates/helpers/prepare-handoff.sh
    - docs/reference-configs/handoff-protocol.md
  commands_succeed:
    - grep -n "## Active Artifacts" .ai/hooks/lib/workflow-state.sh
    - grep -n -- "--status" scripts/prepare-handoff.sh
    - grep -n "check_current_resume_freshness" scripts/check-task-workflow.sh
    - grep -n "Read source artifacts first" docs/reference-configs/handoff-protocol.md
    - bun test tests/helper-scripts.test.ts
    - bash scripts/check-task-workflow.sh --strict
  manual_checks:
    - "Evaluator review file recommends pass"
```

## Acceptance Notes (Human Review)

- Functional behavior: handoff exposes active plan, contract, sprint row, review, latest trace, blockers, exact next step, and resume packet.
- Edge cases: strict workflow detects resume packets older than `tasks/current.md`.
- Regression risks: `tasks/current.md` stays derived/read-only and remains out of ordinary hook write paths.

## Rollback Point

- Commit / checkpoint: staged HE-05 batch.
- Revert strategy: restore previous handoff template, CLI wrapper, strict check, docs, and tests.
