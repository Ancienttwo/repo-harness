# Task Contract: akn04-repository-snapshot

> **Status**: Active
> **Plan**: plans/plan-20260922-0519-akn04-repository-snapshot.md
> **Task Profile**: code-change
> <!-- legal values: code-change | docs-only | ledger-closeout | migration | eval-only | delegated-run | bugfix (omit for legacy passthrough); see docs/reference-configs/sprint-contracts.md -->
> **Owner**: ancienttwo
> **Capability ID**: root
> **Last Updated**: 2026-09-22 04:50
> **Review File**: `tasks/reviews/20260922-0519-akn04-repository-snapshot.review.md`
> **Notes File**: `tasks/notes/20260922-0519-akn04-repository-snapshot.notes.md`
> **Exemplar**: `docs/reference-configs/contract-brief-example.md`

## Why

Repository-scoped observation must avoid collecting unrelated repositories and multiplying provider concurrency during cancellation.

## Goal

Implement AKN-04d1 scoped Fleet GET with one shared exit-held collector, bounded scope queue, versioned IPC and strict browser envelope.

## Scope

- In scope: exact repository collector selection; scope IPC; shared Fleet admission; repository GET and transport; owning tests.
- Out of scope: automation summary (AKN-04d2), refresh UI, native execution, existing write guards, installation and main merge.
- Invariant: only original registry and Fleet readers define repository facts; no process slot release before cleanup settlement.

## Stop Conditions

- Stop and hand back to the parent if the change would require editing a path outside Allowed Paths.
- Stop if an Exit Criteria command cannot be run in this environment.
- Stop if Goal, Scope, or Exit Criteria are internally contradictory.

## Falsifier

An unrelated repository/provider is read; concurrent scopes exceed the single collector limit; cancellation frees admission before process exit; wrong repository/epoch/generation is accepted; a GET writes authority.

## Root Cause Evidence

- root_cause: server snapshot cancellation cleared inFlight while the collector promise still owned cleanup, allowing a second process round before the first exited.
- repro: bun test tests/cli/operator-serve.test.ts --test-name-pattern 'cancels a sole Fleet'
- regression_guard: tests/cli/operator-serve.test.ts asserts no overlap while the cancelled collector delays settlement by300ms.
- pre_fix_failure_artifact: .ai/harness/runs/akn04-repository-snapshot/overlap-before.log records expected false / received true; overlap-after.log passes after exit-held admission.

## Workflow Inventory

- Source plan: `plans/plan-20260922-0519-akn04-repository-snapshot.md`
- Deferred-goal ledger: `tasks/todos.md`
- Review file: `tasks/reviews/20260922-0519-akn04-repository-snapshot.review.md`
- Notes file: `tasks/notes/20260922-0519-akn04-repository-snapshot.notes.md`
- Checks file: `.ai/harness/checks/latest.json`
- Run snapshots: `.ai/harness/runs/`
- Scope gate: edit only paths listed under `allowed_paths`; update this contract before widening scope.
- Completion gate: run `verify-sprint --prepare-acceptance`, record one typed AcceptanceReceipt under the frozen policy below, then run `verify-sprint`; review Markdown is projection only.

## Change Assessment

```json
{"protocol": 1, "oracles": [{"id": "server", "kind": "deterministic_test", "paths": ["*"]}]}
```

## Acceptance Policy

```json
{"protocol":2,"reviewer":"Codex","source":"codex-plugin","user_waiver":"allowed"}
```

## Allowed Paths

```yaml
allowed_paths:
  - src/core/operator/repository-snapshot.ts
  - src/effects/operator/server.ts
  - src/effects/operator/fleet-collector-process.ts
  - src/effects/fleet/board.ts
  - src/operator-web/repository-snapshot.ts
  - tests/cli/operator-serve.test.ts
  - tests/effects/fleet-collector-process.test.ts
  - tests/effects/fleet-board.test.ts
  - tests/unit/operator-web-types.test.ts
  - tests/effects/operator-write-boundary.test.ts
  - docs/researches/20260922-operator-repository-snapshot.md
  - docs/architecture/.projection-manifest.json
  - plans/plan-20260922-0519-akn04-repository-snapshot.md
  - tasks/contracts/20260922-0519-akn04-repository-snapshot.contract.md
  - tasks/reviews/20260922-0519-akn04-repository-snapshot.review.md
  - tasks/notes/20260922-0519-akn04-repository-snapshot.notes.md
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
    - src/core/operator/repository-snapshot.ts
    - docs/researches/20260922-operator-repository-snapshot.md
  artifacts_exist: []
```

