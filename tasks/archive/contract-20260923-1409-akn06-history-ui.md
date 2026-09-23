> **Archived**: 2026-09-23 14:09
> **Related Plan**: plans/archive/plan-20260922-1022-akn06-history-ui.md
> **Outcome**: Superseded
> **Lifecycle**: contract
> **Parent Run ID**: run-20260923-1409
> **Archive Projection V1**: `plans/plan-20260922-1022-akn06-history-ui.md` => `plans/archive/plan-20260922-1022-akn06-history-ui.md`
> **Archive Projection V1**: `tasks/notes/20260922-1022-akn06-history-ui.notes.md` => `tasks/archive/notes-20260923-1409-akn06-history-ui.md`
> **Archive Projection V1**: `tasks/contracts/20260922-1022-akn06-history-ui.contract.md` => `tasks/archive/contract-20260923-1409-akn06-history-ui.md`
> **Archive Projection V1**: `tasks/reviews/20260922-1022-akn06-history-ui.review.md` => `tasks/archive/review-20260923-1409-akn06-history-ui.md`

# Task Contract: akn06-history-ui

> **Status**: Active
> **Plan**: plans/archive/plan-20260922-1022-akn06-history-ui.md
> **Task Profile**: code-change
> <!-- legal values: code-change | docs-only | ledger-closeout | migration | eval-only | delegated-run | bugfix (omit for legacy passthrough); see docs/reference-configs/sprint-contracts.md -->
> **Owner**: ancienttwo
> **Capability ID**: root
> **Last Updated**: 2026-09-22 09:40
> **Review File**: `tasks/archive/review-20260923-1409-akn06-history-ui.md`
> **Notes File**: `tasks/archive/notes-20260923-1409-akn06-history-ui.md`
> **Exemplar**: `docs/reference-configs/contract-brief-example.md`

## Why

Task selection is not represented in URLs and disappearing cards lose context. The verified history reader has no HTTP/browser consumer.

## Goal

Recover exact-ID old Task links through explicit historical context reads with no current-task write authority.

## Scope

- In scope: existing context GET history mode, shared bounded worker, strict URL selectors, current selection navigation and read-only historical evidence.
- Out of scope: new routes/writers, historical readiness/Claim synthesis, arbitrary Git ref/path, installation, merge or native execution.
- Invariant: a history source never creates a current card, Composer fence or ready state; existing current Task draft behavior stays unchanged.

## Stop Conditions

Reject malformed/missing identity and unsupported source coordinates. Do not guess title or archived filename, invent execution status or bypass architecture acceptance.

## Falsifier

An old link loses its exact scope, a late response replaces a different selected Task, history mounts a Composer, or existing draft/IME behavior regresses.

## Workflow Inventory

- Source plan: `plans/archive/plan-20260922-1022-akn06-history-ui.md`
- Deferred-goal ledger: `tasks/todos.md`
- Review file: `tasks/archive/review-20260923-1409-akn06-history-ui.md`
- Notes file: `tasks/archive/notes-20260923-1409-akn06-history-ui.md`
- Checks file: `.ai/harness/checks/latest.json`
- Run snapshots: `.ai/harness/runs/`
- Scope gate: edit only paths listed under `allowed_paths`; update this contract before widening scope.
- Completion gate: run `verify-sprint --prepare-acceptance`, record one typed AcceptanceReceipt under the frozen policy below, then run `verify-sprint`; review Markdown is projection only.

## Change Assessment

```json
{"protocol": 1, "oracles": [{"id": "history", "kind": "deterministic_test", "paths": ["*"]}]}
```

## Acceptance Policy

```json
{"protocol":2,"reviewer":"Codex","source":"codex-plugin","user_waiver":"allowed"}
```

## Allowed Paths

