> **Archived**: 2026-09-23 03:19
> **Related Plan**: plans/archive/plan-20260922-0534-akn04-automation-summary.md
> **Outcome**: Completed
> **Lifecycle**: contract
> **Parent Run ID**: run-20260923-0319
> **Archive Projection V1**: `plans/plan-20260922-0534-akn04-automation-summary.md` => `plans/archive/plan-20260922-0534-akn04-automation-summary.md`
> **Archive Projection V1**: `tasks/notes/20260922-0534-akn04-automation-summary.notes.md` => `tasks/archive/notes-20260923-0319-akn04-automation-summary.md`
> **Archive Projection V1**: `tasks/contracts/20260922-0534-akn04-automation-summary.contract.md` => `tasks/archive/contract-20260923-0319-akn04-automation-summary.md`
> **Archive Projection V1**: `tasks/reviews/20260922-0534-akn04-automation-summary.review.md` => `tasks/archive/review-20260923-0319-akn04-automation-summary.md`

# Task Contract: akn04-automation-summary

> **Status**: Fulfilled
> **Plan**: plans/archive/plan-20260922-0534-akn04-automation-summary.md
> **Task Profile**: code-change
> <!-- legal values: code-change | docs-only | ledger-closeout | migration | eval-only | delegated-run | bugfix (omit for legacy passthrough); see docs/reference-configs/sprint-contracts.md -->
> **Owner**: ancienttwo
> **Capability ID**: root
> **Last Updated**: 2026-09-22 04:50
> **Review File**: `tasks/archive/review-20260923-0319-akn04-automation-summary.md`
> **Notes File**: `tasks/archive/notes-20260923-0319-akn04-automation-summary.md`
> **Exemplar**: `docs/reference-configs/contract-brief-example.md`

## Why

Repository supervision needs original automation records and explicit source gaps without executing or inventing automation.

## Goal

Implement AKN-04d2 automation summary from original grant/budget/controller/Campaign authority inside the scoped snapshot.

## Scope

- In scope: strict public projection, read-only source joins, original receipt reader and env propagation; scoped IPC/HTTP/browser protocol cutover and owning verification; integrate accepted repository snapshot b076513b, including its accepted portable Inbox and Windows persistence dependencies; preserve the original reader cleanup boundary and regenerate architecture proof.
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

- Source plan: `plans/archive/plan-20260922-0534-akn04-automation-summary.md`
- Deferred-goal ledger: `tasks/todos.md`
- Review file: `tasks/archive/review-20260923-0319-akn04-automation-summary.md`
- Notes file: `tasks/archive/notes-20260923-0319-akn04-automation-summary.md`
- Checks file: `.ai/harness/checks/latest.json`
- Run snapshots: `.ai/harness/runs/`
- Scope gate: edit only paths listed under `allowed_paths`; update this contract before widening scope.
- Completion gate: run `verify-sprint --prepare-acceptance`, record one typed AcceptanceReceipt under the frozen policy below, then run `verify-sprint`; review Markdown is projection only.

## Change Assessment

