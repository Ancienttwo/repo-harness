# Task Contract: akn05-task-evidence

> **Status**: Active
> **Plan**: plans/plan-20260922-0655-akn05-task-evidence.md
> **Task Profile**: code-change
> <!-- legal values: code-change | docs-only | ledger-closeout | migration | eval-only | delegated-run | bugfix (omit for legacy passthrough); see docs/reference-configs/sprint-contracts.md -->
> **Owner**: ancienttwo
> **Capability ID**: root
> **Last Updated**: 2026-09-22 06:55
> **Review File**: `tasks/reviews/20260922-0655-akn05-task-evidence.review.md`
> **Notes File**: `tasks/notes/20260922-0655-akn05-task-evidence.notes.md`
> **Exemplar**: `docs/reference-configs/contract-brief-example.md`

## Why

Expose the already recorded task and steer evidence so human supervision can trace receipt and response without inducing domain effects.

## Goal

AKN-05b shared detail shows exact-scope canonical context and bounded historical messages with recorded actor provenance, independent failure and cancellation.

## Scope

- In scope: read-only context/activity integration, original evidence, exact message lookup, page replacement, bilingual UI and tests.
- Out of scope: three-view navigation, write admission, polling, backend changes, native runtime and main merge.
- Invariant: existing Composer keys, drafts, expected fences, POST, ACK and TaskDiff stay unchanged.

## Stop Conditions

- Stop and hand back to the parent if the change would require editing a path outside Allowed Paths.
- Stop if an Exit Criteria command cannot be run in this environment.
- Stop if Goal, Scope, or Exit Criteria are internally contradictory.

## Falsifier

Wrong-task or stale data appears current, an ACK is presented as adoption, or a detail read sends/acknowledges a message.

## Root Cause Evidence

Not applicable: this is a new read-only presentation of existing validated protocols.

## Workflow Inventory

- Source plan: `plans/plan-20260922-0655-akn05-task-evidence.md`
- Deferred-goal ledger: `tasks/todos.md`
- Review file: `tasks/reviews/20260922-0655-akn05-task-evidence.review.md`
- Notes file: `tasks/notes/20260922-0655-akn05-task-evidence.notes.md`
- Checks file: `.ai/harness/checks/latest.json`
- Run snapshots: `.ai/harness/runs/`
- Scope gate: edit only paths listed under `allowed_paths`; update this contract before widening scope.
- Completion gate: run `verify-sprint --prepare-acceptance`, record one typed AcceptanceReceipt under the frozen policy below, then run `verify-sprint`; review Markdown is projection only.

## Change Assessment

```json
{"protocol": 1, "oracles": [{"id": "interactions", "kind": "deterministic_test", "paths": ["*"]}]}
```

## Acceptance Policy

```json
{"protocol":2,"reviewer":"Codex","source":"codex-plugin","user_waiver":"allowed"}
```

## Allowed Paths

```yaml
allowed_paths:
  - src/operator-web/TaskEvidence.tsx
  - src/operator-web/App.tsx
  - src/operator-web/i18n.ts
  - src/operator-web/styles.css
  - src/operator-web/fixture.ts
  - tests/operator-web/operator-ui.test.tsx
  - tests/operator-web/operator-interactions.test.tsx
  - docs/researches/20260922-operator-task-evidence.md
  - docs/architecture/.projection-manifest.json
  - plans/plan-20260922-0655-akn05-task-evidence.md
  - tasks/contracts/20260922-0655-akn05-task-evidence.contract.md
  - tasks/reviews/20260922-0655-akn05-task-evidence.review.md
  - tasks/notes/20260922-0655-akn05-task-evidence.notes.md
  - tasks/todos.md
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
    runner_invocations: null
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
    fallback: null
    brief_is_authoritative: true
```

## Exit Criteria (Machine Verifiable)

```yaml
exit_criteria:
  files_exist:
    - src/operator-web/TaskEvidence.tsx
    - docs/researches/20260922-operator-task-evidence.md
  artifacts_exist: []
```

## Verification Plan

