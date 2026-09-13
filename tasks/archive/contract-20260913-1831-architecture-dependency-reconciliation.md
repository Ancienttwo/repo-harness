> **Archived**: 2026-09-13 18:31
> **Related Plan**: plans/archive/plan-20260913-1807-architecture-dependency-reconciliation.md
> **Outcome**: Completed
> **Lifecycle**: contract
> **Parent Run ID**: run-20260913-1831
> **Archive Projection V1**: `plans/plan-20260913-1807-architecture-dependency-reconciliation.md` => `plans/archive/plan-20260913-1807-architecture-dependency-reconciliation.md`
> **Archive Projection V1**: `tasks/notes/20260913-1807-architecture-dependency-reconciliation.notes.md` => `tasks/archive/notes-20260913-1831-architecture-dependency-reconciliation.md`
> **Archive Projection V1**: `tasks/contracts/20260913-1807-architecture-dependency-reconciliation.contract.md` => `tasks/archive/contract-20260913-1831-architecture-dependency-reconciliation.md`
> **Archive Projection V1**: `tasks/reviews/20260913-1807-architecture-dependency-reconciliation.review.md` => `tasks/archive/review-20260913-1831-architecture-dependency-reconciliation.md`

# Task Contract: architecture-dependency-reconciliation

> **Status**: Fulfilled
> **Plan**: plans/archive/plan-20260913-1807-architecture-dependency-reconciliation.md
> **Task Profile**: bugfix
> <!-- legal values: code-change | docs-only | ledger-closeout | migration | eval-only | delegated-run | bugfix (omit for legacy passthrough); see docs/reference-configs/sprint-contracts.md -->
> **Owner**: kito
> **Capability ID**: root
> **Last Updated**: 2026-09-13 18:07
> **Review File**: `tasks/archive/review-20260913-1831-architecture-dependency-reconciliation.md`
> **Notes File**: `tasks/archive/notes-20260913-1831-architecture-dependency-reconciliation.md`
> **Exemplar**: `docs/reference-configs/contract-brief-example.md`

## Why

The globally owned archctx dependency is refreshed by update, but target repository precedence allows an unrelated stale copy to block that updated runtime.

## Goal

Resolve archctx from the running repo-harness package or the explicit candidate consumer root, never from the architecture target repository.

## Scope

- In scope: provider resolution authority, existing provider regression coverage and operator documentation.
- Out of scope: init dependency installs, package version changes, model discovery and release publication.
- Taste constraints: one runtime dependency owner; no repo override, fallback or new dependency.

## Stop Conditions

- Stop and hand back to the parent if the change would require editing a path outside Allowed Paths.
- Stop if an Exit Criteria command cannot be run in this environment.
- Stop if Goal, Scope, or Exit Criteria are internally contradictory.

## Falsifier

If a target archctx copy can affect which executable is used, or a broken runtime silently selects the target copy, the fix is invalid. Test both differing and matching target versions and retain runtime mismatch rejection.

## Root Cause Evidence

- root_cause: src/effects/architecture/archctx-provider.ts resolveArchctxForRepo checks the target repo dependency tree before the running package, overriding the globally updated provider.
- repro: invoke archctxCapabilities on a fixture target with stale archctx while the running package has the required version.
- regression_guard: tests/architecture-projection-provider.test.ts
- pre_fix_failure_artifact: .ai/harness/failures/architecture-runtime-owner-pre-fix.log

## Workflow Inventory

- Source plan: `plans/archive/plan-20260913-1807-architecture-dependency-reconciliation.md`
- Deferred-goal ledger: `tasks/todos.md`
- Review file: `tasks/archive/review-20260913-1831-architecture-dependency-reconciliation.md`
- Notes file: `tasks/archive/notes-20260913-1831-architecture-dependency-reconciliation.md`
- Checks file: `.ai/harness/checks/latest.json`
- Run snapshots: `.ai/harness/runs/`
- Scope gate: edit only paths listed under `allowed_paths`; update this contract before widening scope.
- Completion gate: run `verify-sprint --prepare-acceptance`, record one typed AcceptanceReceipt under the frozen policy below, then run `verify-sprint`; review Markdown is projection only.

## Change Assessment

```json
{"protocol":1,"oracles":[]}
```

## Acceptance Policy

```json
{"protocol":2,"reviewer":"Codex","source":"codex-plugin","user_waiver":"allowed"}
```

## Allowed Paths

```yaml
allowed_paths:
  - .ai/harness/failures/architecture-runtime-owner-pre-fix.log
  - src/effects/architecture/archctx-provider.ts
  - tests/architecture-projection-provider.test.ts
  - assets/reference-configs/external-tooling.md
  - docs/reference-configs/external-tooling.md
  - docs/architecture/
  - tasks/todos.md
  - plans/archive/plan-20260913-1807-architecture-dependency-reconciliation.md
  - tasks/archive/contract-20260913-1831-architecture-dependency-reconciliation.md
  - tasks/archive/review-20260913-1831-architecture-dependency-reconciliation.md
  - tasks/archive/notes-20260913-1831-architecture-dependency-reconciliation.md
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

This block contains only non-executable artifact requirements. Define every
executable check once in the canonical Verification Plan below. Each check must
state its phase, cost, evidence policy, necessity, and input environment; a
missing or malformed plan fails closed. Populate artifact requirements only
for deliverables this task actually owns; do not create a spec, notes or report
merely to fill this template.

```yaml
exit_criteria:
  files_exist: []
  artifacts_exist: []
