> **Archived**: 2026-09-23 21:14
> **Related Plan**: plans/archive/plan-20260923-1153-task-inbox-migration-reflush.md
> **Outcome**: Completed
> **Lifecycle**: contract
> **Parent Run ID**: run-20260923-2114
> **Archive Projection V1**: `plans/plan-20260923-1153-task-inbox-migration-reflush.md` => `plans/archive/plan-20260923-1153-task-inbox-migration-reflush.md`
> **Archive Projection V1**: `tasks/notes/20260923-1153-task-inbox-migration-reflush.notes.md` => `tasks/archive/notes-20260923-2114-task-inbox-migration-reflush.md`
> **Archive Projection V1**: `tasks/contracts/20260923-1153-task-inbox-migration-reflush.contract.md` => `tasks/archive/contract-20260923-2114-task-inbox-migration-reflush.md`
> **Archive Projection V1**: `tasks/reviews/20260923-1153-task-inbox-migration-reflush.review.md` => `tasks/archive/review-20260923-2114-task-inbox-migration-reflush.md`

# Task Contract: task-inbox-migration-reflush

> **Status**: Fulfilled
> **Plan**: plans/archive/plan-20260923-1153-task-inbox-migration-reflush.md
> **Task Profile**: bugfix
> <!-- legal values: code-change | docs-only | ledger-closeout | migration | eval-only | delegated-run | bugfix (omit for legacy passthrough); see docs/reference-configs/sprint-contracts.md -->
> **Owner**: ancienttwo
> **Capability ID**: root
> **Last Updated**: 2026-09-23 11:53
> **Review File**: `tasks/archive/review-20260923-2114-task-inbox-migration-reflush.md`
> **Notes File**: `tasks/archive/notes-20260923-2114-task-inbox-migration-reflush.md`
> **Exemplar**: `docs/reference-configs/contract-brief-example.md`

## Why

The Task Evidence independent review found that explicit Task Inbox migration can publish a committed receipt after a prior complete file write failed its file fsync. That falsely certifies migration durability.

## Goal

Every transaction-owned file reused after interruption must be flushed successfully before migration receipt publication; repeated flush failure must keep recovery incomplete and resumable.

## Scope

- In scope: exact owned staged files and pending/final metadata recovery, single-link/no-symlink identity guards, regression in the existing migration suite.
- Out of scope: ordinary Task Inbox writer behavior, other Windows directory flush sites, real-data migration, Host admission, main merge.

## Stop Conditions

- Stop and hand back to the parent if the change would require editing a path outside Allowed Paths.
- Stop if an Exit Criteria command cannot be run in this environment.
- Stop if Goal, Scope, or Exit Criteria are internally contradictory.

## Falsifier

If resume invokes a successful file fsync on the previously failed inode before publishing, the reported gap is false. The pre-fix fault injection is the cheapest proof.

## Root Cause Evidence

- root_cause: `src/effects/fleet/task-inbox-layout-migration.ts:215` returns on equal existing bytes without retrying a failed file fsync; `publishMetadata` can then publish the receipt.
- repro: `bun test tests/effects/task-inbox-layout-migration.test.ts --timeout 60000` with the complete-write/failed-fsync recovery case on unfixed source.
- regression_guard: tests/effects/task-inbox-layout-migration.test.ts
- pre_fix_failure_artifact: .ai/harness/runs/task-inbox-migration-reflush/pre-fix-failure.log

## Workflow Inventory

- Source plan: `plans/archive/plan-20260923-1153-task-inbox-migration-reflush.md`
- Deferred-goal ledger: `tasks/todos.md`
- Review file: `tasks/archive/review-20260923-2114-task-inbox-migration-reflush.md`
- Notes file: `tasks/archive/notes-20260923-2114-task-inbox-migration-reflush.md`
- Checks file: `.ai/harness/checks/latest.json`
- Run snapshots: `.ai/harness/runs/`
- Scope gate: edit only paths listed under `allowed_paths`; update this contract before widening scope.
- Completion gate: run `verify-sprint --prepare-acceptance`, record one typed AcceptanceReceipt under the frozen policy below, then run `verify-sprint`; review Markdown is projection only.

## Change Assessment

```json
{"protocol":1,"oracles":[{"id":"migration","kind":"deterministic_test","paths":["*"]},{"id":"migration-cli-readback","kind":"runtime_readback","paths":["*"]}]}
```

## Acceptance Policy

```json
{"protocol":2,"reviewer":"Codex","source":"codex-plugin","user_waiver":"allowed"}
```

## Allowed Paths