```json
{
  "protocol": 1,
  "checks": [
    {
      "id": "automation",
      "kind": "package_test",
      "path": "tests/operator-web/operator-ui.test.tsx",
      "cwd": ".",
      "phase": "verification",
      "cost": "normal",
      "evidence_policy": "current_exact",
      "necessity": "Task evidence scope/lifetimes, existing Composer and diff regressions, browser integration and required integrity",
      "inputs": {
        "env": []
      }
    },
    {
      "id": "interactions",
      "kind": "package_test",
      "path": "tests/operator-web/operator-interactions.test.tsx",
      "cwd": ".",
      "phase": "verification",
      "cost": "normal",
      "evidence_policy": "current_exact",
      "necessity": "Task evidence scope/lifetimes, existing Composer and diff regressions, browser integration and required integrity",
      "inputs": {
        "env": []
      }
    },
    {
      "id": "collaboration",
      "kind": "package_test",
      "path": "tests/operator-web/operator-collaboration.test.tsx",
      "cwd": ".",
      "phase": "verification",
      "cost": "normal",
      "evidence_policy": "current_exact",
      "necessity": "Task evidence scope/lifetimes, existing Composer and diff regressions, browser integration and required integrity",
      "inputs": {
        "env": []
      }
    },
    {
      "id": "diff",
      "kind": "package_test",
      "path": "tests/operator-web/operator-task-diff.test.tsx",
      "cwd": ".",
      "phase": "verification",
      "cost": "normal",
      "evidence_policy": "current_exact",
      "necessity": "Task evidence scope/lifetimes, existing Composer and diff regressions, browser integration and required integrity",
      "inputs": {
        "env": []
      }
    },
    {
      "id": "type",
      "kind": "command",
      "command": "bun run check:type",
      "cwd": ".",
      "phase": "verification",
      "cost": "normal",
      "evidence_policy": "current_exact",
      "necessity": "Task evidence scope/lifetimes, existing Composer and diff regressions, browser integration and required integrity",
      "inputs": {
        "env": []
      }
    },
    {
      "id": "browser-build",
      "kind": "command",
      "command": "bun run build:operator-web",
      "cwd": ".",
      "phase": "verification",
      "cost": "normal",
      "evidence_policy": "current_exact",
      "necessity": "Task evidence scope/lifetimes, existing Composer and diff regressions, browser integration and required integrity",
      "inputs": {
        "env": []
      }
    },
    {
      "id": "hooks",
      "kind": "command",
      "command": "bun run check:hooks",
      "cwd": ".",
      "phase": "verification",
      "cost": "normal",
      "evidence_policy": "current_exact",
      "necessity": "Task evidence scope/lifetimes, existing Composer and diff regressions, browser integration and required integrity",
      "inputs": {
        "env": []
      }
    },
    {
      "id": "helpers",
      "kind": "command",
      "command": "bun run check:helpers",
      "cwd": ".",
      "phase": "verification",
      "cost": "normal",
      "evidence_policy": "current_exact",
      "necessity": "Task evidence scope/lifetimes, existing Composer and diff regressions, browser integration and required integrity",
      "inputs": {
        "env": []
      }
    },
    {
      "id": "reference-configs",
      "kind": "command",
      "command": "bun run check:reference-configs",
      "cwd": ".",
      "phase": "verification",
      "cost": "normal",
      "evidence_policy": "current_exact",
      "necessity": "Task evidence scope/lifetimes, existing Composer and diff regressions, browser integration and required integrity",
      "inputs": {
        "env": []
      }
    },
    {
      "id": "deploy-sql",
      "kind": "command",
      "command": "bash scripts/check-deploy-sql-order.sh",
      "cwd": ".",
      "phase": "verification",
      "cost": "normal",
      "evidence_policy": "current_exact",
      "necessity": "Task evidence scope/lifetimes, existing Composer and diff regressions, browser integration and required integrity",
      "inputs": {
        "env": []
      }
    },
    {
      "id": "architecture",
      "kind": "command",
      "command": "bash scripts/check-architecture-sync.sh",
      "cwd": ".",
      "phase": "verification",
      "cost": "normal",
      "evidence_policy": "current_exact",
      "necessity": "Task evidence scope/lifetimes, existing Composer and diff regressions, browser integration and required integrity",
      "inputs": {
        "env": []
      }
    },
    {
      "id": "task-sync",
      "kind": "command",
      "command": "bash scripts/check-task-sync.sh",
      "cwd": ".",
      "phase": "verification",
      "cost": "normal",
      "evidence_policy": "current_exact",
      "necessity": "Task evidence scope/lifetimes, existing Composer and diff regressions, browser integration and required integrity",
      "inputs": {
        "env": []
      }
    },
    {
      "id": "task-workflow",
      "kind": "command",
      "command": "bash scripts/check-task-workflow.sh --strict",
      "cwd": ".",
      "phase": "verification",
      "cost": "normal",
      "evidence_policy": "current_exact",
      "necessity": "Task evidence scope/lifetimes, existing Composer and diff regressions, browser integration and required integrity",
      "inputs": {
        "env": []
      }
    },
    {
      "id": "project-state",
      "kind": "command",
      "command": "bun scripts/inspect-project-state.ts --repo . --format text",
      "cwd": ".",
      "phase": "verification",
      "cost": "normal",
      "evidence_policy": "current_exact",
      "necessity": "Task evidence scope/lifetimes, existing Composer and diff regressions, browser integration and required integrity",
      "inputs": {
        "env": []
      }
    },
    {
      "id": "init-dry-run",
      "kind": "command",
      "command": "bun src/cli/index.ts init --repo . --dry-run",
      "cwd": ".",
      "phase": "verification",
      "cost": "normal",
      "evidence_policy": "current_exact",
      "necessity": "Task evidence scope/lifetimes, existing Composer and diff regressions, browser integration and required integrity",
      "inputs": {
        "env": []
      }
    }
  ]
}
```

## Acceptance Notes (Human Review)

Existing UI suites own this interaction boundary; extend them rather than adding a task-named suite. Inspect built wide/narrow EN/ZH fixture. Architecture and canonical verification precede one semantic acceptance. This does not prove native execution or complete AKN-05.

## Rollback Point

- Base: 8895f3589ce9d064de8a0edbaee231ea8be46c3f
- Remove read-only detail integration; durable records remain untouched.

