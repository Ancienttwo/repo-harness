> **Archived**: 2026-09-22 02:24
> **Related Plan**: plans/archive/plan-20260922-0151-akn03-reply-inventory.md
> **Outcome**: Completed
> **Lifecycle**: contract
> **Parent Run ID**: run-20260922-0224
> **Archive Projection V1**: `plans/plan-20260922-0151-akn03-reply-inventory.md` => `plans/archive/plan-20260922-0151-akn03-reply-inventory.md`
> **Archive Projection V1**: `tasks/notes/20260922-0151-akn03-reply-inventory.notes.md` => `tasks/archive/notes-20260922-0224-akn03-reply-inventory.md`
> **Archive Projection V1**: `tasks/contracts/20260922-0151-akn03-reply-inventory.contract.md` => `tasks/archive/contract-20260922-0224-akn03-reply-inventory.md`
> **Archive Projection V1**: `tasks/reviews/20260922-0151-akn03-reply-inventory.review.md` => `tasks/archive/review-20260922-0224-akn03-reply-inventory.md`

# Task Contract: akn03-reply-inventory

> **Status**: Fulfilled
> **Plan**: plans/archive/plan-20260922-0151-akn03-reply-inventory.md
> **Task Profile**: bugfix
> <!-- legal values: code-change | docs-only | ledger-closeout | migration | eval-only | delegated-run | bugfix (omit for legacy passthrough); see docs/reference-configs/sprint-contracts.md -->
> **Owner**: ancienttwo
> **Capability ID**: root
> **Last Updated**: 2026-09-22 01:51
> **Review File**: `tasks/archive/review-20260922-0224-akn03-reply-inventory.md`
> **Notes File**: `tasks/archive/notes-20260922-0224-akn03-reply-inventory.md`
> **Exemplar**: `docs/reference-configs/contract-brief-example.md`

## Why

The existing closed authority scan rejects the newly introduced reply protocol because its classification was omitted.

## Goal

Register the reply protocol against the existing two-clause inventory criterion without changing protocol behavior or weakening the closed scan; verify the complete PR subject.

## Scope

- In scope: explicit inventory exclusion, matching post-freeze rationale, existing protocol documentation and own workflow artifacts.
- Out of scope: production source edits, storage/MCP, Host admission, merge or release.
- Taste constraints: preserve historical inventory counts and digest, and exact closed equality.

## Stop Conditions

- Stop and hand back to the parent if the change would require editing a path outside Allowed Paths.
- Stop if an Exit Criteria command cannot be run in this environment.
- Stop if Goal, Scope, or Exit Criteria are internally contradictory.

## Falsifier

The existing scan still fails, a production consumer relies on reply records for work ownership, or the fixed scan stops detecting unregistered modules.

## Root Cause Evidence

- root_cause: tests/unit/collaboration-authority-baseline.test.ts:663 compares every protocol module against a closed union missing src/core/fleet/task-reply.ts.
- repro: bun test tests/unit/collaboration-authority-baseline.test.ts
- regression_guard: tests/unit/collaboration-authority-baseline.test.ts
- pre_fix_failure_artifact: .ai/harness/runs/akn03-reply-protocol/inventory-pre-fix.log

## Workflow Inventory

- Source plan: `plans/archive/plan-20260922-0151-akn03-reply-inventory.md`
- Deferred-goal ledger: `tasks/todos.md`
- Review file: `tasks/archive/review-20260922-0224-akn03-reply-inventory.md`
- Notes file: `tasks/archive/notes-20260922-0224-akn03-reply-inventory.md`
- Checks file: `.ai/harness/checks/latest.json`
- Run snapshots: `.ai/harness/runs/`
- Scope gate: edit only paths listed under `allowed_paths`; update this contract before widening scope.
- Completion gate: run `verify-sprint --prepare-acceptance`, record one typed AcceptanceReceipt under the frozen policy below, then run `verify-sprint`; review Markdown is projection only.

## Change Assessment

```json
{"protocol": 1, "oracles": [{"id": "inventory", "kind": "deterministic_test", "paths": ["*"]}]}
```

## Acceptance Policy

```json
{"protocol":2,"reviewer":"Codex","source":"codex-plugin","user_waiver":"allowed"}
```

