# Sprint Contract: loop-engine-06-heartbeat-v0

> **Status**: Fulfilled
> **Plan**: plans/plan-20260612-0528-loop-engine-06-heartbeat-v0.md
> **Owner**: chris
> **Capability ID**: root
> **Last Updated**: 2026-06-12 05:35
> **Review File**: `tasks/reviews/20260612-0528-loop-engine-06-heartbeat-v0.review.md`
> **Notes File**: `tasks/notes/20260612-0528-loop-engine-06-heartbeat-v0.notes.md`

## Goal

Add heartbeat triage mode that can be scheduled by cron or a loop, appends workflow/sprint/drift snapshots to `.ai/harness/triage/inbox.md`, and records a two-week adoption review date.

## Scope

- In scope:
  - `scripts/maintenance-triage.sh --heartbeat` mode.
  - Asset helper parity for generated repos.
  - Heartbeat reference documentation with cron and loop examples.
  - Focused tests for three consecutive inbox entries, failed probe capture, and docs parity.
- Out of scope:
  - Installing a user-level cron job automatically.
  - Auto-opening worktrees, approving plans, or merging fixes from heartbeat output.
  - Measuring two-week adoption results in this row; only the review date is scheduled.

## Delegation Fields (κ)

These fields are optional delegation defaults for `contract-run` and child
agent calls. They do not loosen `allowed_paths`, exit criteria, or local
approval policy; omitted values inherit repo policy defaults.

```yaml
delegation:
  budget:
    tokens: null
    tool_calls: null
    wall_time_minutes: null
  permission_scope:
    filesystem: allowed_paths
    network: none
    approvals: owner
  roles:
    parent: narrate_only
    worker: implement_within_contract
    verifier: verify_exit_criteria
```

## Workflow Inventory

- Source plan: `plans/plan-20260612-0528-loop-engine-06-heartbeat-v0.md`
- Deferred-goal ledger: `tasks/todo.md`
- Review file: `tasks/reviews/20260612-0528-loop-engine-06-heartbeat-v0.review.md`
- Notes file: `tasks/notes/20260612-0528-loop-engine-06-heartbeat-v0.notes.md`
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
  - tasks/contracts/20260612-0528-loop-engine-06-heartbeat-v0.contract.md
  - tasks/reviews/20260612-0528-loop-engine-06-heartbeat-v0.review.md
  - tasks/notes/20260612-0528-loop-engine-06-heartbeat-v0.notes.md
  - .ai/context/capabilities.json
  - .gitignore
  - scripts/maintenance-triage.sh
  - assets/templates/helpers/maintenance-triage.sh
  - docs/reference-configs/heartbeat.md
  - assets/reference-configs/heartbeat.md
  - tests/
```

## Exit Criteria (Machine Verifiable)

```yaml
exit_criteria:
  files_exist:
    - docs/spec.md
  artifacts_exist:
    - .ai/harness/checks/latest.json
    - tasks/notes/20260612-0528-loop-engine-06-heartbeat-v0.notes.md
  tests_pass:
    - path: tests/unit/loop-engine-06-heartbeat-v0.test.ts
  commands_succeed:
    - bun test tests/unit/loop-engine-06-heartbeat-v0.test.ts
    - bash scripts/sync-brain-docs.sh --changed docs/reference-configs/harness-overview.md
    - bash scripts/maintenance-triage.sh --heartbeat --inbox .ai/harness/triage/inbox.md
    - bash scripts/check-task-workflow.sh --strict
  files_contain:
    - path: scripts/maintenance-triage.sh
      pattern: "heartbeat_mode"
    - path: docs/reference-configs/heartbeat.md
      pattern: "Cron example"
    - path: tests/unit/loop-engine-06-heartbeat-v0.test.ts
      pattern: "Drift requests: 2"
    - path: .gitignore
      pattern: ".ai/harness/triage/"
  qa_scores:
    - dimension: functionality
      min: 7
  manual_checks:
    - "Evaluator review file recommends pass"
```

## Acceptance Notes (Human Review)

- Functional behavior: heartbeat mode appends one markdown triage entry per run with workflow, sprint next, drift request, and adoption review fields.
- Edge cases: failed probes are captured into the inbox while the heartbeat command still exits 0, so scheduled runs do not disappear after a failed check.
- Regression risks: legacy lessons triage mode remains the default unless `--heartbeat` is passed.

## Rollback Point

- Commit / checkpoint: row6 branch before finish.
- Revert strategy: revert the row6 commit; no hook runtime or prior contract-run behavior is changed.
