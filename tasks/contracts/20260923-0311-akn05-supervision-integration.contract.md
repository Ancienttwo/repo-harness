# Task Contract: akn05-supervision-integration

> **Status**: Active
> **Plan**: plans/plan-20260923-0311-akn05-supervision-integration.md
> **Task Profile**: code-change
> <!-- legal values: code-change | docs-only | ledger-closeout | migration | eval-only | delegated-run | bugfix (omit for legacy passthrough); see docs/reference-configs/sprint-contracts.md -->
> **Owner**: ancienttwo
> **Capability ID**: root
> **Last Updated**: 2026-09-23 03:11
> **Review File**: `tasks/reviews/20260923-0311-akn05-supervision-integration.review.md`
> **Notes File**: `tasks/notes/20260923-0311-akn05-supervision-integration.notes.md`
> **Exemplar**: `docs/reference-configs/contract-brief-example.md`

## Why

PR439 currently includes obsolete reader-stack history. Its homepage must compose with the accepted scoped automation protocol without resurrecting retired readers or storage paths.

## Goal

Integrate the accepted automation-summary stack into the existing AKN-05a UI, verify the composition, and narrow PR439 to that published dependency branch.

## Scope

- In scope: exact accepted upstream integration, generated architecture proof, existing seven-file UI delta and behavior verification, PR base and evidence update. Freeze the accepted upstream SHA before canonical verification.
- Out of scope: new UI features, runtime installation, real migration, native admission, Campaign/canary activation and main merge.
- Invariant: scoped observations preserve original source authority; stale results cannot change drafts, task fences, POST or ACK state.

## Stop Conditions

- Stop and hand back to the parent if the change would require editing a path outside Allowed Paths.
- Stop if an Exit Criteria command cannot be run in this environment.
- Stop if Goal, Scope, or Exit Criteria are internally contradictory.

## Falsifier

The merge reintroduces a retired reader/storage authority, renders wrong-scope or stale observations as current, changes task message writes, or exceeds the existing seven-file UI product delta without a reproduced integration defect.

## Root Cause Evidence

Not applicable: bounded integration of previously accepted UI and reader stages; no new bug fix is claimed.

## Workflow Inventory

- Source plan: `plans/plan-20260923-0311-akn05-supervision-integration.md`
- Deferred-goal ledger: `tasks/todos.md`
- Review file: `tasks/reviews/20260923-0311-akn05-supervision-integration.review.md`
- Notes file: `tasks/notes/20260923-0311-akn05-supervision-integration.notes.md`
- Checks file: `.ai/harness/checks/latest.json`
- Run snapshots: `.ai/harness/runs/`
- Scope gate: edit only paths listed under `allowed_paths`; update this contract before widening scope.
- Completion gate: run `verify-sprint --prepare-acceptance`, record one typed AcceptanceReceipt under the frozen policy below, then run `verify-sprint`; review Markdown is projection only.

## Change Assessment

```json
{"protocol": 1, "oracles": [{"id": "ui", "kind": "deterministic_test", "paths": ["*"]}, {"id": "migration", "kind": "runtime_readback", "paths": ["*"]}]}
```

## Acceptance Policy

```json
{"protocol":2,"reviewer":"Codex","source":"codex-plugin","user_waiver":"allowed"}
```

## Allowed Paths