## Allowed Paths

```yaml
allowed_paths:
  - src/core/fleet/task-reply.ts
  - tests/unit/task-reply.test.ts
  - tests/unit/collaboration-authority-baseline.test.ts
  - docs/researches/20260829-c0-collaboration-two-plane-authority-freeze.md
  - docs/researches/20260922-task-reply-protocol.md
  - docs/architecture/.projection-manifest.json
  - plans/archive/plan-20260922-0113-akn03-reply-protocol.md
  - tasks/archive/contract-20260922-0126-akn03-reply-protocol.md
  - tasks/archive/review-20260922-0126-akn03-reply-protocol.md
  - tasks/archive/notes-20260922-0126-akn03-reply-protocol.md
  - tasks/archive/todo-20260922-0126-akn03-reply-protocol.md
  - plans/archive/plan-20260922-0151-akn03-reply-inventory.md
  - tasks/archive/contract-20260922-0224-akn03-reply-inventory.md
  - tasks/archive/review-20260922-0224-akn03-reply-inventory.md
  - tasks/archive/notes-20260922-0224-akn03-reply-inventory.md
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
    - tests/unit/collaboration-authority-baseline.test.ts
    - docs/researches/20260922-task-reply-protocol.md
  artifacts_exist: []
```

## Verification Plan

```json
{
  "protocol": 1,
  "checks": [
    {
      "id": "inventory",
      "kind": "package_test",
      "path": "tests/unit/collaboration-authority-baseline.test.ts",
      "cwd": ".",
      "phase": "verification",
      "cost": "normal",
      "evidence_policy": "current_exact",
      "necessity": "Closed inventory integration and unchanged reply behavior",
      "inputs": {
        "env": []
      }
    },
    {
      "id": "reply",
      "kind": "package_test",
      "path": "tests/unit/task-reply.test.ts",
      "cwd": ".",
      "phase": "verification",
      "cost": "normal",
      "evidence_policy": "current_exact",
      "necessity": "Closed inventory integration and unchanged reply behavior",
      "inputs": {
        "env": []
      }
    },
    {
      "id": "message",
      "kind": "package_test",
      "path": "tests/unit/task-message-v1.test.ts",
      "cwd": ".",
      "phase": "verification",
      "cost": "normal",
      "evidence_policy": "current_exact",
      "necessity": "Closed inventory integration and unchanged reply behavior",
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
      "necessity": "Required repository integrity on final PR subject",
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
      "necessity": "Required repository integrity on final PR subject",
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
      "necessity": "Required repository integrity on final PR subject",
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
      "necessity": "Required repository integrity on final PR subject",
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
      "necessity": "Required repository integrity on final PR subject",
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
      "necessity": "Required repository integrity on final PR subject",
      "inputs": {
        "env": []
      }
    },
    {
      "id": "task-sync",
      "kind": "command",
      "command": "REPO_HARNESS_DIFF_BASE=0d4371c3f95e63851f4e083718f3337bf9646345 REPO_HARNESS_DIFF_MODE=merge-base bash scripts/check-task-sync.sh",
      "cwd": ".",
      "phase": "verification",
      "cost": "normal",
      "evidence_policy": "current_exact",
      "necessity": "Required repository integrity on final PR subject",
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
      "necessity": "Required repository integrity on final PR subject",
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
      "necessity": "Required repository integrity on final PR subject",
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
      "necessity": "Required repository integrity on final PR subject",
      "inputs": {
        "env": []
      }
    }
  ]
}
```

## Acceptance Notes (Human Review)

P1/P2/P3 is frozen in the plan. Previous protocol implementation is unchanged and already independently reviewed; this acceptance covers the final branch including inventory correction. The existing closed inclusion test provides pre-fix evidence (18 pass / 1 fail). No new tests, production behavior or full local suite. Hosted Windows retry passed at unchanged 4a8b2992; original failure remains evidence of an intermittent startup timeout, not a proven fix. Baseline fixture failure is addressed independently in PR #436.

## Rollback Point

- Checkpoint: 4a8b29921dd618368d117015388d5452329b8345.
- Revert this follow-up only; no persisted state changes.
