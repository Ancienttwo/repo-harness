# Task Contract: akn05-organization

> **Status**: Active
> **Plan**: plans/plan-20260922-0734-akn05-organization.md
> **Task Profile**: code-change
> <!-- legal values: code-change | docs-only | ledger-closeout | migration | eval-only | delegated-run | bugfix (omit for legacy passthrough); see docs/reference-configs/sprint-contracts.md -->
> **Owner**: ancienttwo
> **Capability ID**: root
> **Last Updated**: 2026-09-22 06:55
> **Review File**: `tasks/reviews/20260922-0734-akn05-organization.review.md`
> **Notes File**: `tasks/notes/20260922-0734-akn05-organization.notes.md`
> **Exemplar**: `docs/reference-configs/contract-brief-example.md`

## Why

Expose existing Engineer/Binding responsibility and observation gaps on the default supervision page.

## Goal

AKN-05c reads WorkExchange and Engineering Board independently through collaboration protocol2 and renders redacted Organization observations.

## Scope

- In scope: protocol2 required envelope, independent source status, Organization redaction/strict decoding, default scoped summary, tests and evidence.
- Out of scope: formal Decision inventory, Planning graph, write admission, native execution, main merge and runtime install.
- Invariant: upstream owner/reason/count semantics remain authoritative; unknown observation never becomes running; reads do not execute domain actions.

## Stop Conditions

- Stop if required source authority is absent or a change needs an unapproved path.
- Preserve pending predecessor acceptance; do not claim a source failure as empty.

## Falsifier

A private host/path crosses the browser boundary, one failed source hides the other, scope changes show old repository facts as current, or a GET triggers a domain write.

## Root Cause Evidence

Not applicable: new observation transport and UI from existing domain authority.

## Workflow Inventory

- Source plan: `plans/plan-20260922-0734-akn05-organization.md`
- Deferred-goal ledger: `tasks/todos.md`
- Review file: `tasks/reviews/20260922-0734-akn05-organization.review.md`
- Notes file: `tasks/notes/20260922-0734-akn05-organization.notes.md`
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
  - src/core/operator/organization-snapshot.ts
  - src/core/operator/collaboration-snapshot.ts
  - src/effects/operator/collaboration.ts
  - src/effects/operator/collaboration-worker.ts
  - src/effects/operator/server.ts
  - src/operator-web/types.ts
  - src/operator-web/App.tsx
  - src/operator-web/OrganizationSummary.tsx
  - src/operator-web/fixture.ts
  - src/operator-web/i18n.ts
  - src/operator-web/styles.css
  - tests/operator-web/operator-collaboration.test.tsx
  - tests/operator-web/operator-interactions.test.tsx
  - tests/unit/operator-web-types.test.ts
  - tests/effects/operator-write-boundary.test.ts
  - tests/cli/operator-serve.test.ts
  - docs/researches/20260922-operator-organization.md
  - docs/architecture/.projection-manifest.json
  - plans/plan-20260922-0734-akn05-organization.md
  - tasks/contracts/20260922-0734-akn05-organization.contract.md
  - tasks/reviews/20260922-0734-akn05-organization.review.md
  - tasks/notes/20260922-0734-akn05-organization.notes.md
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
    - src/operator-web/OrganizationSummary.tsx
    - docs/researches/20260922-operator-organization.md
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
      "necessity": "Organization source identity/redaction, original UI behavior and required repository integrity",
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
      "necessity": "Organization source identity/redaction, original UI behavior and required repository integrity",
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
      "necessity": "Organization source identity/redaction, original UI behavior and required repository integrity",
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
      "necessity": "Organization source identity/redaction, original UI behavior and required repository integrity",
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
      "necessity": "Organization source identity/redaction, original UI behavior and required repository integrity",
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
      "necessity": "Organization source identity/redaction, original UI behavior and required repository integrity",
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
      "necessity": "Organization source identity/redaction, original UI behavior and required repository integrity",
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
      "necessity": "Organization source identity/redaction, original UI behavior and required repository integrity",
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
      "necessity": "Organization source identity/redaction, original UI behavior and required repository integrity",
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
      "necessity": "Organization source identity/redaction, original UI behavior and required repository integrity",
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
      "necessity": "Organization source identity/redaction, original UI behavior and required repository integrity",
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
      "necessity": "Organization source identity/redaction, original UI behavior and required repository integrity",
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
      "necessity": "Organization source identity/redaction, original UI behavior and required repository integrity",
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
      "necessity": "Organization source identity/redaction, original UI behavior and required repository integrity",
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
      "necessity": "Organization source identity/redaction, original UI behavior and required repository integrity",
      "inputs": {
        "env": []
      }
    },
    {
      "id": "protocol",
      "kind": "package_test",
      "path": "tests/unit/operator-web-types.test.ts",
      "cwd": ".",
      "phase": "verification",
      "cost": "normal",
      "evidence_policy": "current_exact",
      "necessity": "Organization source identity/redaction, original UI behavior and required repository integrity",
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
      "necessity": "Organization source identity/redaction, original UI behavior and required repository integrity",
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
      "necessity": "Organization source identity/redaction, original UI behavior and required repository integrity",
      "inputs": {
        "env": []
      }
    }
  ]
}
```

## Acceptance Notes (Human Review)

Default Organization summary uses original Engineer/Binding and attention source semantics. An unavailable source remains explicit; formal Decision and complete three-view navigation are not claimed. Run canonical evidence and one semantic acceptance only after source freeze.

## Rollback Point

- Base: 65cefd7d
- Revert server/browser protocol together; no durable state mutation.
