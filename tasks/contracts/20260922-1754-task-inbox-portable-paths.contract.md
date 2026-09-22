# Task Contract: task-inbox-portable-paths

> **Status**: Active
> **Plan**: plans/plan-20260922-1754-task-inbox-portable-paths.md
> **Task Profile**: code-change
> <!-- legal values: code-change | docs-only | ledger-closeout | migration | eval-only | delegated-run | bugfix (omit for legacy passthrough); see docs/reference-configs/sprint-contracts.md -->
> **Owner**: ancienttwo
> **Capability ID**: root
> **Last Updated**: 2026-09-22 18:01
> **Review File**: `tasks/reviews/20260922-1754-task-inbox-portable-paths.review.md`
> **Notes File**: `tasks/notes/20260922-1754-task-inbox-portable-paths.notes.md`
> **Exemplar**: `docs/reference-configs/contract-brief-example.md`

## Why

Native Windows cannot create canonical Task Inbox recipient paths. Reader stage acceptance is blocked; a path-only fixture workaround would disagree with the persistence authority.

## Goal

Deliver one portable v2 storage layout plus explicit offline byte-preserving migration, recovery and guarded rollback; preserve all original semantic identity and authorization.

## Scope

- In scope: the approved migration design, all Task Inbox path consumers, offline CLI, native fixtures and exact-boundary verification.
- Out of scope: real data migration, architecture-queue, main merge, global installation, Host admission and homepage features.
- Taste constraints: <!-- advisory only, no run gate; default style/taste lives in AGENTS.md and the minimal-change policy, use this to record a per-task override -->

## Stop Conditions

- Stop and hand back to the parent if the change would require editing a path outside Allowed Paths.
- Stop if an Exit Criteria command cannot be run in this environment.
- Stop if Goal, Scope, or Exit Criteria are internally contradictory.

## Falsifier

A canonical record digest changes during migration, an old layout appears as empty history, or native delivery/ACK/reply cannot use the new paths.

## Root Cause Evidence

- root_cause: src/effects/fleet/task-inbox.ts embeds the colon-bearing semantic recipient key directly in delivery and reply filesystem components, rejected by Windows.
- repro: native Windows CI35710331815; local portable-component regression in the existing effects suite.
- regression_guard: tests/effects/task-inbox.test.ts
- pre_fix_failure_artifact: .ai/harness/runs/task-inbox-portable-paths/before.log

## Workflow Inventory

- Source plan: `plans/plan-20260922-1754-task-inbox-portable-paths.md`
- Deferred-goal ledger: `tasks/todos.md`
- Review file: `tasks/reviews/20260922-1754-task-inbox-portable-paths.review.md`
- Notes file: `tasks/notes/20260922-1754-task-inbox-portable-paths.notes.md`
- Checks file: `.ai/harness/checks/latest.json`
- Run snapshots: `.ai/harness/runs/`
- Scope gate: edit only paths listed under `allowed_paths`; update this contract before widening scope.
- Completion gate: run `verify-sprint --prepare-acceptance`, record one typed AcceptanceReceipt under the frozen policy below, then run `verify-sprint`; review Markdown is projection only.

## Change Assessment

```json
{"protocol":1,"oracles":[{"id":"migration","kind":"deterministic_test","paths":["*"]},{"id":"owner-7","kind":"runtime_readback","paths":["*"]}]}
```

## Acceptance Policy

```json
{"protocol":2,"reviewer":"Codex","source":"codex-plugin","user_waiver":"allowed"}
```

## Allowed Paths

```yaml
allowed_paths:
  - src/core/fleet/task-inbox-layout.ts
  - src/effects/fleet/task-inbox-layout.ts
  - src/effects/fleet/task-inbox-layout-migration.ts
  - src/effects/fleet/task-inbox.ts
  - src/cli/commands/fleet.ts
  - tests/unit/task-message-v1.test.ts
  - tests/unit/task-inbox-v1.test.ts
  - tests/effects/task-inbox.test.ts
  - tests/effects/task-reply.test.ts
  - tests/effects/operator-task-activity.test.ts
  - tests/effects/operator-task-context.test.ts
  - tests/effects/task-inbox-layout-migration.test.ts
  - tests/cli/fleet-task-inbox.test.ts
  - tests/task-inbox-hook.test.ts
  - tests/cli/mcp-http.test.ts
  - tests/cli/operator-serve.test.ts
  - .github/workflows/ci.yml
  - docs/researches/20260922-task-inbox-portable-paths.md
  - deploy/task-inbox-layout-v2.md
  - docs/architecture/.projection-manifest.json
  - plans/plan-20260922-1754-task-inbox-portable-paths.md
  - tasks/contracts/20260922-1754-task-inbox-portable-paths.contract.md
  - tasks/reviews/20260922-1754-task-inbox-portable-paths.review.md
  - tasks/notes/20260922-1754-task-inbox-portable-paths.notes.md
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

This block contains only non-executable artifact requirements. Define every
executable check once in the canonical Verification Plan below. Each check must
state its phase, cost, evidence policy, necessity, and input environment; a
missing or malformed plan fails closed. Populate artifact requirements only
for deliverables this task actually owns; do not create a spec, notes or report
merely to fill this template.

```yaml
exit_criteria:
  files_exist:
    - src/core/fleet/task-inbox-layout.ts
    - src/effects/fleet/task-inbox-layout-migration.ts
    - deploy/task-inbox-layout-v2.md
  artifacts_exist:
    - .ai/harness/runs/task-inbox-portable-paths/before.log
