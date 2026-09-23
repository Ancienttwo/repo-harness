> **Archived**: 2026-09-23 14:09
> **Related Plan**: plans/archive/plan-20260922-1008-akn06-history.md
> **Outcome**: Superseded
> **Lifecycle**: contract
> **Parent Run ID**: run-20260923-1409
> **Archive Projection V1**: `plans/plan-20260922-1008-akn06-history.md` => `plans/archive/plan-20260922-1008-akn06-history.md`
> **Archive Projection V1**: `tasks/notes/20260922-1008-akn06-history.notes.md` => `tasks/archive/notes-20260923-1409-akn06-history.md`
> **Archive Projection V1**: `tasks/contracts/20260922-1008-akn06-history.contract.md` => `tasks/archive/contract-20260923-1409-akn06-history.md`
> **Archive Projection V1**: `tasks/reviews/20260922-1008-akn06-history.review.md` => `tasks/archive/review-20260923-1409-akn06-history.md`

# Task Contract: akn06-history

> **Status**: Active
> **Plan**: plans/archive/plan-20260922-1008-akn06-history.md
> **Task Profile**: code-change
> <!-- legal values: code-change | docs-only | ledger-closeout | migration | eval-only | delegated-run | bugfix (omit for legacy passthrough); see docs/reference-configs/sprint-contracts.md -->
> **Owner**: ancienttwo
> **Capability ID**: root
> **Last Updated**: 2026-09-22 09:40
> **Review File**: `tasks/archive/review-20260923-1409-akn06-history.md`
> **Notes File**: `tasks/archive/notes-20260923-1409-akn06-history.md`
> **Exemplar**: `docs/reference-configs/contract-brief-example.md`

## Why

Current Task context has no source of archived canonical identity. Old URLs need immutable commit evidence, never title or filename inference.

## Goal

Read the nearest exact schema2 Task ID and optional revision from bounded first-parent canonical Git history.

## Scope

- In scope: typed history evidence, bounded server-owned Git traversal, registry/target recheck, shared policy parser, actual Git coverage.
- Out of scope: HTTP/browser wiring, new authority or index, plan archive guessing, execution/ready states, installation and merge.
- Invariant: historical evidence never grants a current Claim or completion; caller cannot choose a path or Git ref.

## Stop Conditions

Missing registry or canonical authority fails closed. No title-derived identity, provider traffic, or arbitrary client source coordinates.

## Falsifier

A result names a Task absent from its exact committed schema2 carrier, skips ambiguity, changes repository state, or bypasses the declared finite budgets.

## Workflow Inventory

- Source plan: `plans/archive/plan-20260922-1008-akn06-history.md`
- Deferred-goal ledger: `tasks/todos.md`
- Review file: `tasks/archive/review-20260923-1409-akn06-history.md`
- Notes file: `tasks/archive/notes-20260923-1409-akn06-history.md`
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
  - src/effects/operator/task-history.ts
  - src/effects/state/coordination-canonical-source.ts
  - tests/effects/operator-task-context.test.ts
  - docs/researches/20260922-operator-task-history.md
  - docs/architecture/.projection-manifest.json
  - plans/archive/plan-20260922-1008-akn06-history.md
  - tasks/archive/contract-20260923-1409-akn06-history.md
  - tasks/archive/review-20260923-1409-akn06-history.md
  - tasks/archive/notes-20260923-1409-akn06-history.md
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
    - docs/researches/20260922-operator-task-history.md
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
      "necessity": "Historical Task identity, bounded reads and required integrity",
      "inputs": {
        "env": []
      }
    },
    {
      "id": "identity",
      "kind": "package_test",
      "path": "tests/unit/sprint-schema-v2-identity.test.ts",
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
      "id": "carriers",
      "kind": "package_test",
      "path": "tests/sprint-cross-carrier-identity.test.ts",
      "cwd": ".",
      "phase": "verification",
      "cost": "normal",
      "evidence_policy": "current_exact",
      "necessity": "Historical Task identity, bounded reads and required integrity",
      "inputs": {
        "env": []
      }
    }
  ]
}
```

## Acceptance Notes (Human Review)

Exact persisted Task ID and optional revision, complete per-commit ambiguity check, immutable source coordinates, finite resource bounds, registry/target freshness, no local paths or execution authority. HTTP/old URL integration remains a following slice.

## Rollback Point

Base5057b27bd454737ac69b22f4881613050244347d. Remove reader and restore shared resolver signature together.
