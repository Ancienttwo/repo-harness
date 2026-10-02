# Task Contract: brc10-planning-lock-timeout

> **Status**: Active
> **Plan**: plans/plan-20261002-1758-brc10-planning-lock-timeout.md
> **Task Profile**: bugfix
> <!-- legal values: code-change | docs-only | ledger-closeout | migration | eval-only | delegated-run | bugfix (omit for legacy passthrough); see docs/reference-configs/sprint-contracts.md -->
> **Owner**: chris
> **Capability ID**: root
> **Last Updated**: 2026-10-02 17:58
> **Review File**: `tasks/reviews/20261002-1758-brc10-planning-lock-timeout.review.md`
> **Notes File**: `tasks/notes/20261002-1758-brc10-planning-lock-timeout.notes.md`
> **Exemplar**: `docs/reference-configs/contract-brief-example.md`

## Why

Concurrent recovery of one persisted final must converge on one next-generation owner. Existing two-OS-caller regression times out at the group planning lock; the fix must preserve owner/evidence/crash ordering rather than extend budgets.

## Goal

Prove and repair the root cause of brc10 planning.lock timeout; unchanged assertions/timeouts pass at normal and low parallelism, full local inventory and typecheck pass, record evidence in notes and commit locally only.

## Scope

- In scope: root-cause instrumentation/proof, smallest lower lock/recovery correction, unchanged existing regression coverage and local evidence.
- Out of scope: test assertion/timeout changes, new CLI adapters, S4/primary changes, push/PR/merge/deletion, unrelated refactors.
- Taste constraints: reuse existing transaction/lock/journal owners, preserve exact generation and crash replay; remove diagnostics.

## Stop Conditions

- Stop and hand back to the parent if the change would require editing a path outside Allowed Paths.
- Stop if an Exit Criteria command cannot be run in this environment.
- Stop if Goal, Scope, or Exit Criteria are internally contradictory.

## Falsifier

A measured critical-section/ownership trace inconsistent with the hypothesis rejects it. Same pre-fix guard still failing after repair rejects the fix; do not tune timeouts or assertions.

## Root Cause Evidence

- root_cause: recoverCampaignDispatch keeps planning.lock through slow final authority validation/settlement after recovered publication; measured 6092ms hold exceeds unchanged 5000ms waiter budget, including 1514ms settlement.
- repro: PATH=/opt/homebrew/opt/node@24/bin:$PATH bun test --timeout 180000 --max-concurrency 1 tests/effects/brc10-lifecycle.test.ts --test-name-pattern 'two OS callers settle the historical final under one recovered generation'
- regression_guard: tests/effects/brc10-lifecycle.test.ts
- pre_fix_failure_artifact: /tmp/brc10-lock-pre-fix.log

## Workflow Inventory

- Source plan: `plans/plan-20261002-1758-brc10-planning-lock-timeout.md`
- Deferred-goal ledger: `tasks/todos.md`
- Review file: `tasks/reviews/20261002-1758-brc10-planning-lock-timeout.review.md`
- Notes file: `tasks/notes/20261002-1758-brc10-planning-lock-timeout.notes.md`
- Checks file: `.ai/harness/checks/latest.json`
- Run snapshots: `.ai/harness/runs/`
- Scope gate: edit only paths listed under `allowed_paths`; update this contract before widening scope.
- Completion gate: run `verify-sprint --prepare-acceptance`, record one typed AcceptanceReceipt under the frozen policy below, then run `verify-sprint`; review Markdown is projection only.

## Change Assessment

```json
{"protocol":1,"oracles":[{"id":"unchanged-brc10-regression","kind":"deterministic_test","paths":["tests/effects/brc10-lifecycle.test.ts"]}]}
```

## Acceptance Policy

```json
{"protocol":2,"reviewer":"Codex","source":"codex-review","user_waiver":"allowed"}
```

## Allowed Paths

```yaml
allowed_paths:
  - src/effects/automation/campaign-recovery.ts
  - plans/plan-20261002-1758-brc10-planning-lock-timeout.md
  - tasks/contracts/20261002-1758-brc10-planning-lock-timeout.contract.md
  - tasks/reviews/20261002-1758-brc10-planning-lock-timeout.review.md
  - tasks/notes/20261002-1758-brc10-planning-lock-timeout.notes.md
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
    - src/effects/automation/campaign-recovery.ts
    - plans/plan-20261002-1758-brc10-planning-lock-timeout.md
    - tasks/contracts/20261002-1758-brc10-planning-lock-timeout.contract.md
    - tasks/reviews/20261002-1758-brc10-planning-lock-timeout.review.md
    - tasks/notes/20261002-1758-brc10-planning-lock-timeout.notes.md
```

## Verification Plan

