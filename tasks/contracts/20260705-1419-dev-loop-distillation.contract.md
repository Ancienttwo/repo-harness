# Task Contract: dev-loop-distillation

> **Status**: Active
> **Plan**: plans/plan-20260705-1419-dev-loop-distillation.md
> **Task Profile**: code-change
> **Owner**: ancienttwo
> **Capability ID**: root
> **Last Updated**: 2026-07-05 14:19
> **Review File**: `tasks/reviews/20260705-1419-dev-loop-distillation.review.md`
> **Notes File**: `tasks/notes/20260705-1419-dev-loop-distillation.notes.md`

## Why

Delegated executor models currently receive only task text plus allowed paths from the brief; they never see purpose, are never required to self-verify before reporting, and are never told when to stop and escalate. Distilling these instructions into the file-coupled brief surface (template + generated prompts + preflight) is what lets weaker models inherit the dev loop's quality guarantees. The engine-integrity fixes ensure the packaged runtime that `repo-harness run` executes matches what we develop and test. If this ships wrong, every downstream generated repo inherits a brief surface that under-informs its executors.

## Goal

Execute the dev-loop distillation Phase 3 plan: reconcile helper mirrors, auto-refresh the resume packet, add Why/Stop-Conditions/Exemplar to the contract brief surface, upgrade contract-run worker/verifier prompts with mandatory self-verification and stop/escalation contracts, gate ## Why in preflight, ship a golden example brief, add the finish-time memory advisory, record runner usage in the contract-run manifest, teach the four repo-harness skills, and pass the full verification battery.

## Scope

- In scope: slices 0, A1-A3, B1-B4, C1, D1(reduced), G1, F1 exactly as specified in the captured plan.
- Out of scope: touching assets/hooks/codex-delegation-advisor.sh or .ai/hooks/codex-delegation-advisor.sh (delivered by ca76def on the base branch); cross-runner auto-degradation inside contract-run; maintenance-triage --write; porting native-subagent hooks; superpowers imports; weakening existing gates; any git push or PR creation.
- slice B5 (projection-time [Brief]/[BriefPreflight] advisory in plan-to-todo) — delegated to parallel branch codex/projection-brief-advisory; revisit trigger recorded in the plan Task Breakdown

## Stop Conditions

- Stop and hand back to the parent if the change would require editing a path outside Allowed Paths.
- Stop if an Exit Criteria command cannot be run in this environment.
- Stop if Goal, Scope, or Exit Criteria are internally contradictory.

## Workflow Inventory

- Source plan: `plans/plan-20260705-1419-dev-loop-distillation.md`
- Deferred-goal ledger: `tasks/todos.md`
- Review file: `tasks/reviews/20260705-1419-dev-loop-distillation.review.md`
- Notes file: `tasks/notes/20260705-1419-dev-loop-distillation.notes.md`
- Checks file: `.ai/harness/checks/latest.json`
- Run snapshots: `.ai/harness/runs/`
- Scope gate: edit only paths listed under `allowed_paths`; update this contract before widening scope.
- Completion gate: `scripts/verify-sprint.sh` must see this contract pass, the review recommend pass, and `## External Acceptance Advice` pass or record a manual override.

## Allowed Paths

```yaml
allowed_paths:
  - scripts/
  - assets/
  - tests/
  - .claude/templates/
  - .ai/hooks/
  - .ai/context/
  - .ai/harness/
  - docs/reference-configs/
  - docs/researches/
  - docs/architecture/
  - docs/spec.md
  - plans/
  - tasks/
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
  runner:
    preferred:
      - subagent
      - codex-exec
      - main-thread
    fallback: main-thread
    brief_is_authoritative: true
```

## Exit Criteria (Machine Verifiable)

```yaml
exit_criteria:
  files_exist:
    - docs/reference-configs/contract-brief-example.md
  artifacts_exist:
    - .ai/harness/checks/latest.json
    - tasks/notes/20260705-1419-dev-loop-distillation.notes.md
  tests_pass:
    - path: tests/contract-run.test.ts
    - path: tests/helper-scripts.test.ts
  commands_succeed:
    - bun test
    - bun run check:hooks
    - bash scripts/check-deploy-sql-order.sh
    - bash scripts/check-architecture-sync.sh
    - bash scripts/check-task-sync.sh
    - bash scripts/migrate-project-template.sh --repo . --dry-run
    - diff -q scripts/contract-run.ts assets/templates/helpers/contract-run.ts
    - diff -q scripts/plan-to-todo.sh assets/templates/helpers/plan-to-todo.sh
    - diff -q scripts/verify-sprint.sh assets/templates/helpers/verify-sprint.sh
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

- Commit / checkpoint: ca76def (stack base)
- Revert strategy: drop branch codex/dev-loop-distillation + its worktree; stack base codex/advisor-file-coupled-nudge and main unaffected
