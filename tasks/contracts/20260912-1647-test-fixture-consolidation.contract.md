# Task Contract: test-fixture-consolidation

> **Status**: Active
> **Plan**: plans/plan-20260912-1647-test-fixture-consolidation.md
> **Task Profile**: code-change
> <!-- legal values: code-change | docs-only | ledger-closeout | migration | eval-only | delegated-run | bugfix (omit for legacy passthrough); see docs/reference-configs/sprint-contracts.md -->
> **Owner**: ancienttwo
> **Capability ID**: root
> **Last Updated**: 2026-09-12 16:47
> **Review File**: `tasks/reviews/20260912-1647-test-fixture-consolidation.review.md`
> **Notes File**: `tasks/notes/20260912-1647-test-fixture-consolidation.notes.md`
> **Exemplar**: `docs/reference-configs/contract-brief-example.md`

## Why

The monolithic script suite limits file-level scheduling and repeated fixture definitions obscure lifecycle ownership. Assertion loss or changed runtime selection would invalidate coverage.

## Goal

Implement C1+C5 as captured in the approved plan: common repository fixture and one owner for relocated script scenarios.

## Scope

- In scope: tests fixture consolidation and script-boundary relocation; task evidence.
- Out of scope: production code, CI scheduling, seed caches and scenario deletion.
- Taste constraints: <!-- advisory only, no run gate; default style/taste lives in AGENTS.md and the minimal-change policy, use this to record a per-task override -->

## Stop Conditions

- Stop and hand back to the parent if the change would require editing a path outside Allowed Paths.
- Stop if an Exit Criteria command cannot be run in this environment.
- Stop if Goal, Scope, or Exit Criteria are internally contradictory.

## Falsifier

A changed test oracle, missing discovered scenario or altered process/runtime selection falsifies the refactor. Compare AST case inventories and run each affected file independently.

## Root Cause Evidence

Required when Task Profile is `bugfix`; leave as-is otherwise.

- root_cause: one sentence naming file:line/condition (testable, not "a state issue").
- repro: the command or UI path that reproduces the symptom.
- regression_guard: path to a test that fails on the unfixed code and passes after the fix (must also appear as a `package_test` check in Verification Plan).
- pre_fix_failure_artifact: path to a captured run of regression_guard on the UNFIXED code. Capture with `bun test <regression_guard> > <artifact> 2>&1; echo "PRE_FIX_EXIT=$?" >> <artifact>` (no pipes — pipes swallow the exit status). The gate requires a non-zero `PRE_FIX_EXIT=` line plus the regression_guard path string in the artifact (see the Root Cause Evidence Gate section in docs/reference-configs/sprint-contracts.md).

## Workflow Inventory

- Source plan: `plans/plan-20260912-1647-test-fixture-consolidation.md`
- Deferred-goal ledger: `tasks/todos.md`
- Review file: `tasks/reviews/20260912-1647-test-fixture-consolidation.review.md`
- Notes file: `tasks/notes/20260912-1647-test-fixture-consolidation.notes.md`
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
  - tests/
  - plans/plan-20260912-1647-test-fixture-consolidation.md
  - tasks/contracts/20260912-1647-test-fixture-consolidation.contract.md
  - tasks/reviews/20260912-1647-test-fixture-consolidation.review.md
  - tasks/notes/20260912-1647-test-fixture-consolidation.notes.md
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
missing or malformed plan fails closed.

```yaml
exit_criteria:
  files_exist:
    - tests/helpers/repo-fixture.ts
  artifacts_exist:
    - .ai/harness/checks/latest.json
    - tasks/notes/20260912-1647-test-fixture-consolidation.notes.md
```

## Verification Plan