```json
{
  "protocol": 1,
  "checks": [
    {
      "id": "brc10-normal",
      "kind": "package_test",
      "path": "tests/effects/brc10-lifecycle.test.ts",
      "necessity": "Existing unchanged regression guard; normal Bun concurrency and original package timeout",
      "cwd": ".",
      "phase": "verification",
      "cost": "normal",
      "evidence_policy": "current_exact",
      "inputs": {
        "env": [
          "PATH"
        ]
      }
    },
    {
      "id": "brc10-low",
      "kind": "command",
      "command": "bun test --timeout 60000 --max-concurrency 1 tests/effects/brc10-lifecycle.test.ts",
      "necessity": "Owner-required low-parallelism regression; no changed case timeout",
      "cwd": ".",
      "phase": "verification",
      "cost": "normal",
      "evidence_policy": "current_exact",
      "inputs": {
        "env": [
          "PATH"
        ]
      }
    },
    {
      "id": "lock-contention-guards",
      "kind": "package_test",
      "path": "tests/unit/issue-282-automation-budget-contention.test.ts",
      "necessity": "Existing lock contention and fencing safety guards",
      "cwd": ".",
      "phase": "verification",
      "cost": "normal",
      "evidence_policy": "current_exact",
      "inputs": {
        "env": [
          "PATH"
        ]
      }
    },
    {
      "id": "full-local-suite",
      "kind": "command",
      "command": "BUN_TEST_ISOLATE_FILES=1 BUN_TEST_JOBS=4 BUN_TEST_MAX_CONCURRENCY=1 bash -c 'source scripts/lib/ci-run-tests.sh; run_bun_tests'",
      "necessity": "Owner explicitly requires full inventory for lower locking/recovery bug; original CI timeout defaults unchanged",
      "cwd": ".",
      "phase": "verification",
      "cost": "expensive",
      "evidence_policy": "current_exact",
      "inputs": {
        "env": [
          "PATH"
        ]
      }
    },
    {
      "id": "type",
      "kind": "command",
      "command": "bun run check:type",
      "necessity": "Owner-required typecheck",
      "cwd": ".",
      "phase": "verification",
      "cost": "normal",
      "evidence_policy": "current_exact",
      "inputs": {
        "env": [
          "PATH"
        ]
      }
    },
    {
      "id": "hooks",
      "kind": "command",
      "command": "bun run check:hooks",
      "necessity": "Required repository-integrity gate",
      "cwd": ".",
      "phase": "verification",
      "cost": "normal",
      "evidence_policy": "current_exact",
      "inputs": {
        "env": [
          "PATH"
        ]
      }
    },
    {
      "id": "helpers",
      "kind": "command",
      "command": "bun run check:helpers",
      "necessity": "Required repository-integrity gate",
      "cwd": ".",
      "phase": "verification",
      "cost": "normal",
      "evidence_policy": "current_exact",
      "inputs": {
        "env": [
          "PATH"
        ]
      }
    },
    {
      "id": "reference-configs",
      "kind": "command",
      "command": "bun run check:reference-configs",
      "necessity": "Required repository-integrity gate",
      "cwd": ".",
      "phase": "verification",
      "cost": "normal",
      "evidence_policy": "current_exact",
      "inputs": {
        "env": [
          "PATH"
        ]
      }
    },
    {
      "id": "deploy-sql",
      "kind": "command",
      "command": "bash scripts/check-deploy-sql-order.sh",
      "necessity": "Required repository-integrity gate",
      "cwd": ".",
      "phase": "verification",
      "cost": "normal",
      "evidence_policy": "current_exact",
      "inputs": {
        "env": [
          "PATH"
        ]
      }
    },
    {
      "id": "architecture",
      "kind": "command",
      "command": "bash scripts/check-architecture-sync.sh",
      "necessity": "Required repository-integrity gate",
      "cwd": ".",
      "phase": "verification",
      "cost": "normal",
      "evidence_policy": "current_exact",
      "inputs": {
        "env": [
          "PATH"
        ]
      }
    },
    {
      "id": "task-sync",
      "kind": "command",
      "command": "bash scripts/check-task-sync.sh",
      "necessity": "Required repository-integrity gate",
      "cwd": ".",
      "phase": "verification",
      "cost": "normal",
      "evidence_policy": "current_exact",
      "inputs": {
        "env": [
          "PATH"
        ]
      }
    },
    {
      "id": "task-workflow",
      "kind": "command",
      "command": "bash scripts/check-task-workflow.sh --strict",
      "necessity": "Required repository-integrity gate",
      "cwd": ".",
      "phase": "verification",
      "cost": "normal",
      "evidence_policy": "current_exact",
      "inputs": {
        "env": [
          "PATH"
        ]
      }
    },
    {
      "id": "state",
      "kind": "command",
      "command": "bun scripts/inspect-project-state.ts --repo . --format text",
      "necessity": "Required repository-integrity gate",
      "cwd": ".",
      "phase": "verification",
      "cost": "normal",
      "evidence_policy": "current_exact",
      "inputs": {
        "env": [
          "PATH"
        ]
      }
    },
    {
      "id": "adoption-dry-run",
      "kind": "command",
      "command": "bun src/cli/index.ts init --repo . --dry-run",
      "necessity": "Required repository-integrity gate",
      "cwd": ".",
      "phase": "verification",
      "cost": "normal",
      "evidence_policy": "current_exact",
      "inputs": {
        "env": [
          "PATH"
        ]
      }
    }
  ]
}
```

## Acceptance Notes (Human Review)

- Changed behavior/boundary, existing covering tests and remaining gap:
- New test case/file rationale, or why existing coverage is sufficient:
- Selected check IDs and why their coverage is sufficient; omitted coverage:
- Full/expensive check justification and expected cost, if applicable:
- Execution/baseline references, subject, current delta and disposition:
- Residual risks and incomplete observations:

## Rollback Point

- Commit / checkpoint:
- Revert strategy:

## Owner delivery boundary

Aimpact authorized diagnosis/fix and local commit only. No remote action or deletion. Existing brc10 assertions and case timeouts remain byte-identical; final suite uses existing package/CI timeout defaults. No fabricated AcceptanceReceipt or reviewer verdict.

## Proven repair boundary

Runtime trace proves 6092ms recovery journal-lock hold, with 1514ms final settlement after recovered publication. Only campaign-recovery.ts changes: publish recovered under unchanged group/Task/Binding locks, release group lock, then run existing live-authority/actor validation and independently locked idempotent budget/attempt settlement. Temporary diagnostics were restored byte-identically. Existing brc10 test and all timeout values are unchanged.
