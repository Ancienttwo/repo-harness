> **Archived**: 2026-09-23 14:09
> **Related Plan**: plans/archive/plan-20260922-0655-akn05-task-evidence.md
> **Outcome**: Superseded
> **Lifecycle**: contract
> **Parent Run ID**: run-20260923-1409
> **Archive Projection V1**: `plans/plan-20260922-0655-akn05-task-evidence.md` => `plans/archive/plan-20260922-0655-akn05-task-evidence.md`
> **Archive Projection V1**: `tasks/notes/20260922-0655-akn05-task-evidence.notes.md` => `tasks/archive/notes-20260923-1409-akn05-task-evidence.md`
> **Archive Projection V1**: `tasks/contracts/20260922-0655-akn05-task-evidence.contract.md` => `tasks/archive/contract-20260923-1409-akn05-task-evidence.md`
> **Archive Projection V1**: `tasks/reviews/20260922-0655-akn05-task-evidence.review.md` => `tasks/archive/review-20260923-1409-akn05-task-evidence.md`

# Task Contract: akn05-task-evidence

> **Status**: Partial
> **Plan**: plans/archive/plan-20260922-0655-akn05-task-evidence.md
> **Task Profile**: code-change
> <!-- legal values: code-change | docs-only | ledger-closeout | migration | eval-only | delegated-run | bugfix (omit for legacy passthrough); see docs/reference-configs/sprint-contracts.md -->
> **Owner**: ancienttwo
> **Capability ID**: root
> **Last Updated**: 2026-09-22 06:55
> **Review File**: `tasks/archive/review-20260923-1409-akn05-task-evidence.md`
> **Notes File**: `tasks/archive/notes-20260923-1409-akn05-task-evidence.md`
> **Exemplar**: `docs/reference-configs/contract-brief-example.md`

## Why

Expose the already recorded task and steer evidence so human supervision can trace receipt and response without inducing domain effects.

## Goal

AKN-05b shared detail shows exact-scope canonical context and bounded historical messages with recorded actor provenance, independent failure and cancellation.

## Scope

- In scope: read-only context/activity integration, original evidence, exact message lookup, page replacement, bilingual UI and tests; shared720px overlay/full-screen detail with focus, scroll lock, IME and draft preservation.
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

- Source plan: `plans/archive/plan-20260922-0655-akn05-task-evidence.md`
- Deferred-goal ledger: `tasks/todos.md`
- Review file: `tasks/archive/review-20260923-1409-akn05-task-evidence.md`
- Notes file: `tasks/archive/notes-20260923-1409-akn05-task-evidence.md`
- Checks file: `.ai/harness/checks/latest.json`
- Run snapshots: `.ai/harness/runs/`
- Scope gate: edit only paths listed under `allowed_paths`; update this contract before widening scope.
- Completion gate: run `verify-sprint --prepare-acceptance`, record one typed AcceptanceReceipt under the frozen policy below, then run `verify-sprint`; review Markdown is projection only.

## Change Assessment