```yaml
allowed_paths:
  - src/core/operator/task-history.ts
  - src/effects/operator/server.ts
  - src/effects/operator/task-history-worker.ts
  - src/operator-web/task-history.ts
  - src/operator-web/task-location.ts
  - src/operator-web/TaskHistory.tsx
  - src/operator-web/App.tsx
  - src/operator-web/i18n.ts
  - src/operator-web/styles.css
  - tests/effects/operator-task-context.test.ts
  - tests/cli/operator-serve.test.ts
  - tests/unit/operator-web-types.test.ts
  - tests/operator-web/operator-interactions.test.tsx
  - tests/operator-web/operator-ui.test.tsx
  - docs/researches/20260922-operator-history-navigation.md
  - docs/architecture/.projection-manifest.json
  - plans/archive/plan-20260922-1022-akn06-history-ui.md
  - tasks/archive/contract-20260923-1409-akn06-history-ui.md
  - tasks/archive/review-20260923-1409-akn06-history-ui.md
  - tasks/archive/notes-20260923-1409-akn06-history-ui.md
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
    - src/core/operator/task-history.ts
    - docs/researches/20260922-operator-history-navigation.md
  artifacts_exist: []
```

## Verification Plan

```json
{
  "protocol": 1,
  "checks": [
    {
      "id": "type",
      "kind": "command",
      "command": "bun run check:type",
      "cwd": ".",
      "phase": "verification",
      "cost": "normal",
      "evidence_policy": "current_exact",
      "necessity": "Historical Task identity, bounded reads and required integrity",
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
      "necessity": "Historical Task identity, bounded reads and required integrity",
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
      "necessity": "Historical Task identity, bounded reads and required integrity",
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
      "necessity": "Historical Task identity, bounded reads and required integrity",
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
      "necessity": "Historical Task identity, bounded reads and required integrity",
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
      "necessity": "Historical Task identity, bounded reads and required integrity",
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
      "necessity": "Historical Task identity, bounded reads and required integrity",
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
      "necessity": "Historical Task identity, bounded reads and required integrity",
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
      "necessity": "Historical Task identity, bounded reads and required integrity",
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
      "necessity": "Historical Task identity, bounded reads and required integrity",
      "inputs": {
        "env": []
      }
    },
    {
      "id": "history",
      "kind": "package_test",
      "path": "tests/effects/operator-task-context.test.ts",
      "cwd": ".",
      "phase": "verification",
      "cost": "normal",
      "evidence_policy": "current_exact",
      "necessity": "History HTTP/browser scope, write separation and current behavior",
      "inputs": {
        "env": []
      }
    },
    {
      "id": "http",
      "kind": "package_test",
      "path": "tests/cli/operator-serve.test.ts",
      "cwd": ".",
      "phase": "verification",
      "cost": "normal",
      "evidence_policy": "current_exact",
      "necessity": "History HTTP/browser scope, write separation and current behavior",
      "inputs": {
        "env": []
      }
    },
    {
      "id": "types",
      "kind": "package_test",
      "path": "tests/unit/operator-web-types.test.ts",
      "cwd": ".",
      "phase": "verification",
      "cost": "normal",
      "evidence_policy": "current_exact",
      "necessity": "History HTTP/browser scope, write separation and current behavior",
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
      "necessity": "History HTTP/browser scope, write separation and current behavior",
      "inputs": {
        "env": []
      }
    },
    {
      "id": "ui",
      "kind": "package_test",
      "path": "tests/operator-web/operator-ui.test.tsx",
      "cwd": ".",
      "phase": "verification",
      "cost": "normal",
      "evidence_policy": "current_exact",
      "necessity": "History HTTP/browser scope, write separation and current behavior",
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
      "necessity": "Shipped browser history route",
      "inputs": {
        "env": []
      }
    }
  ]
}
```

## Acceptance Notes (Human Review)

Only explicit history mode selects historical DTOs. Strict URL/query selectors, no client source coordinates, shared reader budgets, exact source display, no Composer or TaskDiff in history. Current detail/draft behavior passes its existing suite. Browser fixture is not installed/native evidence.

## Rollback Point

Base3b6369985fe53b495135456828ae8e53e8bf6716; remove route mode and browser integration together while retaining prior history source.