```

## Verification Plan

```json
{
  "protocol": 1,
  "checks": [
    {
      "id": "provider",
      "kind": "package_test",
      "path": "tests/architecture-projection-provider.test.ts",
      "cwd": ".",
      "phase": "verification",
      "cost": "normal",
      "evidence_policy": "current_exact",
      "necessity": "Exercise runtime-owned provider selection and preserve protocol/snapshot enforcement.",
      "inputs": {
        "env": []
      }
    },
    {
      "id": "integrity-1",
      "kind": "command",
      "command": "bun run check:hooks",
      "cwd": ".",
      "phase": "verification",
      "cost": "normal",
      "evidence_policy": "current_exact",
      "necessity": "Required repository integrity or adoption parity check.",
      "inputs": {
        "env": []
      }
    },
    {
      "id": "integrity-2",
      "kind": "command",
      "command": "bun run check:helpers",
      "cwd": ".",
      "phase": "verification",
      "cost": "normal",
      "evidence_policy": "current_exact",
      "necessity": "Required repository integrity or adoption parity check.",
      "inputs": {
        "env": []
      }
    },
    {
      "id": "integrity-3",
      "kind": "command",
      "command": "bun run check:reference-configs",
      "cwd": ".",
      "phase": "verification",
      "cost": "normal",
      "evidence_policy": "current_exact",
      "necessity": "Required repository integrity or adoption parity check.",
      "inputs": {
        "env": []
      }
    },
    {
      "id": "integrity-4",
      "kind": "command",
      "command": "bash scripts/check-deploy-sql-order.sh",
      "cwd": ".",
      "phase": "verification",
      "cost": "normal",
      "evidence_policy": "current_exact",
      "necessity": "Required repository integrity or adoption parity check.",
      "inputs": {
        "env": []
      }
    },
    {
      "id": "integrity-5",
      "kind": "command",
      "command": "bash scripts/check-architecture-sync.sh",
      "cwd": ".",
      "phase": "verification",
      "cost": "normal",
      "evidence_policy": "current_exact",
      "necessity": "Required repository integrity or adoption parity check.",
      "inputs": {
        "env": []
      }
    },
    {
      "id": "integrity-6",
      "kind": "command",
      "command": "bash scripts/check-task-sync.sh",
      "cwd": ".",
      "phase": "verification",
      "cost": "normal",
      "evidence_policy": "current_exact",
      "necessity": "Required repository integrity or adoption parity check.",
      "inputs": {
        "env": []
      }
    },
    {
      "id": "integrity-7",
      "kind": "command",
      "command": "bash scripts/check-task-workflow.sh --strict",
      "cwd": ".",
      "phase": "verification",
      "cost": "normal",
      "evidence_policy": "current_exact",
      "necessity": "Required repository integrity or adoption parity check.",
      "inputs": {
        "env": []
      }
    },
    {
      "id": "integrity-8",
      "kind": "command",
      "command": "bun scripts/inspect-project-state.ts --repo . --format text",
      "cwd": ".",
      "phase": "verification",
      "cost": "normal",
      "evidence_policy": "current_exact",
      "necessity": "Required repository integrity or adoption parity check.",
      "inputs": {
        "env": []
      }
    },
    {
      "id": "integrity-9",
      "kind": "command",
      "command": "bun src/cli/index.ts init --repo . --dry-run",
      "cwd": ".",
      "phase": "verification",
      "cost": "normal",
      "evidence_policy": "current_exact",
      "necessity": "Required repository integrity or adoption parity check.",
      "inputs": {
        "env": []
      }
    }
  ]
}
```

Author the actual checks using [Testing Policy and Artifact Standards](../../docs/reference-configs/sprint-contracts.md#testing-policy-and-artifact-standards).
The empty array is not permission to omit required repository checks: retain it
only when no executable criterion applies and explain why in Acceptance Notes.
Prefer existing covering tests; creating a task-named test or adding typecheck
is not a template requirement. For each selected check declare `id`, `kind`,
`cwd`, `phase`, `cost`, `evidence_policy`, `necessity`, `inputs.env`, and its
`command` or `path`. Declare the same execution once, including checks nested
inside aggregate scripts. Use `baseline_with_delta` only with an immutable
baseline and named current delta checks; never infer it from paths or command text.

## Acceptance Notes (Human Review)

- Existing provider tests cover package resolution, exact version and protocol checks; update two tests that encoded target override and add broken-runtime rejection with a healthy target.
- A mocked provider process captures the selected binary; real filesystem package fixtures exercise resolution. No new test file or dependency.
- Focused provider tests and required repository integrity checks suffice; no full suite or benchmark.
- The user clarified runtime ownership is global. The earlier init-install candidate was withdrawn before merge and is absent from the final diff.

## Rollback Point

- Commit / checkpoint: f1596f09.
- Revert strategy: revert the command and documentation changes; retain the manifest/lockfile-consistent installed environment.