## Verification Plan

```json
{
  "protocol": 1,
  "checks": [
    {
      "id": "collector",
      "kind": "package_test",
      "path": "tests/effects/fleet-board.test.ts",
      "cwd": ".",
      "phase": "verification",
      "cost": "normal",
      "evidence_policy": "current_exact",
      "necessity": "Scope isolation and exit-held collector admission",
      "inputs": {
        "env": []
      }
    },
    {
      "id": "ipc",
      "kind": "package_test",
      "path": "tests/effects/fleet-collector-process.test.ts",
      "cwd": ".",
      "phase": "verification",
      "cost": "normal",
      "evidence_policy": "current_exact",
      "necessity": "Scope isolation and exit-held collector admission",
      "inputs": {
        "env": []
      }
    },
    {
      "id": "server",
      "kind": "package_test",
      "path": "tests/cli/operator-serve.test.ts",
      "cwd": ".",
      "phase": "verification",
      "cost": "normal",
      "evidence_policy": "current_exact",
      "necessity": "Scope isolation and exit-held collector admission",
      "inputs": {
        "env": []
      }
    },
    {
      "id": "browser",
      "kind": "package_test",
      "path": "tests/unit/operator-web-types.test.ts",
      "cwd": ".",
      "phase": "verification",
      "cost": "normal",
      "evidence_policy": "current_exact",
      "necessity": "Scope isolation and exit-held collector admission",
      "inputs": {
        "env": []
      }
    },
    {
      "id": "write-boundary",
      "kind": "package_test",
      "path": "tests/effects/operator-write-boundary.test.ts",
      "cwd": ".",
      "phase": "verification",
      "cost": "normal",
      "evidence_policy": "current_exact",
      "necessity": "Scope isolation and exit-held collector admission",
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
      "necessity": "Required integrity or browser-safe DTO boundary",
      "inputs": {
        "env": []
      }
    },
    {
      "id": "browser-build",
      "kind": "command",
      "command": "bun build src/operator-web/repository-snapshot.ts --target browser --outdir .ai/harness/runs/repository-browser-build",
      "cwd": ".",
      "phase": "verification",
      "cost": "normal",
      "evidence_policy": "current_exact",
      "necessity": "Required integrity or browser-safe DTO boundary",
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
      "necessity": "Required integrity or browser-safe DTO boundary",
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
      "necessity": "Required integrity or browser-safe DTO boundary",
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
      "necessity": "Required integrity or browser-safe DTO boundary",
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
      "necessity": "Required integrity or browser-safe DTO boundary",
      "inputs": {
        "env": []
      }
    },
    {
      "id": "architecture-sync",
      "kind": "command",
      "command": "bash scripts/check-architecture-sync.sh",
      "cwd": ".",
      "phase": "verification",
      "cost": "normal",
      "evidence_policy": "current_exact",
      "necessity": "Required integrity or browser-safe DTO boundary",
      "inputs": {
        "env": []
      }
    },
    {
      "id": "task-sync",
      "kind": "command",
      "command": "REPO_HARNESS_DIFF_BASE=9227c93c REPO_HARNESS_DIFF_MODE=merge-base bash scripts/check-task-sync.sh",
      "cwd": ".",
      "phase": "verification",
      "cost": "normal",
      "evidence_policy": "current_exact",
      "necessity": "Required integrity or browser-safe DTO boundary",
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
      "necessity": "Required integrity or browser-safe DTO boundary",
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
      "necessity": "Required integrity or browser-safe DTO boundary",
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
      "necessity": "Required integrity or browser-safe DTO boundary",
      "inputs": {
        "env": []
      }
    }
  ]
}
```

## Acceptance Notes (Human Review)

Existing collector/server/browser/route suites own the behavior; no new test suite. One semantic review only after frozen architecture and canonical proof. Local source evidence is not runtime admission.

## Rollback Point

- Base: 9227c93c.
- Remove scoped snapshot protocol/route and shared admission without modifying persisted records.