```yaml
allowed_paths:
  - src/effects/fleet/task-inbox-layout-migration.ts
  - tests/effects/task-inbox-layout-migration.test.ts
  - docs/architecture/.projection-manifest.json
  - docs/researches/20260923-windows-task-persistence.md
  - plans/archive/plan-20260923-1153-task-inbox-migration-reflush.md
  - tasks/archive/contract-20260923-2114-task-inbox-migration-reflush.md
  - tasks/archive/review-20260923-2114-task-inbox-migration-reflush.md
  - tasks/archive/notes-20260923-2114-task-inbox-migration-reflush.md
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
    - src/effects/fleet/task-inbox-layout-migration.ts
    - tests/effects/task-inbox-layout-migration.test.ts
  artifacts_exist: []
```

## Verification Plan

```json
{
  "protocol": 1,
  "checks": [
    {
      "id": "migration",
      "kind": "package_test",
      "path": "tests/effects/task-inbox-layout-migration.test.ts",
      "cwd": ".",
      "phase": "verification",
      "cost": "normal",
      "evidence_policy": "current_exact",
      "necessity": "Durable migration recovery and neighboring Task Inbox authority must remain correct",
      "inputs": {
        "env": []
      }
    },
    {
      "id": "task-inbox",
      "kind": "package_test",
      "path": "tests/effects/task-inbox.test.ts",
      "cwd": ".",
      "phase": "verification",
      "cost": "normal",
      "evidence_policy": "current_exact",
      "necessity": "Durable migration recovery and neighboring Task Inbox authority must remain correct",
      "inputs": {
        "env": []
      }
    },
    {
      "id": "task-reply",
      "kind": "package_test",
      "path": "tests/effects/task-reply.test.ts",
      "cwd": ".",
      "phase": "verification",
      "cost": "normal",
      "evidence_policy": "current_exact",
      "necessity": "Durable migration recovery and neighboring Task Inbox authority must remain correct",
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
      "necessity": "Required repository integrity and source type safety for this migration bugfix",
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
      "necessity": "Required repository integrity and source type safety for this migration bugfix",
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
      "necessity": "Required repository integrity and source type safety for this migration bugfix",
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
      "necessity": "Required repository integrity and source type safety for this migration bugfix",
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
      "necessity": "Required repository integrity and source type safety for this migration bugfix",
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
      "necessity": "Required repository integrity and source type safety for this migration bugfix",
      "inputs": {
        "env": []
      }
    },
    {
      "id": "task-sync",
      "kind": "command",
      "command": "REPO_HARNESS_DIFF_BASE=4271eba604fc759c114cb3ee122d8856acc09504 REPO_HARNESS_DIFF_MODE=merge-base bash scripts/check-task-sync.sh",
      "cwd": ".",
      "phase": "verification",
      "cost": "normal",
      "evidence_policy": "current_exact",
      "necessity": "Required repository integrity and source type safety for this migration bugfix",
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
      "necessity": "Required repository integrity and source type safety for this migration bugfix",
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
      "necessity": "Required repository integrity and source type safety for this migration bugfix",
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
      "necessity": "Required repository integrity and source type safety for this migration bugfix",
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

- The migration suite's real CLI dry-run and resume cases are the runtime readback oracle for this explicit one-shot migration. The existing migration suite owns the regression: its complete staged-file test failed on unfixed source with `PRE_FIX_EXIT=1`. The suite now has 53 cases. Fault-injected cases rewrite a complete staged file, retirement marker and prepared receipt on fresh inodes, retract a published tree that has no receipt, replace an existing published journal through a fresh pending inode, and refuse hard-link or replaced-inode ownership changes. In every fault case, no receipt is published until the rewrite's own flush succeeds, and a later resume reaches committed. No new test file is needed.
- The repair never trusts a re-fsync of a recovered inode. A complete or interrupted transaction-owned file (staged file, `.pending` metadata, retirement marker) must be this transaction's single-link, non-symlink inode, with the same identity across lstat/open/re-lstat, holding the exact bytes or a prefix. It is then unlinked and recreated through `createFileExclusiveDurably` plus a directory sync. Published metadata is verified and then replaced by renaming a fresh `.pending` inode over it. A published tree without a receipt is renamed back to the stage path and restaged onto fresh inodes before any receipt is published; the journal keeps the runtime closed throughout.
- Selected checks: migration, Task Inbox and protected reply effects, typecheck, and the repository's nine integrity commands. They cover the changed recovery boundary and its neighboring live authority; full suite is reserved for hosted CI.
- The pre-fix failure is `.ai/harness/runs/task-inbox-migration-reflush/pre-fix-failure.log`. No migration of real data or broader Windows filesystem guarantee is claimed.

## Rollback Point

- Base: `164f3f52ab26f3ca576c7c3a3349253599db5ece` (accepted AKN-05a source); PR base after merging `origin/main`: `4271eba604fc759c114cb3ee122d8856acc09504`.
- Revert only the recovery flush repair; the one-shot migration data contract remains unchanged.
