> **Archived**: 2026-09-13 19:01
> **Related Plan**: plans/archive/plan-20260913-1843-architecture-agent-guidance.md
> **Outcome**: Completed
> **Lifecycle**: contract
> **Parent Run ID**: run-20260913-1901
> **Archive Projection V1**: `plans/plan-20260913-1843-architecture-agent-guidance.md` => `plans/archive/plan-20260913-1843-architecture-agent-guidance.md`
> **Archive Projection V1**: `tasks/notes/20260913-1843-architecture-agent-guidance.notes.md` => `tasks/archive/notes-20260913-1901-architecture-agent-guidance.md`
> **Archive Projection V1**: `tasks/contracts/20260913-1843-architecture-agent-guidance.contract.md` => `tasks/archive/contract-20260913-1901-architecture-agent-guidance.md`
> **Archive Projection V1**: `tasks/reviews/20260913-1843-architecture-agent-guidance.review.md` => `tasks/archive/review-20260913-1901-architecture-agent-guidance.md`

# Task Contract: architecture-agent-guidance

> **Status**: Fulfilled
> **Plan**: plans/archive/plan-20260913-1843-architecture-agent-guidance.md
> **Task Profile**: bugfix
> <!-- legal values: code-change | docs-only | ledger-closeout | migration | eval-only | delegated-run | bugfix (omit for legacy passthrough); see docs/reference-configs/sprint-contracts.md -->
> **Owner**: kito
> **Capability ID**: root
> **Last Updated**: 2026-09-13 18:43
> **Review File**: `tasks/archive/review-20260913-1901-architecture-agent-guidance.md`
> **Notes File**: `tasks/archive/notes-20260913-1901-architecture-agent-guidance.md`
> **Exemplar**: `docs/reference-configs/contract-brief-example.md`

## Why

Unregistered architecture cannot produce capability-matched drift, so existing SessionStart advice leaves the Agent unaware of registration gaps.

## Goal

Surface read-only architecture coverage evidence through existing globally enabled SessionStart advice and give the Agent an actionable ChangeSet workflow.

## Scope

- In scope: existing session context, diagnostics, tests, architecture skill and mirrored reference docs; user-approved task-sync recovery diagnostic fix.
- Out of scope: automatic semantic synthesis, package updates, release, unrelated queues and target project models.
- Taste constraints: no new dependencies, files, abstraction, config flag or state machine; reuse canonical registry and matching.

## Stop Conditions

- Stop and hand back to the parent if the change would require editing a path outside Allowed Paths.
- Stop if an Exit Criteria command cannot be run in this environment.
- Stop if Goal, Scope, or Exit Criteria are internally contradictory.

## Falsifier

If advice writes a model, treats package names as semantic boundaries, ignores global disable, or cannot expose an empty or umbrella-only model, the implementation is invalid.

## Root Cause Evidence

- root_cause: scripts/check-task-sync.sh exits on blocked profile resolution without emitting the computed substantive digest needed by its existing earlier exact-evidence recovery path.
- repro: change fixture source and make the state resolver exit 1; task-sync fails without a usable evidence binding.
- regression_guard: tests/check-task-sync.test.ts
- pre_fix_failure_artifact: .ai/harness/failures/task-sync-recovery-pre-fix.log

## Workflow Inventory

- Source plan: `plans/archive/plan-20260913-1843-architecture-agent-guidance.md`
- Deferred-goal ledger: `tasks/todos.md`
- Review file: `tasks/archive/review-20260913-1901-architecture-agent-guidance.md`
- Notes file: `tasks/archive/notes-20260913-1901-architecture-agent-guidance.md`
- Checks file: `.ai/harness/checks/latest.json`
- Run snapshots: `.ai/harness/runs/`
- Scope gate: edit only paths listed under `allowed_paths`; update this contract before widening scope.
- Completion gate: run `verify-sprint --prepare-acceptance`, record one typed AcceptanceReceipt under the frozen policy below, then run `verify-sprint`; review Markdown is projection only.

## Change Assessment

```json
{"protocol":1,"oracles":[{"id":"session-context-and-required-integrity","kind":"deterministic_test","paths":["*"]}]}
```

## Acceptance Policy

```json
{"protocol":2,"reviewer":"Codex","source":"codex-plugin","user_waiver":"allowed"}
```

## Allowed Paths

```yaml
allowed_paths:
  - scripts/check-task-sync.sh
  - assets/templates/helpers/check-task-sync.sh
  - tests/check-task-sync.test.ts
  - .ai/harness/failures/task-sync-recovery-pre-fix.log
  - src/cli/hook/session-context.ts
  - src/cli/hook/session-context-budget.ts
  - tests/session-context.test.ts
  - assets/skill-commands/repo-harness-architecture/SKILL.md
  - assets/reference-configs/external-tooling.md
  - docs/reference-configs/external-tooling.md
  - docs/architecture/
  - plans/archive/plan-20260913-1843-architecture-agent-guidance.md
  - tasks/archive/contract-20260913-1901-architecture-agent-guidance.md
  - tasks/archive/review-20260913-1901-architecture-agent-guidance.md
  - tasks/archive/notes-20260913-1901-architecture-agent-guidance.md
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
  files_exist: []
  artifacts_exist: []
```

## Verification Plan

```json
{
  "protocol": 1,
  "checks": [
    {
      "id": "session-context",
      "kind": "package_test",
      "path": "tests/session-context.test.ts",
      "cwd": ".",
      "phase": "verification",
      "cost": "normal",
      "evidence_policy": "current_exact",
      "necessity": "Focused SessionStart behavior",
      "inputs": {
        "env": []
      }
    },
    {
      "id": "task-sync-recovery",
      "kind": "package_test",
      "path": "tests/check-task-sync.test.ts",
      "cwd": ".",
      "phase": "verification",
      "cost": "normal",
      "evidence_policy": "current_exact",
      "necessity": "Prove failure recovery preserves exact diff binding and does not admit blocked lite profiles",
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
      "necessity": "Required repository integrity",
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
      "necessity": "Required repository integrity",
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
      "necessity": "Required repository integrity",
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
      "necessity": "Required repository integrity",
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
      "necessity": "Required repository integrity",
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
      "necessity": "Required repository integrity",
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
      "necessity": "Required repository integrity",
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
      "necessity": "Required repository integrity",
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
      "necessity": "Required repository integrity",
      "inputs": {
        "env": []
      }
    }
  ]
}
```

## Acceptance Notes (Human Review)

- Existing session-context test file covers advice enablement, coverage evidence, healthy silence and no writes.
- No new dependency, test file or benchmark matrix.
- Required integrity checks plus focused coverage are sufficient for this read-only hook addition.
- Semantic boundary decisions remain with the Agent; package observations are not architectural facts.

## Rollback Point

- Commit: f1596f094423018e35ceb6f46f74a8d07b7b182c
- Revert strategy: revert this standalone guidance slice; global runtime ownership fix is separately preserved.

