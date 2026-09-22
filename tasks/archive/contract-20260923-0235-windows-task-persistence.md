> **Archived**: 2026-09-23 02:35
> **Related Plan**: plans/archive/plan-20260923-0031-windows-task-persistence.md
> **Outcome**: Completed
> **Lifecycle**: contract
> **Parent Run ID**: run-20260923-0235
> **Archive Projection V1**: `plans/plan-20260923-0031-windows-task-persistence.md` => `plans/archive/plan-20260923-0031-windows-task-persistence.md`
> **Archive Projection V1**: `tasks/notes/20260923-0031-windows-task-persistence.notes.md` => `tasks/archive/notes-20260923-0235-windows-task-persistence.md`
> **Archive Projection V1**: `tasks/contracts/20260923-0031-windows-task-persistence.contract.md` => `tasks/archive/contract-20260923-0235-windows-task-persistence.md`
> **Archive Projection V1**: `tasks/reviews/20260923-0031-windows-task-persistence.review.md` => `tasks/archive/review-20260923-0235-windows-task-persistence.md`

# Task Contract: windows-task-persistence

> **Status**: Fulfilled
> **Plan**: plans/archive/plan-20260923-0031-windows-task-persistence.md
> **Task Profile**: bugfix
> <!-- legal values: code-change | docs-only | ledger-closeout | migration | eval-only | delegated-run | bugfix (omit for legacy passthrough); see docs/reference-configs/sprint-contracts.md -->
> **Owner**: ancienttwo
> **Capability ID**: root
> **Last Updated**: 2026-09-23 00:31
> **Review File**: `tasks/archive/review-20260923-0235-windows-task-persistence.md`
> **Notes File**: `tasks/archive/notes-20260923-0235-windows-task-persistence.md`
> **Exemplar**: `docs/reference-configs/contract-brief-example.md`

## Why

Real protected Task replies cannot initialize Binding/Lease authority on Windows, blocking PR443 and the reader integration roadmap.

## Goal

Make the existing Binding, Principal, Lease and ClaimActor persistence chain usable on Windows without weakening canonical records, locks, file flushes, publication or authentication checks.

## Scope

- In scope: four actual authority stores, their shared directory flush boundary, writable Principal descriptor lifetime, owning regression coverage and native verification.
- Out of scope: other store refactors, architecture-queue, main merge, global installation, real data migration, Host admission, Campaign activation, canary and homepage features.

## Stop Conditions

- Stop and hand back to the parent if the change would require editing a path outside Allowed Paths.
- Stop if an Exit Criteria command cannot be run in this environment.
- Stop if Goal, Scope, or Exit Criteria are internally contradictory.

## Falsifier

A file flush failure publishes new authority, a POSIX directory flush failure is swallowed, canonical bytes or ownership checks change, or native delivery/ACK/reply remains unable to run.

## Root Cause Evidence

- root_cause: Binding/Lease directory fsync uses read-only directory handles rejected with EPERM by Windows; the same chain also contains Principal/ClaimActor directory calls and Principal read-only file flushing.
- repro: Windows job106819723526 in CI35749499343; deterministic Windows syscall restriction in the owning Principal test.
- regression_guard: tests/unit/me0b-principal-store.test.ts
- pre_fix_failure_artifact: .ai/harness/runs/windows-task-persistence/before.log

## Workflow Inventory

- Source plan: `plans/archive/plan-20260923-0031-windows-task-persistence.md`
- Deferred-goal ledger: `tasks/todos.md`
- Review file: `tasks/archive/review-20260923-0235-windows-task-persistence.md`
- Notes file: `tasks/archive/notes-20260923-0235-windows-task-persistence.md`
- Checks file: `.ai/harness/checks/latest.json`
- Run snapshots: `.ai/harness/runs/`
- Scope gate: edit only paths listed under `allowed_paths`; update this contract before widening scope.
- Completion gate: run `verify-sprint --prepare-acceptance`, record one typed AcceptanceReceipt under the frozen policy below, then run `verify-sprint`; review Markdown is projection only.

