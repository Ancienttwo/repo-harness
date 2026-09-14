> **Archived**: 2026-09-14 10:34
> **Related Plan**: plans/archive/plan-20260913-1522-architecture-budget-recovery.md
> **Outcome**: Completed
> **Lifecycle**: contract
> **Parent Run ID**: run-20260914-1034
> **Archive Projection V1**: `plans/plan-20260913-1522-architecture-budget-recovery.md` => `plans/archive/plan-20260913-1522-architecture-budget-recovery.md`
> **Archive Projection V1**: `tasks/notes/20260913-1522-architecture-budget-recovery.notes.md` => `tasks/archive/notes-20260914-1034-architecture-budget-recovery.md`
> **Archive Projection V1**: `tasks/contracts/20260913-1522-architecture-budget-recovery.contract.md` => `tasks/archive/contract-20260914-1034-architecture-budget-recovery.md`
> **Archive Projection V1**: `tasks/reviews/20260913-1522-architecture-budget-recovery.review.md` => `tasks/archive/review-20260914-1034-architecture-budget-recovery.md`

# Task Contract: architecture-budget-recovery

> **Status**: Fulfilled
> **Plan**: plans/archive/plan-20260913-1522-architecture-budget-recovery.md
> **Task Profile**: bugfix
> <!-- legal values: code-change | docs-only | ledger-closeout | migration | eval-only | delegated-run | bugfix (omit for legacy passthrough); see docs/reference-configs/sprint-contracts.md -->
> **Owner**: ancienttwo
> **Capability ID**: root
> **Last Updated**: 2026-09-13 15:23
> **Review File**: `tasks/archive/review-20260914-1034-architecture-budget-recovery.md`
> **Notes File**: `tasks/archive/notes-20260914-1034-architecture-budget-recovery.md`
> **Exemplar**: `docs/reference-configs/contract-brief-example.md`

## Why

The installed 150-second Stop host is underused by a 20-second shared deadline; pending projection work cannot finish and suggestion observation is starved.

## Goal

Deliver the existing bounded Stop/recommendation budget implementation and confirmed-unmapped automatic-event repair into main, preserving pending jobs, cursor acknowledgement, complete evidence and explicit user decisions. Owner scope amendment 2026-09-13: “合并现有代码，保留运行时缺口”. Live queue completion and complete recommendation proof remain deferred outcomes, not acceptance claims.

## Scope

- In scope: shared Stop timing policy, projection/recommendation deadlines, visible no-budget deferral, targeted regressions and frozen/live provider readback; user-approved pending drain ordering when new source events contain only projection-owned paths.
- Out of scope: npm release, paid model traffic, daemon/scheduler additions, changed architecture semantic authority, automatic refactoring, unrelated WIP.
- Taste constraints: <!-- advisory only, no run gate; default style/taste lives in AGENTS.md and the minimal-change policy, use this to record a per-task override -->

## Stop Conditions

- Stop and hand back to the parent if the change would require editing a path outside Allowed Paths.
- Stop if an Exit Criteria command cannot be run in this environment.
- Stop if Goal, Scope, or Exit Criteria are internally contradictory.

## Falsifier

A 23.6-second simulated projection followed by a 16-second observation still fails despite fitting the existing host timeout; verify this with deterministic clocks before fixing.

## Root Cause Evidence

- root_cause: stop-handler.ts shares a 20000ms deadline across projection and recommendations while recommendations.ts caps the serial scan and lifecycle readback at 10000ms; both are below observed complete-operation latency. Additionally, projection-orchestrator.ts returns for owned-only source events before claiming an existing pending job.
- repro: repo-harness architecture-projection check --json (23.6s/planned); repo-harness refactor recommendations --json (10.79s/unavailable); deterministic clock regressions in the existing tests. Live drain returns idle with pending=1; owned-only pending-drain regressions capture this separately.
- regression_guard: tests/stop-handler.test.ts
- pre_fix_failure_artifact: .ai/harness/runs/architecture-budget-pre-fix.log

## Workflow Inventory

- Source plan: `plans/archive/plan-20260913-1522-architecture-budget-recovery.md`
- Deferred-goal ledger: `tasks/todos.md`
- Review file: `tasks/archive/review-20260914-1034-architecture-budget-recovery.md`
- Notes file: `tasks/archive/notes-20260914-1034-architecture-budget-recovery.md`
- Checks file: `.ai/harness/checks/latest.json`
- Run snapshots: `.ai/harness/runs/`
- Scope gate: edit only paths listed under `allowed_paths`; update this contract before widening scope.
- Completion gate: run `verify-sprint --prepare-acceptance`, record one typed AcceptanceReceipt under the frozen policy below, then run `verify-sprint`; review Markdown is projection only.

## Change Assessment

```json
{"protocol": 1, "oracles": [{"id": "budget-regressions", "kind": "deterministic_test", "paths": ["*"]}, {"id": "provider-canary", "kind": "runtime_readback", "paths": ["*"]}]}
```

## Acceptance Policy

```json
{"protocol":2,"reviewer":"Codex","source":"codex-plugin","user_waiver":"allowed"}
```

## Allowed Paths

