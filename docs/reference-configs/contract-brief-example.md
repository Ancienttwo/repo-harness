# Task Contract: check-task-sync-json-mode

> **Status**: Active
> **Plan**: plans/plan-20260701-0930-check-task-sync-json-mode.md
> **Task Profile**: code-change
> **Owner**: example-owner
> **Capability ID**: root
> **Last Updated**: 2026-07-01 09:30
> **Review File**: `tasks/reviews/20260701-0930-check-task-sync-json-mode.review.md`
> **Notes File**: `tasks/notes/20260701-0930-check-task-sync-json-mode.notes.md`

## Why

CI and other automation that call `scripts/check-task-sync.sh` today can only branch on its exit code and hand-parse stdout text, which breaks the moment the wording changes. `maintenance-triage.sh` and `contract-run.ts` already expose `--json` for the same reason. Without a matching machine-readable mode here, anything that wants task-sync detail beyond pass/fail has to re-implement fragile text scraping that silently drifts out of sync with the script's real behavior.

## Goal

Add a `--json` flag to `scripts/check-task-sync.sh` that, when passed, prints a single JSON object to stdout with the fields `status` (`pass` or `fail`), `has_task_sync_change`, `has_non_task_change`, and `message`, computed from the same verdict logic the text mode already uses, while leaving the default text-mode output and exit codes unchanged.

## Scope

- In scope: the `--json` flag and JSON emission in `scripts/check-task-sync.sh`; its byte-identical mirror `assets/templates/helpers/check-task-sync.sh`; one `tests/helper-scripts.test.ts` case asserting the JSON shape.
- Out of scope: changing text-mode wording or exit codes; adding `--json` to any other `check-*.sh` script; touching the mirror-parity test added in Phase 3 slice A2.

## Stop Conditions

- Stop and hand back to the parent if the change would require editing a path outside Allowed Paths.
- Stop if an Exit Criteria command cannot be run in this environment.
- Stop if Goal, Scope, or Exit Criteria are internally contradictory.

## Workflow Inventory

- Source plan: `plans/plan-20260701-0930-check-task-sync-json-mode.md`
- Deferred-goal ledger: `tasks/todos.md`
- Review file: `tasks/reviews/20260701-0930-check-task-sync-json-mode.review.md`
- Notes file: `tasks/notes/20260701-0930-check-task-sync-json-mode.notes.md`
- Verification: declare and execute a non-empty Verification Plan. Select its native report explicitly.
- Run snapshots: `.ai/harness/runs/`
- Scope gate: edit only paths listed under `allowed_paths`; update this contract before widening scope.
- Completion gate: `repo-harness run verification-plan execute --repo . --contract <contract> --report-file .ai/harness/runs/<run-id>.report.json` records real declared checks in the selected report; one typed `AcceptanceReceipt` then records `external_pass` or a contract-allowed `user_waiver`, and final `verify-sprint` consumes it without rerunning tests.

## Allowed Paths

```yaml
allowed_paths:
  - scripts/check-task-sync.sh
  - assets/templates/helpers/check-task-sync.sh
  - tests/helper-scripts.test.ts
```

## Evidence Requirements

```yaml
evidence_requirements:
  # Set benchmark to required when this contract consumes the harness profile benchmark matrix.
  benchmark: not_applicable
```

## Delegation Contract

```yaml
delegation:
  budget:
    tokens: null
    runner_invocations: 4
    wall_time_minutes: 20
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
    fallback: null
    brief_is_authoritative: true
```

## Exit Criteria (Machine Verifiable)

```yaml
exit_criteria:
  files_contain:
    - path: scripts/check-task-sync.sh
      pattern: "--json"
```

## Verification Plan

```json
{
  "protocol": 1,
  "checks": [
    {
      "id": "check-task-sync-json-test",
      "kind": "package_test",
      "path": "tests/helper-scripts.test.ts",
      "cwd": ".",
      "phase": "verification",
      "cost": "normal",
      "evidence_policy": "current_exact",
      "necessity": "Covers the check-task-sync JSON behavior described by this contract.",
      "inputs": { "env": [] }
    },
    {
      "id": "check-task-sync-helper-projection",
      "kind": "command",
      "command": "diff -q scripts/check-task-sync.sh assets/templates/helpers/check-task-sync.sh",
      "cwd": ".",
      "phase": "preflight",
      "cost": "normal",
      "evidence_policy": "current_exact",
      "necessity": "The installed helper projection must match its source authority.",
      "inputs": { "env": [] }
    },
    {
      "id": "check-task-sync-json-contract",
      "kind": "command",
      "command": "bash scripts/check-task-sync.sh --json | grep -q '\"status\"'",
      "cwd": ".",
      "phase": "verification",
      "cost": "normal",
      "evidence_policy": "current_exact",
      "necessity": "Confirms the documented JSON command contract is present at runtime.",
      "inputs": { "env": [] }
    }
  ]
}
```

## Acceptance Notes (Human Review)

- Functional behavior:
- Edge cases:
- Regression risks:

## Rollback Point

- Commit / checkpoint: (pre-change HEAD)
- Revert strategy: revert the single commit that adds `--json`; no data migration involved.

---

> **What good looks like**: every section above carries this task's actual specifics instead of template prose — `## Why` names a real downstream consumer and the failure mode of skipping the work, `allowed_paths` lists exactly the three files the worker will touch (not a whole directory), non-executable exit criteria retain `files_contain`, and the canonical `Verification Plan` declares the package test and typed commands that already exist in this repo today. The JSON runtime check fails until the described `--json` mode ships, while the projection `diff -q` guards the mirror obligation throughout. That is what `repo-harness run contract-run preflight` checks for, and what a worker should be able to paste as evidence before reporting done.