```json
{
  "protocol": 1,
  "checks": [
    {
      "id": "architecture-queue",
      "kind": "package_test",
      "path": "tests/architecture-queue.test.ts",
      "cwd": ".",
      "phase": "verification",
      "cost": "normal",
      "evidence_policy": "current_exact",
      "necessity": "Runs the relocated script cases or shared repository fixture consumer in its own Bun invocation.",
      "inputs": {
        "env": []
      }
    },
    {
      "id": "archive-evidence-gates",
      "kind": "package_test",
      "path": "tests/archive-evidence-gates.test.ts",
      "cwd": ".",
      "phase": "verification",
      "cost": "normal",
      "evidence_policy": "current_exact",
      "necessity": "Runs the relocated script cases or shared repository fixture consumer in its own Bun invocation.",
      "inputs": {
        "env": []
      }
    },
    {
      "id": "capability-resolver",
      "kind": "package_test",
      "path": "tests/capability-resolver.test.ts",
      "cwd": ".",
      "phase": "verification",
      "cost": "normal",
      "evidence_policy": "current_exact",
      "necessity": "Runs the relocated script cases or shared repository fixture consumer in its own Bun invocation.",
      "inputs": {
        "env": []
      }
    },
    {
      "id": "capture-plan",
      "kind": "package_test",
      "path": "tests/capture-plan.test.ts",
      "cwd": ".",
      "phase": "verification",
      "cost": "normal",
      "evidence_policy": "current_exact",
      "necessity": "Runs the relocated script cases or shared repository fixture consumer in its own Bun invocation.",
      "inputs": {
        "env": []
      }
    },
    {
      "id": "check-context-files",
      "kind": "package_test",
      "path": "tests/check-context-files.test.ts",
      "cwd": ".",
      "phase": "verification",
      "cost": "normal",
      "evidence_policy": "current_exact",
      "necessity": "Runs the relocated script cases or shared repository fixture consumer in its own Bun invocation.",
      "inputs": {
        "env": []
      }
    },
    {
      "id": "check-deploy-sql-order",
      "kind": "package_test",
      "path": "tests/check-deploy-sql-order.test.ts",
      "cwd": ".",
      "phase": "verification",
      "cost": "normal",
      "evidence_policy": "current_exact",
      "necessity": "Runs the relocated script cases or shared repository fixture consumer in its own Bun invocation.",
      "inputs": {
        "env": []
      }
    },
    {
      "id": "check-task-sync",
      "kind": "package_test",
      "path": "tests/check-task-sync.test.ts",
      "cwd": ".",
      "phase": "verification",
      "cost": "normal",
      "evidence_policy": "current_exact",
      "necessity": "Runs the relocated script cases or shared repository fixture consumer in its own Bun invocation.",
      "inputs": {
        "env": []
      }
    },
    {
      "id": "check-task-workflow",
      "kind": "package_test",
      "path": "tests/check-task-workflow.test.ts",
      "cwd": ".",
      "phase": "verification",
      "cost": "normal",
      "evidence_policy": "current_exact",
      "necessity": "Runs the relocated script cases or shared repository fixture consumer in its own Bun invocation.",
      "inputs": {
        "env": []
      }
    },
    {
      "id": "codex-handoff-resume",
      "kind": "package_test",
      "path": "tests/codex-handoff-resume.test.ts",
      "cwd": ".",
      "phase": "verification",
      "cost": "normal",
      "evidence_policy": "current_exact",
      "necessity": "Runs the relocated script cases or shared repository fixture consumer in its own Bun invocation.",
      "inputs": {
        "env": []
      }
    },
    {
      "id": "contract-worktree-squash-cleanup",
      "kind": "package_test",
      "path": "tests/contract-worktree-squash-cleanup.test.ts",
      "cwd": ".",
      "phase": "verification",
      "cost": "normal",
      "evidence_policy": "current_exact",
      "necessity": "Runs the relocated script cases or shared repository fixture consumer in its own Bun invocation.",
      "inputs": {
        "env": []
      }
    },
    {
      "id": "contract-worktree",
      "kind": "package_test",
      "path": "tests/contract-worktree.test.ts",
      "cwd": ".",
      "phase": "verification",
      "cost": "normal",
      "evidence_policy": "current_exact",
      "necessity": "Runs the relocated script cases or shared repository fixture consumer in its own Bun invocation.",
      "inputs": {
        "env": []
      }
    },
    {
      "id": "ensure-task-workflow",
      "kind": "package_test",
      "path": "tests/ensure-task-workflow.test.ts",
      "cwd": ".",
      "phase": "verification",
      "cost": "normal",
      "evidence_policy": "current_exact",
      "necessity": "Runs the relocated script cases or shared repository fixture consumer in its own Bun invocation.",
      "inputs": {
        "env": []
      }
    },
    {
      "id": "evidence-attested-import",
      "kind": "package_test",
      "path": "tests/evidence-attested-import.test.ts",
      "cwd": ".",
      "phase": "verification",
      "cost": "normal",
      "evidence_policy": "current_exact",
      "necessity": "Runs the relocated script cases or shared repository fixture consumer in its own Bun invocation.",
      "inputs": {
        "env": []
      }
    },
    {
      "id": "evidence-blob-store",
      "kind": "package_test",
      "path": "tests/evidence-blob-store.test.ts",
      "cwd": ".",
      "phase": "verification",
      "cost": "normal",
      "evidence_policy": "current_exact",
      "necessity": "Runs the relocated script cases or shared repository fixture consumer in its own Bun invocation.",
      "inputs": {
        "env": []
      }
    },
    {
      "id": "evidence-checkpoint",
      "kind": "package_test",
      "path": "tests/evidence-checkpoint.test.ts",
      "cwd": ".",
      "phase": "verification",
      "cost": "normal",
      "evidence_policy": "current_exact",
      "necessity": "Runs the relocated script cases or shared repository fixture consumer in its own Bun invocation.",
      "inputs": {
        "env": []
      }
    },
    {
      "id": "evidence-checks-materializer",
      "kind": "package_test",
      "path": "tests/evidence-checks-materializer.test.ts",
      "cwd": ".",
      "phase": "verification",
      "cost": "normal",
      "evidence_policy": "current_exact",
      "necessity": "Runs the relocated script cases or shared repository fixture consumer in its own Bun invocation.",
      "inputs": {
        "env": []
      }
    },
    {
      "id": "evidence-event-store",
      "kind": "package_test",
      "path": "tests/evidence-event-store.test.ts",
      "cwd": ".",
      "phase": "verification",
      "cost": "normal",
      "evidence_policy": "current_exact",
      "necessity": "Runs the relocated script cases or shared repository fixture consumer in its own Bun invocation.",
      "inputs": {
        "env": []
      }
    },
    {
      "id": "evidence-post-bash-importer",
      "kind": "package_test",
      "path": "tests/evidence-post-bash-importer.test.ts",
      "cwd": ".",
      "phase": "verification",
      "cost": "normal",
      "evidence_policy": "current_exact",
      "necessity": "Runs the relocated script cases or shared repository fixture consumer in its own Bun invocation.",
      "inputs": {
        "env": []
      }
    },
    {
      "id": "evidence-projection-drift",
      "kind": "package_test",
      "path": "tests/evidence-projection-drift.test.ts",
      "cwd": ".",
      "phase": "verification",
      "cost": "normal",
      "evidence_policy": "current_exact",
      "necessity": "Runs the relocated script cases or shared repository fixture consumer in its own Bun invocation.",
      "inputs": {
        "env": []
      }
    },
    {
      "id": "evidence-recovery-materializer",
      "kind": "package_test",
      "path": "tests/evidence-recovery-materializer.test.ts",
      "cwd": ".",
      "phase": "verification",
      "cost": "normal",
      "evidence_policy": "current_exact",
      "necessity": "Runs the relocated script cases or shared repository fixture consumer in its own Bun invocation.",
      "inputs": {
        "env": []
      }
    },
    {
      "id": "evidence-replay-recovery",
      "kind": "package_test",
      "path": "tests/evidence-replay-recovery.test.ts",
      "cwd": ".",
      "phase": "verification",
      "cost": "normal",
      "evidence_policy": "current_exact",
      "necessity": "Runs the relocated script cases or shared repository fixture consumer in its own Bun invocation.",
      "inputs": {
        "env": []
      }
    },
    {
      "id": "evidence-verify-producer",
      "kind": "package_test",
      "path": "tests/evidence-verify-producer.test.ts",
      "cwd": ".",
      "phase": "verification",
      "cost": "normal",
      "evidence_policy": "current_exact",
      "necessity": "Runs the relocated script cases or shared repository fixture consumer in its own Bun invocation.",
      "inputs": {
        "env": []
      }
    },
    {
      "id": "harness-trace-grade",
      "kind": "package_test",
      "path": "tests/harness-trace-grade.test.ts",
      "cwd": ".",
      "phase": "verification",
      "cost": "normal",
      "evidence_policy": "current_exact",
      "necessity": "Runs the relocated script cases or shared repository fixture consumer in its own Bun invocation.",
      "inputs": {
        "env": []
      }
    },
    {
      "id": "merge-gate",
      "kind": "package_test",
      "path": "tests/merge-gate.test.ts",
      "cwd": ".",
      "phase": "verification",
      "cost": "normal",
      "evidence_policy": "current_exact",
      "necessity": "Runs the relocated script cases or shared repository fixture consumer in its own Bun invocation.",
      "inputs": {
        "env": []
      }
    },
    {
      "id": "new-plan",
      "kind": "package_test",
      "path": "tests/new-plan.test.ts",
      "cwd": ".",
      "phase": "verification",
      "cost": "normal",
      "evidence_policy": "current_exact",
      "necessity": "Runs the relocated script cases or shared repository fixture consumer in its own Bun invocation.",
      "inputs": {
        "env": []
      }
    },
    {
      "id": "new-sprint",
      "kind": "package_test",
      "path": "tests/new-sprint.test.ts",
      "cwd": ".",
      "phase": "verification",
      "cost": "normal",
      "evidence_policy": "current_exact",
      "necessity": "Runs the relocated script cases or shared repository fixture consumer in its own Bun invocation.",
      "inputs": {
        "env": []
      }
    },
    {
      "id": "plan-to-todo",
      "kind": "package_test",
      "path": "tests/plan-to-todo.test.ts",
      "cwd": ".",
      "phase": "verification",
      "cost": "normal",
      "evidence_policy": "current_exact",
      "necessity": "Runs the relocated script cases or shared repository fixture consumer in its own Bun invocation.",
      "inputs": {
        "env": []
      }
    },
    {
      "id": "prepare-codex-handoff",
      "kind": "package_test",
      "path": "tests/prepare-codex-handoff.test.ts",
      "cwd": ".",
      "phase": "verification",
      "cost": "normal",
      "evidence_policy": "current_exact",
      "necessity": "Runs the relocated script cases or shared repository fixture consumer in its own Bun invocation.",
      "inputs": {
        "env": []
      }
    },
    {
      "id": "prepare-handoff",
      "kind": "package_test",
      "path": "tests/prepare-handoff.test.ts",
      "cwd": ".",
      "phase": "verification",
      "cost": "normal",
      "evidence_policy": "current_exact",
      "necessity": "Runs the relocated script cases or shared repository fixture consumer in its own Bun invocation.",
      "inputs": {
        "env": []
      }
    },
    {
      "id": "refresh-current-status",
      "kind": "package_test",
      "path": "tests/refresh-current-status.test.ts",
      "cwd": ".",
      "phase": "verification",
      "cost": "normal",
      "evidence_policy": "current_exact",
      "necessity": "Runs the relocated script cases or shared repository fixture consumer in its own Bun invocation.",
      "inputs": {
        "env": []
      }
    },
    {
      "id": "select-agent-context-blocks",
      "kind": "package_test",
      "path": "tests/select-agent-context-blocks.test.ts",
      "cwd": ".",
      "phase": "verification",
      "cost": "normal",
      "evidence_policy": "current_exact",
      "necessity": "Runs the relocated script cases or shared repository fixture consumer in its own Bun invocation.",
      "inputs": {
        "env": []
      }
    },
    {
      "id": "ship-worktrees",
      "kind": "package_test",
      "path": "tests/ship-worktrees.test.ts",
      "cwd": ".",
      "phase": "verification",
      "cost": "normal",
      "evidence_policy": "current_exact",
      "necessity": "Runs the relocated script cases or shared repository fixture consumer in its own Bun invocation.",
      "inputs": {
        "env": []
      }
    },
    {
      "id": "summarize-failures",
      "kind": "package_test",
      "path": "tests/summarize-failures.test.ts",
      "cwd": ".",
      "phase": "verification",
      "cost": "normal",
      "evidence_policy": "current_exact",
      "necessity": "Runs the relocated script cases or shared repository fixture consumer in its own Bun invocation.",
      "inputs": {
        "env": []
      }
    },
    {
      "id": "switch-plan",
      "kind": "package_test",
      "path": "tests/switch-plan.test.ts",
      "cwd": ".",
      "phase": "verification",
      "cost": "normal",
      "evidence_policy": "current_exact",
      "necessity": "Runs the relocated script cases or shared repository fixture consumer in its own Bun invocation.",
      "inputs": {
        "env": []
      }
    },
    {
      "id": "sync-brain-docs",
      "kind": "package_test",
      "path": "tests/sync-brain-docs.test.ts",
      "cwd": ".",
      "phase": "verification",
      "cost": "normal",
      "evidence_policy": "current_exact",
      "necessity": "Runs the relocated script cases or shared repository fixture consumer in its own Bun invocation.",
      "inputs": {
        "env": []
      }
    },
    {
      "id": "unit-helper-projection-drift",
      "kind": "package_test",
      "path": "tests/unit/helper-projection-drift.test.ts",
      "cwd": ".",
      "phase": "verification",
      "cost": "normal",
      "evidence_policy": "current_exact",
      "necessity": "Runs the relocated script cases or shared repository fixture consumer in its own Bun invocation.",
      "inputs": {
        "env": []
      }
    },
    {
      "id": "verify-contract",
      "kind": "package_test",
      "path": "tests/verify-contract.test.ts",
      "cwd": ".",
      "phase": "verification",
      "cost": "normal",
      "evidence_policy": "current_exact",
      "necessity": "Runs the relocated script cases or shared repository fixture consumer in its own Bun invocation.",
      "inputs": {
        "env": []
      }
    },
    {
      "id": "verify-sprint",
      "kind": "package_test",
      "path": "tests/verify-sprint.test.ts",
      "cwd": ".",
      "phase": "verification",
      "cost": "normal",
      "evidence_policy": "current_exact",
      "necessity": "Runs the relocated script cases or shared repository fixture consumer in its own Bun invocation.",
      "inputs": {
        "env": []
      }
    },
    {
      "id": "worktree-merge-lib",
      "kind": "package_test",
      "path": "tests/worktree-merge-lib.test.ts",
      "cwd": ".",
      "phase": "verification",
      "cost": "normal",
      "evidence_policy": "current_exact",
      "necessity": "Runs the relocated script cases or shared repository fixture consumer in its own Bun invocation.",
      "inputs": {
        "env": []
      }
    },
    {
      "id": "integrity-0",
      "kind": "command",
      "command": "bun run check:type",
      "cwd": ".",
      "phase": "preflight",
      "cost": "normal",
      "evidence_policy": "current_exact",
      "necessity": "Required repository integrity or TypeScript contract check.",
      "inputs": {
        "env": []
      }
    },
    {
      "id": "integrity-1",
      "kind": "command",
      "command": "bun run check:hooks",
      "cwd": ".",
      "phase": "preflight",
      "cost": "normal",
      "evidence_policy": "current_exact",
      "necessity": "Required repository integrity or TypeScript contract check.",
      "inputs": {
        "env": []
      }
    },
    {
      "id": "integrity-2",
      "kind": "command",
      "command": "bun run check:helpers",
      "cwd": ".",
      "phase": "preflight",
      "cost": "normal",
      "evidence_policy": "current_exact",
      "necessity": "Required repository integrity or TypeScript contract check.",
      "inputs": {
        "env": []
      }
    },
    {
      "id": "integrity-3",
      "kind": "command",
      "command": "bun run check:reference-configs",
      "cwd": ".",
      "phase": "preflight",
      "cost": "normal",
      "evidence_policy": "current_exact",
      "necessity": "Required repository integrity or TypeScript contract check.",
      "inputs": {
        "env": []
      }
    },
    {
      "id": "integrity-4",
      "kind": "command",
      "command": "bash scripts/check-deploy-sql-order.sh",
      "cwd": ".",
      "phase": "preflight",
      "cost": "normal",
      "evidence_policy": "current_exact",
      "necessity": "Required repository integrity or TypeScript contract check.",
      "inputs": {
        "env": []
      }
    },
    {
      "id": "integrity-5",
      "kind": "command",
      "command": "bash scripts/check-architecture-sync.sh",
      "cwd": ".",
      "phase": "preflight",
      "cost": "normal",
      "evidence_policy": "current_exact",
      "necessity": "Required repository integrity or TypeScript contract check.",
      "inputs": {
        "env": []
      }
    },
    {
      "id": "integrity-6",
      "kind": "command",
      "command": "bash scripts/check-task-sync.sh",
      "cwd": ".",
      "phase": "preflight",
      "cost": "normal",
      "evidence_policy": "current_exact",
      "necessity": "Required repository integrity or TypeScript contract check.",
      "inputs": {
        "env": []
      }
    },
    {
      "id": "integrity-7",
      "kind": "command",
      "command": "bash scripts/check-task-workflow.sh --strict",
      "cwd": ".",
      "phase": "preflight",
      "cost": "normal",
      "evidence_policy": "current_exact",
      "necessity": "Required repository integrity or TypeScript contract check.",
      "inputs": {
        "env": []
      }
    },
    {
      "id": "integrity-8",
      "kind": "command",
      "command": "bun scripts/inspect-project-state.ts --repo . --format text",
      "cwd": ".",
      "phase": "preflight",
      "cost": "normal",
      "evidence_policy": "current_exact",
      "necessity": "Required repository integrity or TypeScript contract check.",
      "inputs": {
        "env": []
      }
    },
    {
      "id": "integrity-9",
      "kind": "command",
      "command": "bun src/cli/index.ts init --repo . --dry-run",
      "cwd": ".",
      "phase": "preflight",
      "cost": "normal",
      "evidence_policy": "current_exact",
      "necessity": "Required repository integrity or TypeScript contract check.",
      "inputs": {
        "env": []
      }
    }
  ]
}
```

This is the sole executable verification authority. Use `baseline_with_delta`
only when a referenced immutable baseline plus named current delta checks prove
the intended coverage; do not infer that choice from paths or command text.

## Acceptance Notes (Human Review)

- Functional behavior: all original helper case expressions are retained; the ambient-root child now targets new-plan.test.ts and asserts one executed case.
- Edge cases: synchronous cleanup wrappers share one owner; asynchronous cleanup and domain-specific environment contracts remain distinct.
- Regression risks: default process HOME is now private per cwd, explicit HOME overrides remain authoritative. No assertion deletion, seed cache or concurrency change.

## Rollback Point

- Commit / checkpoint: f3ec4525
- Revert strategy: revert this test-only work-package as one diff.
