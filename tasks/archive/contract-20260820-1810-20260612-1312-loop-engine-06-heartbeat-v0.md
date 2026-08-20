> **Archived**: 2026-08-20 18:10
> **Related Plan**: plans/archive/plan-20260612-1312-loop-engine-06-heartbeat-v0.md
> **Outcome**: Superseded
> **Lifecycle**: contract
> **Parent Run ID**: orphan-family-sweep

# Sprint Contract: loop-engine-06-heartbeat-v0

> **Status**: Fulfilled
> **Plan**: plans/plan-20260612-1312-loop-engine-06-heartbeat-v0.md
> **Owner**: chris
> **Capability ID**: root
> **Last Updated**: 2026-06-12 13:28
> **Review File**: `tasks/reviews/20260612-1312-loop-engine-06-heartbeat-v0.review.md`
> **Notes File**: `tasks/notes/20260612-1312-loop-engine-06-heartbeat-v0.notes.md`

## Goal

Add a repo-local heartbeat triage runner that can be invoked by cron/loop, writes `.ai/harness/triage/inbox.md`, records one entry each for workflow health, sprint next task, and pending architecture drift requests, and documents the scheduler contract without installing a persistent scheduler.

## Scope

- In scope: `scripts/heartbeat-triage.sh`, distributed helper parity, triage runtime surface/ignore contract, focused tests, and scheduler documentation.
- Out of scope: installing launchd/crontab jobs, autonomous task execution, child-agent spawning, PR creation, heartbeat adoption analytics beyond a scheduled review note, or changing hook dispatch.

## Workflow Inventory

- Source plan: `plans/plan-20260612-1312-loop-engine-06-heartbeat-v0.md`
- Deferred-goal ledger: `tasks/todo.md`
- Review file: `tasks/reviews/20260612-1312-loop-engine-06-heartbeat-v0.review.md`
- Notes file: `tasks/notes/20260612-1312-loop-engine-06-heartbeat-v0.notes.md`
- Checks file: `.ai/harness/checks/latest.json`
- Run snapshots: `.ai/harness/runs/`
- Scope gate: edit only paths listed under `allowed_paths`; update this contract before widening scope.
- Completion gate: `scripts/verify-sprint.sh` must see this contract pass, the review recommend pass, and `## External Acceptance Advice` pass or record a manual override.

## Allowed Paths

```yaml
allowed_paths:
  - .ai/harness/triage/.gitkeep
  - .ai/harness/workflow-contract.json
  - .gitignore
  - assets/templates/helpers/heartbeat-triage.sh
  - assets/reference-configs/heartbeat-triage.md
  - assets/workflow-contract.v1.json
  - docs/reference-configs/heartbeat-triage.md
  - docs/spec.md
  - plans/
  - scripts/heartbeat-triage.sh
  - scripts/lib/project-init-lib.sh
  - tasks/todo.md
  - tasks/contracts/20260612-1312-loop-engine-06-heartbeat-v0.contract.md
  - tasks/reviews/20260612-1312-loop-engine-06-heartbeat-v0.review.md
  - tasks/notes/20260612-1312-loop-engine-06-heartbeat-v0.notes.md
  - .ai/context/capabilities.json
  - tests/heartbeat-triage.test.ts
  - tests/bootstrap-files.test.ts
  - tests/create-project-dirs.runtime.test.ts
  - tests/helper-scripts.test.ts
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
    - scripts/heartbeat-triage.sh
    - assets/templates/helpers/heartbeat-triage.sh
    - assets/reference-configs/heartbeat-triage.md
    - docs/reference-configs/heartbeat-triage.md
    - .ai/harness/triage/.gitkeep
  artifacts_exist:
    - .ai/harness/checks/latest.json
    - tasks/notes/20260612-1312-loop-engine-06-heartbeat-v0.notes.md
  tests_pass:
    - path: tests/heartbeat-triage.test.ts
  commands_succeed:
    - bun test tests/bootstrap-files.test.ts tests/migration-script.test.ts tests/scaffold-parity.test.ts tests/workflow-contract.test.ts
    - bash scripts/check-task-workflow.sh --strict
  files_contain:
    - path: scripts/heartbeat-triage.sh
      pattern: "check-task-workflow.sh --strict"
    - path: scripts/heartbeat-triage.sh
      pattern: "sprint-backlog.sh next"
    - path: scripts/heartbeat-triage.sh
      pattern: "docs/architecture/requests"
    - path: docs/reference-configs/heartbeat-triage.md
      pattern: "cron"
    - path: docs/reference-configs/heartbeat-triage.md
      pattern: "Adoption review"
  qa_scores:
    - dimension: functionality
      min: 7
  manual_checks:
    - "Evaluator review file recommends pass"
```

## Acceptance Notes (Human Review)

- Functional behavior: `scripts/heartbeat-triage.sh run` writes append-only inbox entries plus JSON run snapshots for workflow health, sprint-next, and architecture drift requests; three scheduled proof runs produced all three entry classes.
- Edge cases: workflow-check failures become inbox findings while the runner exits 0; no active sprint marker falls back to a read-only sprint-file scan.
- Regression risks: persistent scheduling is intentionally not installed by repo code, so adoption depends on a host-local cron/loop wrapper after the two-week review.

## Rollback Point

- Commit / checkpoint: row6 branch `codex/loop-engine-06-heartbeat-v0-clean` before finish commit.
- Revert strategy: revert the row6 commit to remove the heartbeat helper, docs, manifest/template registration, tests, and tracked triage directory placeholder; runtime inbox/run snapshots are ignored state.
