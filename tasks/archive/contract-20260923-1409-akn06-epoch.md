> **Archived**: 2026-09-23 14:09
> **Related Plan**: plans/archive/plan-20260922-0948-akn06-epoch.md
> **Outcome**: Superseded
> **Lifecycle**: contract
> **Parent Run ID**: run-20260923-1409
> **Archive Projection V1**: `plans/plan-20260922-0948-akn06-epoch.md` => `plans/archive/plan-20260922-0948-akn06-epoch.md`
> **Archive Projection V1**: `tasks/notes/20260922-0948-akn06-epoch.notes.md` => `tasks/archive/notes-20260923-1409-akn06-epoch.md`
> **Archive Projection V1**: `tasks/contracts/20260922-0948-akn06-epoch.contract.md` => `tasks/archive/contract-20260923-1409-akn06-epoch.md`
> **Archive Projection V1**: `tasks/reviews/20260922-0948-akn06-epoch.review.md` => `tasks/archive/review-20260923-1409-akn06-epoch.md`

# Task Contract: akn06-epoch

> **Status**: Active
> **Plan**: plans/archive/plan-20260922-0948-akn06-epoch.md
> **Task Profile**: bugfix
> <!-- legal values: code-change | docs-only | ledger-closeout | migration | eval-only | delegated-run | bugfix (omit for legacy passthrough); see docs/reference-configs/sprint-contracts.md -->
> **Owner**: ancienttwo
> **Capability ID**: root
> **Last Updated**: 2026-09-22 09:40
> **Review File**: `tasks/archive/review-20260923-1409-akn06-epoch.md`
> **Notes File**: `tasks/archive/notes-20260923-1409-akn06-epoch.md`
> **Exemplar**: `docs/reference-configs/contract-brief-example.md`

## Why

The browser Fleet transport omits the server epoch. A sequence reset after restart leaves explicit Composer stale-failure recovery disabled and main Fleet state cannot identify regressed generations.

## Goal

Bind Fleet observations and browser recovery to required service epoch plus sequence, preserving original draft fences.

## Scope

- In scope: Operator protocol7 and Repository protocol3 cutover, server epoch projection, strict decoding, associated reader invalidation and Composer explicit recovery.
- Out of scope: new provider scheduling, formal Task history, head/base/contract evidence, native execution, install and main merge.
- Invariant: server owns epoch; refresh cannot rewrite draft identity or create a browser write.

## Stop Conditions

- Stop on missing epoch authority or required paths outside Allowed Paths.
- No legacy protocol reader, optional epoch or locally invented identity.

## Falsifier

A new-epoch stable observation with reset sequence cannot enable explicit stale-failure recovery, a same-epoch lower sequence replaces current data, or epoch refresh rewrites a stored draft without user action.

## Root Cause Evidence

- root_cause: Composer compares only sequence against failed_sequence, while server restarts reset sequence and its epoch is absent from the Fleet browser DTO.
- repro: Save a draft, reject its send as canonical_source_stale, then refresh a stable new service epoch with sequence1; the old implementation keeps explicit Rebind disabled.
- regression_guard: tests/operator-web/operator-interactions.test.tsx
- pre_fix_failure_artifact: tasks/archive/review-20260923-1409-akn06-epoch.md

## Workflow Inventory

- Source plan: `plans/archive/plan-20260922-0948-akn06-epoch.md`
- Deferred-goal ledger: `tasks/todos.md`
- Review file: `tasks/archive/review-20260923-1409-akn06-epoch.md`
- Notes file: `tasks/archive/notes-20260923-1409-akn06-epoch.md`
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
  - src/core/operator/observation-identity.ts
  - src/core/operator/fleet-snapshot.ts
  - src/core/operator/repository-snapshot.ts
  - src/effects/operator/server.ts
  - src/operator-web/types.ts
  - src/operator-web/fixture.ts
  - src/operator-web/App.tsx
  - tests/operator-web/operator-interactions.test.tsx
  - tests/operator-web/operator-ui.test.tsx
  - tests/unit/operator-fleet-snapshot.test.ts
  - tests/unit/operator-web-types.test.ts
  - tests/cli/operator-serve.test.ts
  - docs/researches/20260922-operator-service-epoch.md
  - docs/architecture/.projection-manifest.json
  - plans/archive/plan-20260922-0948-akn06-epoch.md
  - tasks/archive/contract-20260923-1409-akn06-epoch.md
  - tasks/archive/review-20260923-1409-akn06-epoch.md
  - tasks/archive/notes-20260923-1409-akn06-epoch.md
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
    - src/core/operator/observation-identity.ts
    - docs/researches/20260922-operator-service-epoch.md
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
      "necessity": "Epoch protocol cutover, browser fence behavior and required integrity",
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
      "necessity": "Epoch protocol cutover, browser fence behavior and required integrity",
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
      "necessity": "Epoch protocol cutover, browser fence behavior and required integrity",
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
      "necessity": "Epoch protocol cutover, browser fence behavior and required integrity",
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
      "necessity": "Epoch protocol cutover, browser fence behavior and required integrity",
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
      "necessity": "Epoch protocol cutover, browser fence behavior and required integrity",
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
      "necessity": "Epoch protocol cutover, browser fence behavior and required integrity",
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
      "necessity": "Epoch protocol cutover, browser fence behavior and required integrity",
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
      "necessity": "Epoch protocol cutover, browser fence behavior and required integrity",
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
      "necessity": "Epoch protocol cutover, browser fence behavior and required integrity",
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
      "necessity": "Epoch protocol cutover, browser fence behavior and required integrity",
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
      "necessity": "Epoch protocol cutover, browser fence behavior and required integrity",
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
      "necessity": "Epoch protocol cutover, browser fence behavior and required integrity",
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
      "necessity": "Epoch protocol cutover, browser fence behavior and required integrity",
      "inputs": {
        "env": []
      }
    },
    {
      "id": "core",
      "kind": "package_test",
      "path": "tests/unit/operator-fleet-snapshot.test.ts",
      "cwd": ".",
      "phase": "verification",
      "cost": "normal",
      "evidence_policy": "current_exact",
      "necessity": "Epoch protocol cutover, browser fence behavior and required integrity",
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
      "necessity": "Epoch protocol cutover, browser fence behavior and required integrity",
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
      "necessity": "Epoch protocol cutover, browser fence behavior and required integrity",
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
      "necessity": "Epoch protocol cutover, browser fence behavior and required integrity",
      "inputs": {
        "env": []
      }
    }
  ]
}
```

## Acceptance Notes (Human Review)

Epoch is required in Operator7 and consistent through Repository3. New epoch may reset sequence; same-epoch regression remains stale. Original draft fence/retry identity does not change on refresh; explicit recovery alone creates a new fence. Associated readers are cancelled when service identity changes.

## Rollback Point

- Base: ea13a5a87fcaabade9f43e40d39ee779d4eb4ce7.
- Revert core DTO, server, browser and fixtures atomically; no data migration.
