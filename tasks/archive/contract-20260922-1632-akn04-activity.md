> **Archived**: 2026-09-22 16:32
> **Related Plan**: plans/archive/plan-20260922-0418-akn04-activity.md
> **Outcome**: Completed
> **Lifecycle**: contract
> **Parent Run ID**: run-20260922-1632
> **Archive Projection V1**: `plans/plan-20260922-0418-akn04-activity.md` => `plans/archive/plan-20260922-0418-akn04-activity.md`
> **Archive Projection V1**: `tasks/notes/20260922-0418-akn04-activity.notes.md` => `tasks/archive/notes-20260922-1632-akn04-activity.md`
> **Archive Projection V1**: `tasks/contracts/20260922-0418-akn04-activity.contract.md` => `tasks/archive/contract-20260922-1632-akn04-activity.md`
> **Archive Projection V1**: `tasks/reviews/20260922-0418-akn04-activity.review.md` => `tasks/archive/review-20260922-1632-akn04-activity.md`

# Task Contract: akn04-activity

> **Status**: Fulfilled
> **Plan**: plans/archive/plan-20260922-0418-akn04-activity.md
> **Task Profile**: code-change
> <!-- legal values: code-change | docs-only | ledger-closeout | migration | eval-only | delegated-run | bugfix (omit for legacy passthrough); see docs/reference-configs/sprint-contracts.md -->
> **Owner**: ancienttwo
> **Capability ID**: root
> **Last Updated**: 2026-09-22 04:18
> **Review File**: `tasks/archive/review-20260922-1632-akn04-activity.md`
> **Notes File**: `tasks/archive/notes-20260922-1632-akn04-activity.md`
> **Exemplar**: `docs/reference-configs/contract-brief-example.md`

## Why

Historical replies must remain inspectable after Task/Lease/Binding changes. Current live Engineer reads cannot serve that browser history contract.

## Goal

Implement the approved AKN-04b bounded historical Task activity GET and strict browser transport with original recipient/reply provenance, no read mutations, explicit incomplete coverage and registered-repository isolation.

## Scope

- In scope: captured plan and exact paths below; integrate accepted upstream communication and placement source plus their workflow archives, regenerate deterministic projection, and align historical consumers with the single core encoded-record limit.
- Out of scope: UI redesign, active context/automation summary, provider dispatch, runtime installation, main merge, new event store.
- Taste constraints: existing stored authority and pure reply oracle; no semantic fallbacks or current-state fence on historical facts.

## Stop Conditions

- Stop and hand back to the parent if the change would require editing a path outside Allowed Paths.
- Stop if an Exit Criteria command cannot be run in this environment.
- Stop if Goal, Scope, or Exit Criteria are internally contradictory.

## Falsifier

An old exact message becomes unreadable solely due to revision/Lease rotation; a GET changes stored bytes; a forged raw reply is shown as verified; an A repository request returns B facts; cancellation frees an active worker slot before termination.

## Root Cause Evidence

Required when Task Profile is `bugfix`; leave as-is otherwise.

- root_cause: one sentence naming file:line/condition (testable, not "a state issue").
- repro: the command or UI path that reproduces the symptom.
- regression_guard: path to a test that fails on the unfixed code and passes after the fix (must also appear as a `package_test` check in Verification Plan).
- pre_fix_failure_artifact: path to a captured run of regression_guard on the UNFIXED code. Capture with `bun test <regression_guard> > <artifact> 2>&1; echo "PRE_FIX_EXIT=$?" >> <artifact>` (no pipes — pipes swallow the exit status). The gate requires a non-zero `PRE_FIX_EXIT=` line plus the regression_guard path string in the artifact (see the Root Cause Evidence Gate section in docs/reference-configs/sprint-contracts.md).

## Workflow Inventory

- Source plan: `plans/archive/plan-20260922-0418-akn04-activity.md`
- Deferred-goal ledger: `tasks/todos.md`
- Review file: `tasks/archive/review-20260922-1632-akn04-activity.md`
- Notes file: `tasks/archive/notes-20260922-1632-akn04-activity.md`
- Checks file: `.ai/harness/checks/latest.json`
- Run snapshots: `.ai/harness/runs/`
- Scope gate: edit only paths listed under `allowed_paths`; update this contract before widening scope.
- Completion gate: run `verify-sprint --prepare-acceptance`, record one typed AcceptanceReceipt under the frozen policy below, then run `verify-sprint`; review Markdown is projection only.

## Change Assessment

```json
{"protocol": 1, "oracles": [{"id": "activity", "kind": "deterministic_test", "paths": ["*"]}]}
```

## Acceptance Policy

```json
{"protocol":2,"reviewer":"Codex","source":"codex-plugin","user_waiver":"allowed"}
```

## Allowed Paths