## Change Assessment

```json
{"protocol":1,"oracles":[{"id":"principal","kind":"deterministic_test","paths":["*"]},{"id":"reply","kind":"runtime_readback","paths":["*"]}]}
```

## Acceptance Policy

```json
{"protocol":2,"reviewer":"Codex","source":"codex-plugin","user_waiver":"allowed"}
```

## Allowed Paths

```yaml
allowed_paths:
  - src/effects/evidence/atomic-append.ts
  - src/effects/engineers/binding-store.ts
  - src/effects/engineers/principal-store.ts
  - src/effects/engineers/claim-actor-store.ts
  - src/effects/state/coordination-lease-store.ts
  - tests/unit/me0b-principal-store.test.ts
  - tests/coordination-lease-store.test.ts
  - tests/effects/task-reply.test.ts
  - docs/researches/20260923-windows-task-persistence.md
  - docs/architecture/.projection-manifest.json
  - plans/archive/plan-20260923-0031-windows-task-persistence.md
  - tasks/archive/contract-20260923-0235-windows-task-persistence.md
  - tasks/archive/review-20260923-0235-windows-task-persistence.md
  - tasks/archive/notes-20260923-0235-windows-task-persistence.md
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
    - docs/researches/20260923-windows-task-persistence.md
  artifacts_exist:
    - .ai/harness/runs/windows-task-persistence/before.log
```

## Verification Plan

```json
{
  "protocol": 1,
  "checks": [
    {
      "id": "binding",
      "kind": "package_test",
      "path": "tests/unit/engineer-binding-store.test.ts",
      "cwd": ".",
      "phase": "verification",
      "cost": "normal",
      "evidence_policy": "current_exact",
      "necessity": "Owning persistence, failure boundary, or real protected Task lifecycle",
      "inputs": {
        "env": []
      }
    },
    {
      "id": "principal",
      "kind": "package_test",
      "path": "tests/unit/me0b-principal-store.test.ts",
      "cwd": ".",
      "phase": "verification",
      "cost": "normal",
      "evidence_policy": "current_exact",
      "necessity": "Owning persistence, failure boundary, or real protected Task lifecycle",
      "inputs": {
        "env": []
      }
    },
    {
      "id": "lease",
      "kind": "package_test",
      "path": "tests/coordination-lease-store.test.ts",
      "cwd": ".",
      "phase": "verification",
      "cost": "normal",
      "evidence_policy": "current_exact",
      "necessity": "Owning persistence, failure boundary, or real protected Task lifecycle",
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
      "necessity": "Owning persistence, failure boundary, or real protected Task lifecycle",
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
      "necessity": "Owning persistence, failure boundary, or real protected Task lifecycle",
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
      "necessity": "Owning persistence, failure boundary, or real protected Task lifecycle",
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
      "command": "REPO_HARNESS_DIFF_BASE=271f4d31 REPO_HARNESS_DIFF_MODE=merge-base bash scripts/check-task-sync.sh",
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

## Acceptance Notes (Human Review)

- Changed boundary: directory flush selection for four actual authority stores and Principal writable descriptor lifetime. Existing exact validators, locks and record formats retain authority.
- Regression admission: extend existing Principal and Lease suites for the observed read-only descriptor failure, file-flush refusal before replacement, and POSIX directory error propagation. No new test file.
- Verification Plan selects six owning suites plus typecheck and every repository-integrity command; native Windows/macOS/Linux and full Test are existing CI requirements. No full local suite is added.
- Source baseline:271f4d31; local pre-fix and focused artifacts live under .ai/harness/runs/windows-task-persistence. Native Windows before evidence is CI35749499343. Current candidate CI and canonical proof remain pending.
- Residual limit: Windows directory power-loss durability is not claimed equivalent to POSIX. Real data migration and production admission remain excluded.

## Rollback Point

- Baseline:271f4d31696d70a2011a542ffa74e7f5171a5e87.
- Revert this package's code; no persisted format, command, configuration or identity migration exists.