```json
{"protocol": 1, "oracles": [{"id": "interactions", "kind": "deterministic_test", "paths": ["*"]}, {"id": "migration", "kind": "runtime_readback", "paths": ["*"]}]}
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
  - docs/researches/20260922-operator-task-activity.md
  - docs/researches/20260922-operator-task-context.md
  - docs/researches/20260922-operator-task-evidence.md
  - docs/researches/20260922-task-inbox-portable-paths.md
  - docs/researches/20260922-task-reply-protocol.md
  - docs/researches/20260923-windows-task-persistence.md
  - plans/archive/plan-20260922-0132-candidate-runtime-fixture-authority.md
  - plans/archive/plan-20260922-0204-akn03-protected-replies.md
  - plans/archive/plan-20260922-0321-akn04-placement.md
  - plans/archive/plan-20260922-0418-akn04-activity.md
  - plans/archive/plan-20260922-0450-akn04-context.md
  - plans/archive/plan-20260922-0519-akn04-repository-snapshot.md
  - plans/archive/plan-20260922-0534-akn04-automation-summary.md
  - plans/archive/plan-20260922-0600-akn05-supervision-summary.md
  - plans/archive/plan-20260922-1417-akn03b-windows-fixture.md
  - plans/archive/plan-20260922-1425-akn04a-stack-refresh.md
  - plans/archive/plan-20260922-1452-akn03a-fixture-integration.md
  - plans/archive/plan-20260922-1548-akn03b-windows-identity.md
  - plans/archive/plan-20260922-1754-task-inbox-portable-paths.md
  - plans/archive/plan-20260923-0031-windows-task-persistence.md
  - plans/archive/plan-20260923-0311-akn05-supervision-integration.md
  - plans/archive/plan-20260922-0655-akn05-task-evidence.md
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
  - src/operator-web/TaskEvidence.tsx
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
  - tasks/archive/contract-20260923-0319-akn04-automation-summary.md
  - tasks/archive/contract-20260923-0326-akn05-supervision-integration.md
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
  - tasks/archive/notes-20260923-0319-akn04-automation-summary.md
  - tasks/archive/notes-20260923-0326-akn05-supervision-integration.md
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
  - tasks/archive/review-20260923-0319-akn04-automation-summary.md
  - tasks/archive/review-20260923-0326-akn05-supervision-integration.md
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
  - tasks/archive/todo-20260923-0319-akn04-automation-summary.md
  - tasks/archive/todo-20260923-0326-akn05-supervision-integration.md
  - tasks/archive/contract-20260923-1409-akn05-task-evidence.md
  - tasks/notes/20260922-0519-akn04-repository-snapshot.notes.md
  - tasks/notes/20260922-0534-akn04-automation-summary.notes.md
  - tasks/archive/notes-20260923-1409-akn05-task-evidence.md
  - tasks/reviews/20260922-0418-akn04-activity.review.md
  - tasks/reviews/20260922-0450-akn04-context.review.md
  - tasks/reviews/20260922-0519-akn04-repository-snapshot.review.md
  - tasks/reviews/20260922-0534-akn04-automation-summary.review.md
  - tasks/archive/review-20260923-1409-akn05-task-evidence.md
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
      "id": "migration-runtime",
      "kind": "package_test",
      "path": "tests/effects/task-inbox-layout-migration.test.ts",
      "cwd": ".",
      "phase": "verification",
      "cost": "normal",
      "evidence_policy": "current_exact",
      "necessity": "Verify inherited task evidence readers and guarded migration against the frozen source base",
      "inputs": {
        "env": []
      }
    },
    {
      "id": "operator-serve",
      "kind": "package_test",
      "path": "tests/cli/operator-serve.test.ts",
      "cwd": ".",
      "phase": "verification",
      "cost": "normal",
      "evidence_policy": "current_exact",
      "necessity": "Verify inherited task evidence readers and guarded migration against the frozen source base",
      "inputs": {
        "env": []
      }
    },
    {
      "id": "http-integration",
      "kind": "package_test",
      "path": "tests/cli/mcp-http.test.ts",
      "cwd": ".",
      "phase": "verification",
      "cost": "normal",
      "evidence_policy": "current_exact",
      "necessity": "Verify inherited task evidence readers and guarded migration against the frozen source base",
      "inputs": {
        "env": []
      }
    },
    {
      "id": "activity-source",
      "kind": "package_test",
      "path": "tests/effects/operator-task-activity.test.ts",
      "cwd": ".",
      "phase": "verification",
      "cost": "normal",
      "evidence_policy": "current_exact",
      "necessity": "Verify inherited task evidence readers and guarded migration against the frozen source base",
      "inputs": {
        "env": []
      }
    },
    {
      "id": "context-source",
      "kind": "package_test",
      "path": "tests/effects/operator-task-context.test.ts",
      "cwd": ".",
      "phase": "verification",
      "cost": "normal",
      "evidence_policy": "current_exact",
      "necessity": "Verify inherited task evidence readers and guarded migration against the frozen source base",
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
      "command": "REPO_HARNESS_DIFF_BASE=164f3f52ab26f3ca576c7c3a3349253599db5ece REPO_HARNESS_DIFF_MODE=merge-base bash scripts/check-task-sync.sh",
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

Freeze upstream source and PR base at `164f3f52ab26f3ca576c7c3a3349253599db5ece`; inherited paths are enumerated above. The new Task Evidence product delta stays a read-only six-file UI boundary. Existing source reader and migration suites are current exact evidence; neither historical AKN-05a acceptance nor its hosted CI substitutes for this slice's semantic review.

The detail layout continuation removes wide complementary mode, makes modality independent of viewport and moves the existing overview facts into a secondary disclosure. Verify wide/narrow and live resize without remounting Composer, preserving focus and restoring it on close.

Existing UI suites own this interaction boundary; extend them rather than adding a task-named suite. Inspect built wide/narrow EN/ZH fixture. Architecture and canonical verification precede one semantic acceptance. This does not prove native execution or complete AKN-05.

## Rollback Point

- Base: 164f3f52ab26f3ca576c7c3a3349253599db5ece (accepted AKN-05a integration; source and PR base)
- Remove read-only detail integration; durable records remain untouched.