```yaml
allowed_paths:
  - src/core/operator/task-activity.ts
  - src/effects/fleet/task-inbox.ts
  - src/effects/engineers/claim-actor-store.ts
  - src/effects/operator/task-activity.ts
  - src/effects/operator/task-activity-worker.ts
  - src/effects/operator/server.ts
  - src/operator-web/task-activity.ts
  - tests/effects/operator-task-activity.test.ts
  - tests/effects/operator-write-boundary.test.ts
  - tests/cli/operator-serve.test.ts
  - tests/unit/operator-web-types.test.ts
  - tests/unit/collaboration-authority-baseline.test.ts
  - docs/researches/20260922-operator-task-activity.md
  - docs/architecture/.projection-manifest.json
  - plans/archive/plan-20260922-0418-akn04-activity.md
  - tasks/archive/contract-20260922-1632-akn04-activity.md
  - tasks/archive/review-20260922-1632-akn04-activity.md
  - tasks/archive/notes-20260922-1632-akn04-activity.md
  - tasks/todos.md
  - docs/researches/20260922-candidate-runtime-fixture-authority.md
  - docs/researches/20260922-task-reply-protocol.md
  - plans/archive/plan-20260922-0132-candidate-runtime-fixture-authority.md
  - plans/archive/plan-20260922-0204-akn03-protected-replies.md
  - plans/archive/plan-20260922-0321-akn04-placement.md
  - plans/archive/plan-20260922-1417-akn03b-windows-fixture.md
  - plans/archive/plan-20260922-1452-akn03a-fixture-integration.md
  - plans/plan-20260922-1425-akn04a-stack-refresh.md
  - scripts/check-tarball-install-smoke.sh
  - src/core/fleet/task-reply.ts
  - src/effects/engineers/task-inbox.ts
  - tasks/archive/contract-20260922-0148-candidate-runtime-fixture-authority.md
  - tasks/archive/contract-20260922-1403-akn03-protected-replies.md
  - tasks/archive/contract-20260922-1405-akn04-placement.md
  - tasks/archive/contract-20260922-1510-akn03a-fixture-integration.md
  - tasks/archive/contract-20260922-1532-akn03b-windows-fixture.md
  - tasks/archive/notes-20260922-0148-candidate-runtime-fixture-authority.md
  - tasks/archive/notes-20260922-1403-akn03-protected-replies.md
  - tasks/archive/notes-20260922-1405-akn04-placement.md
  - tasks/archive/notes-20260922-1510-akn03a-fixture-integration.md
  - tasks/archive/notes-20260922-1532-akn03b-windows-fixture.md
  - tasks/archive/review-20260922-0148-candidate-runtime-fixture-authority.md
  - tasks/archive/review-20260922-1403-akn03-protected-replies.md
  - tasks/archive/review-20260922-1405-akn04-placement.md
  - tasks/archive/review-20260922-1510-akn03a-fixture-integration.md
  - tasks/archive/review-20260922-1532-akn03b-windows-fixture.md
  - tasks/archive/todo-20260922-0148-candidate-runtime-fixture-authority.md
  - tasks/archive/todo-20260922-1403-akn03-protected-replies.md
  - tasks/archive/todo-20260922-1405-akn04-placement.md
  - tasks/archive/todo-20260922-1510-akn03a-fixture-integration.md
  - tasks/archive/todo-20260922-1532-akn03b-windows-fixture.md
  - tasks/contracts/20260922-1425-akn04a-stack-refresh.contract.md
  - tasks/notes/20260922-1425-akn04a-stack-refresh.notes.md
  - tasks/reviews/20260922-1425-akn04a-stack-refresh.review.md
  - tests/cli/mcp-http.test.ts
  - tests/effects/task-reply.test.ts
  - tests/unit/candidate-bound-global-runtime-reconciliation.test.ts
  - tests/unit/task-reply.test.ts
  - plans/archive/plan-20260922-1425-akn04a-stack-refresh.md
  - tasks/archive/
  - plans/archive/plan-20260922-1548-akn03b-windows-identity.md
  - tasks/archive/contract-20260922-1615-akn03b-windows-identity.md
  - tasks/archive/notes-20260922-1615-akn03b-windows-identity.md
  - tasks/archive/review-20260922-1615-akn03b-windows-identity.md
  - tasks/archive/todo-20260922-1615-akn03b-windows-identity.md
  - plans/plan-20260922-0204-akn03-protected-replies.md
  - plans/plan-20260922-0321-akn04-placement.md
  - tasks/contracts/20260922-0204-akn03-protected-replies.contract.md
  - tasks/contracts/20260922-0321-akn04-placement.contract.md
  - tasks/notes/20260922-0204-akn03-protected-replies.notes.md
  - tasks/notes/20260922-0321-akn04-placement.notes.md
  - tasks/reviews/20260922-0204-akn03-protected-replies.review.md
  - tasks/reviews/20260922-0321-akn04-placement.review.md
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
    - src/core/operator/task-activity.ts
    - src/effects/operator/task-activity-worker.ts
    - docs/researches/20260922-operator-task-activity.md
  artifacts_exist: []
```

