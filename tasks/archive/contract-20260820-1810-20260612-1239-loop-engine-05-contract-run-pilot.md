> **Archived**: 2026-08-20 18:10
> **Related Plan**: plans/archive/plan-20260612-1239-loop-engine-05-contract-run-pilot.md
> **Outcome**: Superseded
> **Lifecycle**: contract
> **Parent Run ID**: orphan-family-sweep

# Sprint Contract: loop-engine-05-contract-run-pilot

> **Status**: Fulfilled
> **Plan**: plans/plan-20260612-1239-loop-engine-05-contract-run-pilot.md
> **Owner**: chris
> **Capability ID**: root
> **Last Updated**: 2026-06-12 12:39
> **Review File**: `tasks/reviews/20260612-1239-loop-engine-05-contract-run-pilot.review.md`
> **Notes File**: `tasks/notes/20260612-1239-loop-engine-05-contract-run-pilot.notes.md`

## Goal

Add a repo-local `contract-run` helper that runs a contract package through explicit worker and verifier child commands, enforces the contract budget before spawning children, and records a run manifest suitable for the next delegation pilot.

## Scope

- In scope: `scripts/contract-run.ts`, distributed helper parity, workflow manifest/install surfaces, tests for worker/verifier orchestration and budget overrun, and row 5 review/notes/sprint evidence.
- Out of scope: unattended scheduler/heartbeat, hook dispatch changes, real provider-specific Claude/Codex spawning defaults, multi-candidate search, or replacing `contract-worktree.sh finish`.

## Workflow Inventory

- Source plan: `plans/plan-20260612-1239-loop-engine-05-contract-run-pilot.md`
- Deferred-goal ledger: `tasks/todo.md`
- Review file: `tasks/reviews/20260612-1239-loop-engine-05-contract-run-pilot.review.md`
- Notes file: `tasks/notes/20260612-1239-loop-engine-05-contract-run-pilot.notes.md`
- Checks file: `.ai/harness/checks/latest.json`
- Run snapshots: `.ai/harness/runs/`
- Scope gate: edit only paths listed under `allowed_paths`; update this contract before widening scope.
- Completion gate: `scripts/verify-sprint.sh` must see this contract pass, the review recommend pass, and `## External Acceptance Advice` pass or record a manual override.

## Allowed Paths

```yaml
allowed_paths:
  - assets/templates/helpers/contract-run.ts
  - assets/workflow-contract.v1.json
  - .ai/harness/workflow-contract.json
  - docs/spec.md
  - plans/
  - scripts/contract-run.ts
  - scripts/lib/project-init-lib.sh
  - tasks/sprints/20260612-0236-loop-engine.sprint.md
  - tasks/todo.md
  - tasks/contracts/20260612-1239-loop-engine-05-contract-run-pilot.contract.md
  - tasks/reviews/20260612-1239-loop-engine-05-contract-run-pilot.review.md
  - tasks/notes/20260612-1239-loop-engine-05-contract-run-pilot.notes.md
  - .ai/context/capabilities.json
  - tests/contract-run.test.ts
  - tests/bootstrap-files.test.ts
  - tests/migration-script.test.ts
  - tests/scaffold-parity.test.ts
  - tests/workflow-contract.test.ts
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
    - scripts/contract-run.ts
    - assets/templates/helpers/contract-run.ts
  artifacts_exist:
    - .ai/harness/checks/latest.json
    - tasks/notes/20260612-1239-loop-engine-05-contract-run-pilot.notes.md
  tests_pass:
    - path: tests/contract-run.test.ts
  commands_succeed:
    - bun test tests/bootstrap-files.test.ts tests/migration-script.test.ts tests/workflow-contract.test.ts
    - bash scripts/check-task-workflow.sh --strict
  files_contain:
    - path: scripts/contract-run.ts
      pattern: "CONTRACT_RUN_ROLE"
    - path: scripts/contract-run.ts
      pattern: "budget_exceeded"
    - path: assets/workflow-contract.v1.json
      pattern: "contract-run.ts"
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