```yaml
allowed_paths:
  - .github/workflows/ci.yml
  - deploy/task-inbox-layout-v2.md
  - docs/architecture/.projection-manifest.json
  - docs/researches/20260922-candidate-runtime-fixture-authority.md
  - docs/researches/20260922-operator-repository-snapshot.md
  - docs/researches/20260922-operator-supervision-summary.md
  - docs/researches/20260922-operator-task-activity.md
  - docs/researches/20260922-operator-task-context.md
  - docs/researches/20260922-task-inbox-portable-paths.md
  - docs/researches/20260922-task-reply-protocol.md
  - docs/researches/20260923-windows-task-persistence.md
  - plans/archive/plan-20260922-0132-candidate-runtime-fixture-authority.md
  - plans/archive/plan-20260922-0204-akn03-protected-replies.md
  - plans/archive/plan-20260922-0321-akn04-placement.md
  - plans/archive/plan-20260922-0418-akn04-activity.md
  - plans/archive/plan-20260922-0450-akn04-context.md
  - plans/archive/plan-20260922-0519-akn04-repository-snapshot.md
  - plans/archive/plan-20260922-0600-akn05-supervision-summary.md
  - plans/archive/plan-20260922-1417-akn03b-windows-fixture.md
  - plans/archive/plan-20260922-1425-akn04a-stack-refresh.md
  - plans/archive/plan-20260922-1452-akn03a-fixture-integration.md
  - plans/archive/plan-20260922-1548-akn03b-windows-identity.md
  - plans/archive/plan-20260922-1754-task-inbox-portable-paths.md
  - plans/archive/plan-20260923-0031-windows-task-persistence.md
  - plans/plan-20260923-0311-akn05-supervision-integration.md
  - scripts/check-tarball-install-smoke.sh
  - src/cli/commands/fleet.ts
  - src/core/fleet/task-inbox-layout.ts
  - src/core/fleet/task-reply.ts
  - src/effects/engineers/binding-store.ts
  - src/effects/engineers/claim-actor-store.ts
  - src/effects/engineers/principal-store.ts
  - src/effects/engineers/task-inbox.ts
  - src/effects/evidence/atomic-append.ts
  - src/effects/fleet/task-inbox-layout-migration.ts
  - src/effects/fleet/task-inbox-layout.ts
  - src/effects/fleet/task-inbox.ts
  - src/effects/operator/server.ts
  - src/effects/operator/task-activity-worker.ts
  - src/effects/operator/task-context-worker.ts
  - src/effects/operator/task-read-process.ts
  - src/effects/state/coordination-lease-store.ts
  - src/operator-web/App.tsx
  - src/operator-web/AutomationSummary.tsx
  - src/operator-web/fixture.ts
  - src/operator-web/i18n.ts
  - src/operator-web/styles.css
  - tasks/archive/contract-20260922-0148-candidate-runtime-fixture-authority.md
  - tasks/archive/contract-20260922-1403-akn03-protected-replies.md
  - tasks/archive/contract-20260922-1405-akn04-placement.md
  - tasks/archive/contract-20260922-1406-akn05-supervision-summary.md
  - tasks/archive/contract-20260922-1510-akn03a-fixture-integration.md
  - tasks/archive/contract-20260922-1532-akn03b-windows-fixture.md
  - tasks/archive/contract-20260922-1615-akn03b-windows-identity.md
  - tasks/archive/contract-20260922-1617-akn04a-stack-refresh.md
  - tasks/archive/contract-20260922-1632-akn04-activity.md
  - tasks/archive/contract-20260922-1646-akn04-context.md
  - tasks/archive/contract-20260923-0235-windows-task-persistence.md
  - tasks/archive/contract-20260923-0253-task-inbox-portable-paths.md
  - tasks/archive/contract-20260923-0302-akn04-repository-snapshot.md
  - tasks/archive/notes-20260922-0148-candidate-runtime-fixture-authority.md
  - tasks/archive/notes-20260922-1403-akn03-protected-replies.md
  - tasks/archive/notes-20260922-1405-akn04-placement.md
  - tasks/archive/notes-20260922-1406-akn05-supervision-summary.md
  - tasks/archive/notes-20260922-1510-akn03a-fixture-integration.md
  - tasks/archive/notes-20260922-1532-akn03b-windows-fixture.md
  - tasks/archive/notes-20260922-1615-akn03b-windows-identity.md
  - tasks/archive/notes-20260922-1617-akn04a-stack-refresh.md
  - tasks/archive/notes-20260922-1632-akn04-activity.md
  - tasks/archive/notes-20260922-1646-akn04-context.md
  - tasks/archive/notes-20260923-0235-windows-task-persistence.md
  - tasks/archive/notes-20260923-0253-task-inbox-portable-paths.md
  - tasks/archive/notes-20260923-0302-akn04-repository-snapshot.md
  - tasks/archive/review-20260922-0148-candidate-runtime-fixture-authority.md
  - tasks/archive/review-20260922-1403-akn03-protected-replies.md
  - tasks/archive/review-20260922-1405-akn04-placement.md
  - tasks/archive/review-20260922-1406-akn05-supervision-summary.md
  - tasks/archive/review-20260922-1510-akn03a-fixture-integration.md
  - tasks/archive/review-20260922-1532-akn03b-windows-fixture.md
  - tasks/archive/review-20260922-1615-akn03b-windows-identity.md
  - tasks/archive/review-20260922-1617-akn04a-stack-refresh.md
  - tasks/archive/review-20260922-1632-akn04-activity.md
  - tasks/archive/review-20260922-1646-akn04-context.md
  - tasks/archive/review-20260923-0235-windows-task-persistence.md
  - tasks/archive/review-20260923-0253-task-inbox-portable-paths.md
  - tasks/archive/review-20260923-0302-akn04-repository-snapshot.md
  - tasks/archive/todo-20260922-0148-candidate-runtime-fixture-authority.md
  - tasks/archive/todo-20260922-1403-akn03-protected-replies.md
  - tasks/archive/todo-20260922-1405-akn04-placement.md
  - tasks/archive/todo-20260922-1406-akn05-supervision-summary.md
  - tasks/archive/todo-20260922-1510-akn03a-fixture-integration.md
  - tasks/archive/todo-20260922-1532-akn03b-windows-fixture.md
  - tasks/archive/todo-20260922-1615-akn03b-windows-identity.md
  - tasks/archive/todo-20260922-1617-akn04a-stack-refresh.md
  - tasks/archive/todo-20260922-1632-akn04-activity.md
  - tasks/archive/todo-20260922-1646-akn04-context.md
  - tasks/archive/todo-20260923-0235-windows-task-persistence.md
  - tasks/archive/todo-20260923-0253-task-inbox-portable-paths.md
  - tasks/archive/todo-20260923-0302-akn04-repository-snapshot.md
  - tasks/contracts/20260922-0534-akn04-automation-summary.contract.md
  - tasks/contracts/20260923-0311-akn05-supervision-integration.contract.md
  - tasks/notes/20260922-0519-akn04-repository-snapshot.notes.md
  - tasks/notes/20260922-0534-akn04-automation-summary.notes.md
  - tasks/notes/20260923-0311-akn05-supervision-integration.notes.md
  - tasks/reviews/20260922-0418-akn04-activity.review.md
  - tasks/reviews/20260922-0450-akn04-context.review.md
  - tasks/reviews/20260922-0519-akn04-repository-snapshot.review.md
  - tasks/reviews/20260922-0534-akn04-automation-summary.review.md
  - tasks/reviews/20260923-0311-akn05-supervision-integration.review.md
  - tasks/todos.md
  - tests/cli/mcp-http.test.ts
  - tests/cli/operator-serve.test.ts
  - tests/coordination-lease-store.test.ts
  - tests/effects/fleet-collector-process.test.ts
  - tests/effects/operator-task-activity.test.ts
  - tests/effects/operator-task-context.test.ts
  - tests/effects/task-inbox-layout-migration.test.ts
  - tests/effects/task-inbox.test.ts
  - tests/effects/task-reply.test.ts
  - tests/operator-web/operator-interactions.test.tsx
  - tests/operator-web/operator-ui.test.tsx
  - tests/unit/candidate-bound-global-runtime-reconciliation.test.ts
  - tests/unit/me0b-principal-store.test.ts
  - tests/unit/task-message-v1.test.ts
  - tests/unit/task-reply.test.ts
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
    - src/operator-web/AutomationSummary.tsx
    - docs/researches/20260922-operator-supervision-summary.md
  artifacts_exist: []
```