```yaml
allowed_paths:
  - src/cli/commands/capability-context.ts
  - tests/cli/capability-context.test.ts
  - tests/architecture-drift.test.ts
  - tests/architecture-drift-recovery.test.ts
  - src/core/hook-work-budget.ts
  - src/cli/installer/managed-entries.ts
  - src/cli/hook/stop-handler.ts
  - src/cli/hook/mutation-observed.ts
  - src/effects/refactor/recommendations.ts
  - src/effects/architecture/projection-orchestrator.ts
  - src/cli/commands/capability-context.ts
  - tests/architecture-drift.test.ts
  - tests/cli/capability-context.test.ts
  - tests/stop-handler.test.ts
  - tests/unit/refactor-recommendations.test.ts
  - tests/architecture-projection-orchestration.test.ts
  - docs/spec.md
  - docs/researches/20260913-architecture-budget-recovery.md
  - docs/architecture/
  - tasks/lessons.md
  - tasks/todos.md
  - plans/
  - tasks/contracts/
  - tasks/notes/
  - tasks/reviews/
  - tasks/archive/
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
    - docs/researches/20260913-architecture-budget-recovery.md
  artifacts_exist:
    - .ai/harness/runs/architecture-budget-pre-fix.log
    - .ai/harness/runs/pending-drain-pre-fix.log
    - .ai/harness/runs/journal-budget-pre-fix.log
```

## Verification Plan

```json
{
  "protocol": 1,
  "checks": [
    {
      "id": "unmapped-cascade",
      "kind": "command",
      "command": "account=$(mktemp -d); trap 'rm -rf \"$account\"' EXIT; HOME=\"$account\" bun test tests/cli/capability-context.test.ts tests/architecture-drift.test.ts tests/architecture-drift-recovery.test.ts",
      "cwd": ".",
      "phase": "verification",
      "cost": "normal",
      "evidence_policy": "current_exact",
      "necessity": "Verify the confirmed-unmapped skip and real CLI mapped-tail/cursor boundary on the integrated candidate.",
      "inputs": {
        "env": []
      }
    },
    {
      "id": "stop-budget",
      "kind": "package_test",
      "path": "tests/stop-handler.test.ts",
      "cwd": ".",
      "phase": "verification",
      "cost": "normal",
      "evidence_policy": "current_exact",
      "necessity": "Prove shared budget composition, bounded observation and unchanged Stop semantics.",
      "inputs": {
        "env": []
      }
    },
    {
      "id": "recommendation-budget",
      "kind": "package_test",
      "path": "tests/unit/refactor-recommendations.test.ts",
      "cwd": ".",
      "phase": "verification",
      "cost": "normal",
      "evidence_policy": "current_exact",
      "necessity": "Prove shared budget composition, bounded observation and unchanged Stop semantics.",
      "inputs": {
        "env": []
      }
    },
    {
      "id": "projection-regressions",
      "kind": "command",
      "command": "account=$(mktemp -d); trap 'rm -rf \"$account\"' EXIT; HOME=\"$account\" bun test tests/architecture-projection-provider.test.ts tests/architecture-projection-orchestration.test.ts tests/unit/global-architecture-projection.test.ts --timeout 60000",
      "cwd": ".",
      "phase": "verification",
      "cost": "normal",
      "evidence_policy": "current_exact",
      "necessity": "Required repository integrity or changed provider/runtime boundary.",
      "inputs": {
        "env": []
      }
    },
    {
      "id": "typecheck",
      "kind": "command",
      "command": "bun run check:type",
      "cwd": ".",
      "phase": "verification",
      "cost": "normal",
      "evidence_policy": "current_exact",
      "necessity": "Required repository integrity or changed provider/runtime boundary.",
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
      "necessity": "Required repository integrity or changed provider/runtime boundary.",
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
      "necessity": "Required repository integrity or changed provider/runtime boundary.",
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
      "necessity": "Required repository integrity or changed provider/runtime boundary.",
      "inputs": {
        "env": []
      }
    },
    {
      "id": "sql",
      "kind": "command",
      "command": "bash scripts/check-deploy-sql-order.sh",
      "cwd": ".",
      "phase": "verification",
      "cost": "normal",
      "evidence_policy": "current_exact",
      "necessity": "Required repository integrity or changed provider/runtime boundary.",
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
      "necessity": "Required repository integrity or changed provider/runtime boundary.",
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
      "necessity": "Required repository integrity or changed provider/runtime boundary.",
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
      "necessity": "Required repository integrity or changed provider/runtime boundary.",
      "inputs": {
        "env": []
      }
    },
    {
      "id": "inspect",
      "kind": "command",
      "command": "bun scripts/inspect-project-state.ts --repo . --format text",
      "cwd": ".",
      "phase": "verification",
      "cost": "normal",
      "evidence_policy": "current_exact",
      "necessity": "Required repository integrity or changed provider/runtime boundary.",
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
      "necessity": "Required repository integrity or changed provider/runtime boundary.",
      "inputs": {
        "env": []
      }
    },
    {
      "id": "hook-bundle",
      "kind": "command",
      "command": "bun run build:hook-bundle",
      "cwd": ".",
      "phase": "verification",
      "cost": "normal",
      "evidence_policy": "current_exact",
      "necessity": "Required repository integrity or changed provider/runtime boundary.",
      "inputs": {
        "env": []
      }
    },
    {
      "id": "journal-retention",
      "kind": "package_test",
      "path": "tests/mutation-observed.test.ts",
      "cwd": ".",
      "phase": "verification",
      "cost": "normal",
      "evidence_policy": "current_exact",
      "necessity": "Validate durable journal event lifecycle after retaining unattempted work when the Stop budget is exhausted.",
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

- Changed behavior/boundary, existing covering tests and remaining gap: the user approved local merge acceptance and installation of the documented repair; proof_required remains a correct observable result for incomplete facts, not a claimed recommendation.
- New test case/file rationale, or why existing coverage is sufficient:
- Selected check IDs and why their coverage is sufficient; omitted coverage:
- Full/expensive check justification and expected cost, if applicable:
- Execution/baseline references, subject, current delta and disposition:
- Residual risks and incomplete observations:

## Rollback Point

- Commit / checkpoint: f1596f094423018e35ceb6f46f74a8d07b7b182c
- Revert strategy: revert this isolated patch; never rewind acknowledged cursor/receipts or overwrite unrelated worktrees.