```json
{"protocol": 1, "oracles": [{"id": "automation", "kind": "deterministic_test", "paths": ["*"]}, {"id": "migration-integration", "kind": "runtime_readback", "paths": ["*"]}]}
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
  - plans/archive/plan-20260922-0534-akn04-automation-summary.md
  - tasks/archive/contract-20260923-0319-akn04-automation-summary.md
  - tasks/archive/review-20260923-0319-akn04-automation-summary.md
  - tasks/archive/notes-20260923-0319-akn04-automation-summary.md
  - tasks/todos.md
  - docs/researches/20260922-candidate-runtime-fixture-authority.md
  - docs/researches/20260922-operator-task-activity.md
  - docs/researches/20260922-task-reply-protocol.md
  - plans/archive/plan-20260922-0132-candidate-runtime-fixture-authority.md
  - plans/archive/plan-20260922-0204-akn03-protected-replies.md
  - plans/archive/plan-20260922-0321-akn04-placement.md
  - plans/archive/plan-20260922-0418-akn04-activity.md
  - plans/archive/plan-20260922-0450-akn04-context.md
  - plans/archive/plan-20260922-1417-akn03b-windows-fixture.md
  - plans/archive/plan-20260922-1425-akn04a-stack-refresh.md
  - plans/archive/plan-20260922-1452-akn03a-fixture-integration.md
  - plans/archive/plan-20260922-1548-akn03b-windows-identity.md
  - plans/plan-20260922-0204-akn03-protected-replies.md
  - plans/plan-20260922-0321-akn04-placement.md
  - plans/plan-20260922-0418-akn04-activity.md
  - plans/plan-20260922-0450-akn04-context.md
  - scripts/check-tarball-install-smoke.sh
  - src/core/fleet/task-reply.ts
  - src/core/operator/task-activity.ts
  - src/effects/engineers/task-inbox.ts
  - src/effects/fleet/task-inbox.ts
  - tasks/archive/contract-20260922-0148-candidate-runtime-fixture-authority.md
  - tasks/archive/contract-20260922-1403-akn03-protected-replies.md
  - tasks/archive/contract-20260922-1405-akn04-placement.md
  - tasks/archive/contract-20260922-1510-akn03a-fixture-integration.md
  - tasks/archive/contract-20260922-1532-akn03b-windows-fixture.md
  - tasks/archive/contract-20260922-1615-akn03b-windows-identity.md
  - tasks/archive/contract-20260922-1617-akn04a-stack-refresh.md
  - tasks/archive/contract-20260922-1632-akn04-activity.md
  - tasks/archive/contract-20260922-1646-akn04-context.md
  - tasks/archive/notes-20260922-0148-candidate-runtime-fixture-authority.md
  - tasks/archive/notes-20260922-1403-akn03-protected-replies.md
  - tasks/archive/notes-20260922-1405-akn04-placement.md
  - tasks/archive/notes-20260922-1510-akn03a-fixture-integration.md
  - tasks/archive/notes-20260922-1532-akn03b-windows-fixture.md
  - tasks/archive/notes-20260922-1615-akn03b-windows-identity.md
  - tasks/archive/notes-20260922-1617-akn04a-stack-refresh.md
  - tasks/archive/notes-20260922-1632-akn04-activity.md
  - tasks/archive/notes-20260922-1646-akn04-context.md
  - tasks/archive/review-20260922-0148-candidate-runtime-fixture-authority.md
  - tasks/archive/review-20260922-1403-akn03-protected-replies.md
  - tasks/archive/review-20260922-1405-akn04-placement.md
  - tasks/archive/review-20260922-1510-akn03a-fixture-integration.md
  - tasks/archive/review-20260922-1532-akn03b-windows-fixture.md
  - tasks/archive/review-20260922-1615-akn03b-windows-identity.md
  - tasks/archive/review-20260922-1617-akn04a-stack-refresh.md
  - tasks/archive/review-20260922-1632-akn04-activity.md
  - tasks/archive/review-20260922-1646-akn04-context.md
  - tasks/archive/todo-20260922-0148-candidate-runtime-fixture-authority.md
  - tasks/archive/todo-20260922-1403-akn03-protected-replies.md
  - tasks/archive/todo-20260922-1405-akn04-placement.md
  - tasks/archive/todo-20260922-1510-akn03a-fixture-integration.md
  - tasks/archive/todo-20260922-1532-akn03b-windows-fixture.md
  - tasks/archive/todo-20260922-1615-akn03b-windows-identity.md
  - tasks/archive/todo-20260922-1617-akn04a-stack-refresh.md
  - tasks/archive/todo-20260922-1632-akn04-activity.md
  - tasks/archive/todo-20260922-1646-akn04-context.md
  - tasks/contracts/20260922-0204-akn03-protected-replies.contract.md
  - tasks/contracts/20260922-0321-akn04-placement.contract.md
  - tasks/contracts/20260922-0418-akn04-activity.contract.md
  - tasks/contracts/20260922-0450-akn04-context.contract.md
  - tasks/contracts/20260922-0519-akn04-repository-snapshot.contract.md
  - tasks/notes/20260922-0204-akn03-protected-replies.notes.md
  - tasks/notes/20260922-0321-akn04-placement.notes.md
  - tasks/notes/20260922-0418-akn04-activity.notes.md
  - tasks/notes/20260922-0450-akn04-context.notes.md
  - tasks/notes/20260922-0519-akn04-repository-snapshot.notes.md
  - tasks/reviews/20260922-0204-akn03-protected-replies.review.md
  - tasks/reviews/20260922-0321-akn04-placement.review.md
  - tasks/reviews/20260922-0418-akn04-activity.review.md
  - tasks/reviews/20260922-0450-akn04-context.review.md
  - tasks/reviews/20260922-0519-akn04-repository-snapshot.review.md
  - tests/cli/mcp-http.test.ts
  - tests/effects/operator-task-activity.test.ts
  - tests/effects/task-reply.test.ts
  - tests/unit/candidate-bound-global-runtime-reconciliation.test.ts
  - tests/unit/task-reply.test.ts
  - .github/workflows/ci.yml
  - docs/researches/20260922-operator-repository-snapshot.md
  - docs/researches/20260922-operator-task-context.md
  - plans/plan-20260922-0519-akn04-repository-snapshot.md
  - src/effects/operator/task-activity-worker.ts
  - src/effects/operator/task-context-worker.ts
  - src/effects/operator/task-read-process.ts
  - tests/effects/operator-task-context.test.ts
  - deploy/task-inbox-layout-v2.md
  - docs/researches/20260922-task-inbox-portable-paths.md
  - docs/researches/20260923-windows-task-persistence.md
  - plans/archive/plan-20260922-0519-akn04-repository-snapshot.md
  - plans/archive/plan-20260922-1754-task-inbox-portable-paths.md
  - plans/archive/plan-20260923-0031-windows-task-persistence.md
  - src/cli/commands/fleet.ts
  - src/core/fleet/task-inbox-layout.ts
  - src/effects/engineers/binding-store.ts
  - src/effects/engineers/claim-actor-store.ts
  - src/effects/engineers/principal-store.ts
  - src/effects/evidence/atomic-append.ts
  - src/effects/fleet/task-inbox-layout-migration.ts
  - src/effects/fleet/task-inbox-layout.ts
  - src/effects/state/coordination-lease-store.ts
  - tasks/archive/contract-20260923-0235-windows-task-persistence.md
  - tasks/archive/contract-20260923-0253-task-inbox-portable-paths.md
  - tasks/archive/contract-20260923-0302-akn04-repository-snapshot.md
  - tasks/archive/notes-20260923-0235-windows-task-persistence.md
  - tasks/archive/notes-20260923-0253-task-inbox-portable-paths.md
  - tasks/archive/notes-20260923-0302-akn04-repository-snapshot.md
  - tasks/archive/review-20260923-0235-windows-task-persistence.md
  - tasks/archive/review-20260923-0253-task-inbox-portable-paths.md
  - tasks/archive/review-20260923-0302-akn04-repository-snapshot.md
  - tasks/archive/todo-20260923-0235-windows-task-persistence.md
  - tasks/archive/todo-20260923-0253-task-inbox-portable-paths.md
  - tasks/archive/todo-20260923-0302-akn04-repository-snapshot.md
  - tests/coordination-lease-store.test.ts
  - tests/effects/task-inbox-layout-migration.test.ts
  - tests/effects/task-inbox.test.ts
  - tests/unit/me0b-principal-store.test.ts
  - tests/unit/task-message-v1.test.ts
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
      "id": "activity-integration",
      "kind": "package_test",
      "path": "tests/effects/operator-task-activity.test.ts",
      "cwd": ".",
      "phase": "verification",
      "cost": "normal",
      "evidence_policy": "current_exact",
      "necessity": "Protocol2 Fleet result must preserve shared task-reader process cleanup after integration",
      "inputs": {
        "env": []
      }
    },
    {
      "id": "context-integration",
      "kind": "package_test",
      "path": "tests/effects/operator-task-context.test.ts",
      "cwd": ".",
      "phase": "verification",
      "cost": "normal",
      "evidence_policy": "current_exact",
      "necessity": "Protocol2 Fleet result must preserve shared task-reader process cleanup after integration",
      "inputs": {
        "env": []
      }
    },
    {
      "id": "migration-integration",
      "kind": "package_test",
      "path": "tests/effects/task-inbox-layout-migration.test.ts",
      "cwd": ".",
      "phase": "verification",
      "cost": "normal",
      "evidence_policy": "current_exact",
      "necessity": "Accepted storage migration remains safe when composed with repository automation observation",
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
      "command": "REPO_HARNESS_DIFF_BASE=b076513b REPO_HARNESS_DIFF_MODE=merge-base bash scripts/check-task-sync.sh",
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

- Accepted integration base b076513b (original implementation base e6c41fdc). Remove summary and transport revision together; durable authority is unchanged.