## Verification Plan

```json
{
  "protocol": 1,
  "checks": [
    {
      "id": "ui",
      "kind": "package_test",
      "path": "tests/operator-web/operator-ui.test.tsx",
      "cwd": ".",
      "phase": "verification",
      "cost": "normal",
      "evidence_policy": "current_exact",
      "necessity": "Existing supervision display and native-evidence gaps",
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
      "necessity": "Scope switches, cancellation, refresh and draft fences",
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
      "necessity": "Existing collaboration views remain intact",
      "inputs": {
        "env": []
      }
    },
    {
      "id": "task-diff",
      "kind": "package_test",
      "path": "tests/operator-web/operator-task-diff.test.tsx",
      "cwd": ".",
      "phase": "verification",
      "cost": "normal",
      "evidence_policy": "current_exact",
      "necessity": "Existing Task detail composition remains intact",
      "inputs": {
        "env": []
      }
    },
    {
      "id": "automation",
      "kind": "package_test",
      "path": "tests/effects/operator-automation-summary.test.ts",
      "cwd": ".",
      "phase": "verification",
      "cost": "normal",
      "evidence_policy": "current_exact",
      "necessity": "Original source records compose with the displayed summary",
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
      "necessity": "Real HTTP observation protocol and reader process cleanup",
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
      "necessity": "Shared collector lifecycle and protocol",
      "inputs": {
        "env": []
      }
    },
    {
      "id": "migration",
      "kind": "package_test",
      "path": "tests/effects/task-inbox-layout-migration.test.ts",
      "cwd": ".",
      "phase": "verification",
      "cost": "normal",
      "evidence_policy": "current_exact",
      "necessity": "Inherited irreversible-effect dependency preserves guarded rollback",
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
      "necessity": "Required repository integrity or browser composition verification",
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
      "necessity": "Required repository integrity or browser composition verification",
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
      "necessity": "Required repository integrity or browser composition verification",
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
      "necessity": "Required repository integrity or browser composition verification",
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
      "necessity": "Required repository integrity or browser composition verification",
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
      "necessity": "Required repository integrity or browser composition verification",
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
      "necessity": "Required repository integrity or browser composition verification",
      "inputs": {
        "env": []
      }
    },
    {
      "id": "task-sync",
      "kind": "command",
      "command": "REPO_HARNESS_DIFF_BASE=76f989cc REPO_HARNESS_DIFF_MODE=merge-base bash scripts/check-task-sync.sh",
      "cwd": ".",
      "phase": "verification",
      "cost": "normal",
      "evidence_policy": "current_exact",
      "necessity": "Required repository integrity or browser composition verification",
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
      "necessity": "Required repository integrity or browser composition verification",
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
      "necessity": "Required repository integrity or browser composition verification",
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
      "necessity": "Required repository integrity or browser composition verification",
      "inputs": {
        "env": []
      }
    }
  ]
}
```

## Acceptance Notes (Human Review)

Existing UI and real source/HTTP suites cover this composition without a new test file. Freeze the accepted upstream base and generated proof first. No repeat review of the already accepted UI; preserve its original disposition. Record truthful delegated stage acceptance under the owner autonomous execution instruction after current evidence. Hosted CI remains distinct from local checks; no installed or native execution claim follows from either.

## Rollback Point

- Candidate base: automation-summary76f989cc; replace with its final accepted SHA before canonical evidence.
- Revert only this integration to original PR439 head796b3746; no stored authority is migrated.