```

## Verification Plan

```json
{
  "protocol": 1,
  "checks": [
    {
      "id": "owner-1",
      "kind": "package_test",
      "path": "tests/unit/task-message-v1.test.ts",
      "cwd": ".",
      "phase": "verification",
      "cost": "normal",
      "evidence_policy": "current_exact",
      "necessity": "Owning storage, migration, native reader or authenticated consumer boundary",
      "inputs": {
        "env": []
      }
    },
    {
      "id": "owner-2",
      "kind": "package_test",
      "path": "tests/unit/task-inbox-v1.test.ts",
      "cwd": ".",
      "phase": "verification",
      "cost": "normal",
      "evidence_policy": "current_exact",
      "necessity": "Owning storage, migration, native reader or authenticated consumer boundary",
      "inputs": {
        "env": []
      }
    },
    {
      "id": "owner-3",
      "kind": "package_test",
      "path": "tests/effects/task-inbox.test.ts",
      "cwd": ".",
      "phase": "verification",
      "cost": "normal",
      "evidence_policy": "current_exact",
      "necessity": "Owning storage, migration, native reader or authenticated consumer boundary",
      "inputs": {
        "env": []
      }
    },
    {
      "id": "owner-4",
      "kind": "package_test",
      "path": "tests/effects/task-reply.test.ts",
      "cwd": ".",
      "phase": "verification",
      "cost": "normal",
      "evidence_policy": "current_exact",
      "necessity": "Owning storage, migration, native reader or authenticated consumer boundary",
      "inputs": {
        "env": []
      }
    },
    {
      "id": "owner-5",
      "kind": "package_test",
      "path": "tests/effects/operator-task-activity.test.ts",
      "cwd": ".",
      "phase": "verification",
      "cost": "normal",
      "evidence_policy": "current_exact",
      "necessity": "Owning storage, migration, native reader or authenticated consumer boundary",
      "inputs": {
        "env": []
      }
    },
    {
      "id": "owner-6",
      "kind": "package_test",
      "path": "tests/effects/operator-task-context.test.ts",
      "cwd": ".",
      "phase": "verification",
      "cost": "normal",
      "evidence_policy": "current_exact",
      "necessity": "Owning storage, migration, native reader or authenticated consumer boundary",
      "inputs": {
        "env": []
      }
    },
    {
      "id": "owner-7",
      "kind": "package_test",
      "path": "tests/effects/task-inbox-layout-migration.test.ts",
      "cwd": ".",
      "phase": "verification",
      "cost": "normal",
      "evidence_policy": "current_exact",
      "necessity": "Owning storage, migration, native reader or authenticated consumer boundary",
      "inputs": {
        "env": []
      }
    },
    {
      "id": "owner-8",
      "kind": "package_test",
      "path": "tests/cli/fleet-task-inbox.test.ts",
      "cwd": ".",
      "phase": "verification",
      "cost": "normal",
      "evidence_policy": "current_exact",
      "necessity": "Owning storage, migration, native reader or authenticated consumer boundary",
      "inputs": {
        "env": []
      }
    },
    {
      "id": "owner-9",
      "kind": "package_test",
      "path": "tests/task-inbox-hook.test.ts",
      "cwd": ".",
      "phase": "verification",
      "cost": "normal",
      "evidence_policy": "current_exact",
      "necessity": "Owning storage, migration, native reader or authenticated consumer boundary",
      "inputs": {
        "env": []
      }
    },
    {
      "id": "owner-10",
      "kind": "package_test",
      "path": "tests/cli/mcp-http.test.ts",
      "cwd": ".",
      "phase": "verification",
      "cost": "normal",
      "evidence_policy": "current_exact",
      "necessity": "Owning storage, migration, native reader or authenticated consumer boundary",
      "inputs": {
        "env": []
      }
    },
    {
      "id": "owner-11",
      "kind": "package_test",
      "path": "tests/cli/operator-serve.test.ts",
      "cwd": ".",
      "phase": "verification",
      "cost": "normal",
      "evidence_policy": "current_exact",
      "necessity": "Owning storage, migration, native reader or authenticated consumer boundary",
      "inputs": {
        "env": []
      }
    },
    {
      "id": "integrity-1",
      "kind": "command",
      "command": "bun run check:type",
      "cwd": ".",
      "phase": "verification",
      "cost": "normal",
      "evidence_policy": "current_exact",
      "necessity": "Required repository integrity",
      "inputs": {
        "env": []
      }
    },
    {
      "id": "integrity-2",
      "kind": "command",
      "command": "bun run check:hooks",
      "cwd": ".",
      "phase": "verification",
      "cost": "normal",
      "evidence_policy": "current_exact",
      "necessity": "Required repository integrity",
      "inputs": {
        "env": []
      }
    },
    {
      "id": "integrity-3",
      "kind": "command",
      "command": "bun run check:helpers",
      "cwd": ".",
      "phase": "verification",
      "cost": "normal",
      "evidence_policy": "current_exact",
      "necessity": "Required repository integrity",
      "inputs": {
        "env": []
      }
    },
    {
      "id": "integrity-4",
      "kind": "command",
      "command": "bun run check:reference-configs",
      "cwd": ".",
      "phase": "verification",
      "cost": "normal",
      "evidence_policy": "current_exact",
      "necessity": "Required repository integrity",
      "inputs": {
        "env": []
      }
    },
    {
      "id": "integrity-5",
      "kind": "command",
      "command": "bash scripts/check-deploy-sql-order.sh",
      "cwd": ".",
      "phase": "verification",
      "cost": "normal",
      "evidence_policy": "current_exact",
      "necessity": "Required repository integrity",
      "inputs": {
        "env": []
      }
    },
    {
      "id": "integrity-6",
      "kind": "command",
      "command": "bash scripts/check-architecture-sync.sh",
      "cwd": ".",
      "phase": "verification",
      "cost": "normal",
      "evidence_policy": "current_exact",
      "necessity": "Required repository integrity",
      "inputs": {
        "env": []
      }
    },
    {
      "id": "integrity-7",
      "kind": "command",
      "command": "REPO_HARNESS_DIFF_BASE=12518117 REPO_HARNESS_DIFF_MODE=merge-base bash scripts/check-task-sync.sh",
      "cwd": ".",
      "phase": "verification",
      "cost": "normal",
      "evidence_policy": "current_exact",
      "necessity": "Required repository integrity",
      "inputs": {
        "env": []
      }
    },
    {
      "id": "integrity-8",
      "kind": "command",
      "command": "bash scripts/check-task-workflow.sh --strict",
      "cwd": ".",
      "phase": "verification",
      "cost": "normal",
      "evidence_policy": "current_exact",
      "necessity": "Required repository integrity",
      "inputs": {
        "env": []
      }
    },
    {
      "id": "integrity-9",
      "kind": "command",
      "command": "bun scripts/inspect-project-state.ts --repo . --format text",
      "cwd": ".",
      "phase": "verification",
      "cost": "normal",
      "evidence_policy": "current_exact",
      "necessity": "Required repository integrity",
      "inputs": {
        "env": []
      }
    },
    {
      "id": "integrity-10",
      "kind": "command",
      "command": "bun src/cli/index.ts init --repo . --dry-run",
      "cwd": ".",
      "phase": "verification",
      "cost": "normal",
      "evidence_policy": "current_exact",
      "necessity": "Required repository integrity",
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

Existing inbox/reply/reader suites own behavior; one new effects suite owns the independently meaningful migration recovery boundary. Native CI is required for filesystem behavior. No local full suite is requested. All real-data operations are excluded; migration runs only in disposable fixtures. See the plan and research for byte preservation, refusal and offline rollout conditions.

The runtime_readback oracle is owner-7: it invokes the real candidate CLI in a disposable Git repository, reads back migrated record bytes and receipts, kills an actual child at retirement, resumes from retained state and verifies rollback refusal after a new write. Owner-5 additionally exercises production HTTP GETs under ready, legacy and migration layouts. These are local candidate runtime observations, not global installation, real-data migration or Host admission evidence.

## Rollback Point

- Base12518117e610007b34b9d10c94b5d92404a09ae3. Revert code before real migration; data rollback requires unchanged migrated output and explicit offline invocation.