## Verification Plan

```json
{
  "protocol": 1,
  "checks": [
    {
      "id": "activity",
      "kind": "package_test",
      "path": "tests/effects/operator-task-activity.test.ts",
      "cwd": ".",
      "phase": "verification",
      "cost": "normal",
      "evidence_policy": "current_exact",
      "necessity": "Historical read, provenance, browser/server isolation and existing write authority boundary",
      "inputs": {
        "env": []
      }
    },
    {
      "id": "reply",
      "kind": "package_test",
      "path": "tests/effects/task-reply.test.ts",
      "cwd": ".",
      "phase": "verification",
      "cost": "normal",
      "evidence_policy": "current_exact",
      "necessity": "Historical read, provenance, browser/server isolation and existing write authority boundary",
      "inputs": {
        "env": []
      }
    },
    {
      "id": "inbox",
      "kind": "package_test",
      "path": "tests/effects/task-inbox.test.ts",
      "cwd": ".",
      "phase": "verification",
      "cost": "normal",
      "evidence_policy": "current_exact",
      "necessity": "Historical read, provenance, browser/server isolation and existing write authority boundary",
      "inputs": {
        "env": []
      }
    },
    {
      "id": "actor",
      "kind": "package_test",
      "path": "tests/unit/me0b-engineer-principal-claim-actor.test.ts",
      "cwd": ".",
      "phase": "verification",
      "cost": "normal",
      "evidence_policy": "current_exact",
      "necessity": "Historical read, provenance, browser/server isolation and existing write authority boundary",
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
      "necessity": "Historical read, provenance, browser/server isolation and existing write authority boundary",
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
      "necessity": "Historical read, provenance, browser/server isolation and existing write authority boundary",
      "inputs": {
        "env": []
      }
    },
    {
      "id": "browser-types",
      "kind": "package_test",
      "path": "tests/unit/operator-web-types.test.ts",
      "cwd": ".",
      "phase": "verification",
      "cost": "normal",
      "evidence_policy": "current_exact",
      "necessity": "Historical read, provenance, browser/server isolation and existing write authority boundary",
      "inputs": {
        "env": []
      }
    },
    {
      "id": "authority-inventory",
      "kind": "package_test",
      "path": "tests/unit/collaboration-authority-baseline.test.ts",
      "cwd": ".",
      "phase": "verification",
      "cost": "normal",
      "evidence_policy": "current_exact",
      "necessity": "Historical read, provenance, browser/server isolation and existing write authority boundary",
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
      "necessity": "Required repository integrity and browser-safe wire decoder",
      "inputs": {
        "env": []
      }
    },
    {
      "id": "browser-transport",
      "kind": "command",
      "command": "bun build src/operator-web/task-activity.ts --target browser --outdir .ai/harness/runs/activity-browser-build",
      "cwd": ".",
      "phase": "verification",
      "cost": "normal",
      "evidence_policy": "current_exact",
      "necessity": "Required repository integrity and browser-safe wire decoder",
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
      "necessity": "Required repository integrity and browser-safe wire decoder",
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
      "necessity": "Required repository integrity and browser-safe wire decoder",
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
      "necessity": "Required repository integrity and browser-safe wire decoder",
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
      "necessity": "Required repository integrity and browser-safe wire decoder",
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
      "necessity": "Required repository integrity and browser-safe wire decoder",
      "inputs": {
        "env": []
      }
    },
    {
      "id": "task-sync",
      "kind": "command",
      "command": "REPO_HARNESS_DIFF_BASE=e5ffd48add85f00d4883ea5c4206b8242c6ab505 REPO_HARNESS_DIFF_MODE=merge-base bash scripts/check-task-sync.sh",
      "cwd": ".",
      "phase": "verification",
      "cost": "normal",
      "evidence_policy": "current_exact",
      "necessity": "Required repository integrity and browser-safe wire decoder",
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
      "necessity": "Required repository integrity and browser-safe wire decoder",
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
      "necessity": "Required repository integrity and browser-safe wire decoder",
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
      "necessity": "Required repository integrity and browser-safe wire decoder",
      "inputs": {
        "env": []
      }
    }
  ]
}
```

## Acceptance Notes (Human Review)

A new effects test is admitted for historical event/receipt provenance, nested read budgets and real worker HTTP behavior; existing server/decoder/authority suites cover their owning boundaries. No full suite. These local records do not prove native Host isolation, adoption correctness or Campaign execution. Source/projection must be frozen before canonical verification and one independent review. No real provider or credentials are required.

## Rollback Point

- Base: e5ffd48add85f00d4883ea5c4206b8242c6ab505.
- Revert new GET/transport/readers; preserve original messages, delivery receipts and reply/actor records.
