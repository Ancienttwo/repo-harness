# Task Contract: akn04-automation-summary

> **Status**: Active
> **Plan**: plans/plan-20260922-0534-akn04-automation-summary.md
> **Task Profile**: code-change
> <!-- legal values: code-change | docs-only | ledger-closeout | migration | eval-only | delegated-run | bugfix (omit for legacy passthrough); see docs/reference-configs/sprint-contracts.md -->
> **Owner**: ancienttwo
> **Capability ID**: root
> **Last Updated**: 2026-09-22 04:50
> **Review File**: `tasks/reviews/20260922-0534-akn04-automation-summary.review.md`
> **Notes File**: `tasks/notes/20260922-0534-akn04-automation-summary.notes.md`
> **Exemplar**: `docs/reference-configs/contract-brief-example.md`

## Why

Repository supervision needs original automation records and explicit source gaps without executing or inventing automation.

## Goal

Implement AKN-04d2 automation summary from original grant/budget/controller/Campaign authority inside the scoped snapshot.

## Scope

- In scope: strict public projection, read-only source joins, original receipt reader and env propagation; scoped IPC/HTTP/browser protocol cutover and owning verification.
- Out of scope: execution, repair, runtime installation, main merge and UI redesign.
- Invariant: original observations never authorize writes or prove native execution.

## Stop Conditions

- Stop and hand back to the parent if the change would require editing a path outside Allowed Paths.
- Stop if an Exit Criteria command cannot be run in this environment.
- Stop if Goal, Scope, or Exit Criteria are internally contradictory.

## Falsifier

A GET writes a lock/record, runs provider/controller, guesses a native turn or owner, leaks raw private diagnostics, or mixes source identity/digests.

## Root Cause Evidence

Not applicable: new automation observation boundary. Existing source validators remain authoritative.

## Workflow Inventory

- Source plan: `plans/plan-20260922-0534-akn04-automation-summary.md`
- Deferred-goal ledger: `tasks/todos.md`
- Review file: `tasks/reviews/20260922-0534-akn04-automation-summary.review.md`
- Notes file: `tasks/notes/20260922-0534-akn04-automation-summary.notes.md`
- Checks file: `.ai/harness/checks/latest.json`
- Run snapshots: `.ai/harness/runs/`
- Scope gate: edit only paths listed under `allowed_paths`; update this contract before widening scope.
- Completion gate: run `verify-sprint --prepare-acceptance`, record one typed AcceptanceReceipt under the frozen policy below, then run `verify-sprint`; review Markdown is projection only.

## Change Assessment

```json
{"protocol": 1, "oracles": [{"id": "automation", "kind": "deterministic_test", "paths": ["*"]}]}
```

## Acceptance Policy

```json
{"protocol":2,"reviewer":"Codex","source":"codex-plugin","user_waiver":"allowed"}
```

## Allowed Paths

```yaml
allowed_paths:
  - src/core/operator/automation-summary.ts
  - src/effects/operator/automation-summary.ts
  - src/core/operator/repository-snapshot.ts
  - src/effects/operator/fleet-collector-process.ts
  - src/effects/operator/server.ts
  - src/operator-web/repository-snapshot.ts
  - src/effects/automation/budget-store.ts
  - src/effects/automation/campaign-step.ts
  - tests/effects/operator-automation-summary.test.ts
  - tests/unit/issue-282-automation-budget-store.test.ts
  - tests/effects/campaign-step.test.ts
  - tests/cli/operator-serve.test.ts
  - tests/effects/fleet-collector-process.test.ts
  - tests/unit/operator-web-types.test.ts
  - docs/researches/20260922-operator-automation-summary.md
  - docs/architecture/.projection-manifest.json
  - plans/plan-20260922-0534-akn04-automation-summary.md
  - tasks/contracts/20260922-0534-akn04-automation-summary.contract.md
  - tasks/reviews/20260922-0534-akn04-automation-summary.review.md
  - tasks/notes/20260922-0534-akn04-automation-summary.notes.md
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
    - src/core/operator/automation-summary.ts
    - docs/researches/20260922-operator-automation-summary.md
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
      "path": "tests/effects/operator-automation-summary.test.ts",
      "cwd": ".",
      "phase": "verification",
      "cost": "normal",
      "evidence_policy": "current_exact",
      "necessity": "Original automation records and scoped read lifecycle",
      "inputs": {
        "env": []
      }
    },
    {
      "id": "budget",
      "kind": "package_test",
      "path": "tests/unit/issue-282-automation-budget-store.test.ts",
      "cwd": ".",
      "phase": "verification",
      "cost": "normal",
      "evidence_policy": "current_exact",
      "necessity": "Original automation records and scoped read lifecycle",
      "inputs": {
        "env": []
      }
    },
    {
      "id": "campaign",
      "kind": "package_test",
      "path": "tests/effects/campaign-step.test.ts",
      "cwd": ".",
      "phase": "verification",
      "cost": "normal",
      "evidence_policy": "current_exact",
      "necessity": "Original automation records and scoped read lifecycle",
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
      "necessity": "Original automation records and scoped read lifecycle",
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
      "necessity": "Original automation records and scoped read lifecycle",
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
      "necessity": "Original automation records and scoped read lifecycle",
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
      "command": "REPO_HARNESS_DIFF_BASE=e6c41fdc REPO_HARNESS_DIFF_MODE=merge-base bash scripts/check-task-sync.sh",
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

One new effects suite owns original automation record joins, no-mutation and public redaction. Preserve existing budget/Campaign owner tests. Freeze source and architecture before canonical verification and one independent acceptance.

## Rollback Point

- Base e6c41fdc. Remove summary and transport revision together; durable authority is unchanged.

