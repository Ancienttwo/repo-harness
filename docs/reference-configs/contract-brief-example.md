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
- Checks file: `.ai/harness/checks/latest.json`
- Run snapshots: `.ai/harness/runs/`
- Scope gate: edit only paths listed under `allowed_paths`; update this contract before widening scope.
- Completion gate: `repo-harness run verify-sprint` must see this contract pass, the review recommend pass, and `## External Acceptance Advice` pass or record a manual override.

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
    tool_calls: 4
    wall_time_minutes: 20
  permission_scope:
    mode: inherit_allowed_paths
    writable_paths: []
    network: off
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
  files_contain:
    - path: scripts/check-task-sync.sh
      pattern: "--json"
  tests_pass:
    - path: tests/helper-scripts.test.ts
  commands_succeed:
    - diff -q scripts/check-task-sync.sh assets/templates/helpers/check-task-sync.sh
    - bash scripts/check-task-sync.sh --json | grep -q '"status"'
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

- Commit / checkpoint: (pre-change HEAD)
- Revert strategy: revert the single commit that adds `--json`; no data migration involved.

---

> **What good looks like**: every section above carries this task's actual specifics instead of template prose — `## Why` names a real downstream consumer and the failure mode of skipping the work, `allowed_paths` lists exactly the three files the worker will touch (not a whole directory), and `exit_criteria` are commands that already exist in this repo today: `files_contain` and the `grep` in `commands_succeed` fail right now and only pass once the described `--json` mode actually ships, while `diff -q` guards the mirror obligation the whole time. That is what `repo-harness run contract-run preflight` checks for, and what a worker should be able to paste as evidence before reporting done.
