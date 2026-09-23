> **Archived**: 2026-09-22 01:48
> **Related Plan**: plans/archive/plan-20260922-0132-candidate-runtime-fixture-authority.md
> **Outcome**: Completed
> **Lifecycle**: contract
> **Parent Run ID**: run-20260922-0148
> **Archive Projection V1**: `plans/plan-20260922-0132-candidate-runtime-fixture-authority.md` => `plans/archive/plan-20260922-0132-candidate-runtime-fixture-authority.md`
> **Archive Projection V1**: `tasks/notes/20260922-0132-candidate-runtime-fixture-authority.notes.md` => `tasks/archive/notes-20260922-0148-candidate-runtime-fixture-authority.md`
> **Archive Projection V1**: `tasks/contracts/20260922-0132-candidate-runtime-fixture-authority.contract.md` => `tasks/archive/contract-20260922-0148-candidate-runtime-fixture-authority.md`
> **Archive Projection V1**: `tasks/reviews/20260922-0132-candidate-runtime-fixture-authority.review.md` => `tasks/archive/review-20260922-0148-candidate-runtime-fixture-authority.md`

# Task Contract: candidate-runtime-fixture-authority

> **Status**: Fulfilled
> **Plan**: plans/archive/plan-20260922-0132-candidate-runtime-fixture-authority.md
> **Task Profile**: bugfix
> <!-- legal values: code-change | docs-only | ledger-closeout | migration | eval-only | delegated-run | bugfix (omit for legacy passthrough); see docs/reference-configs/sprint-contracts.md -->
> **Owner**: ancienttwo
> **Capability ID**: root
> **Last Updated**: 2026-09-22 01:32
> **Review File**: `tasks/archive/review-20260922-0148-candidate-runtime-fixture-authority.md`
> **Notes File**: `tasks/archive/notes-20260922-0148-candidate-runtime-fixture-authority.md`
> **Exemplar**: `docs/reference-configs/contract-brief-example.md`

## Why

The existing candidate reconciliation tests fail during fixture setup and block full CI for the Agent-first stage PRs, hiding their actual end-to-end assertions.

## Goal

Make the copied old/new runtime fixtures use the real MANAGED_STOP_TIMEOUT_SECONDS authority, restoring the existing candidate-bound update/reconciliation tests without production changes.

## Scope

- In scope: the existing test fixture timeout override, pre/post failure evidence and own docs/workflow.
- Out of scope: production installer/runtime changes, dependency upgrades, fixture performance work, real runtime installation or merge.
- Taste constraints: one current authority, no old-expression fallback, preserve existing real CLI assertions.

## Stop Conditions

- Stop and hand back to the parent if the change would require editing a path outside Allowed Paths.
- Stop if an Exit Criteria command cannot be run in this environment.
- Stop if Goal, Scope, or Exit Criteria are internally contradictory.

## Falsifier

If the existing B/C cases still fail or stop asserting the actual installed candidate timeout/identity, the fix is insufficient. Re-run the unchanged end-to-end assertions in the same test file.

## Root Cause Evidence

- root_cause: tests/unit/candidate-bound-global-runtime-reconciliation.test.ts:45-54 mutates a removed literal in managed-entries.ts; current timeout authority is src/core/hook-work-budget.ts:2, so both B/C fixtures throw before exercising reconciliation.
- repro: bun test tests/unit/candidate-bound-global-runtime-reconciliation.test.ts
- regression_guard: tests/unit/candidate-bound-global-runtime-reconciliation.test.ts
- pre_fix_failure_artifact: .ai/harness/runs/candidate-runtime-fixture/pre-fix.log

## Workflow Inventory

- Source plan: `plans/archive/plan-20260922-0132-candidate-runtime-fixture-authority.md`
- Deferred-goal ledger: `tasks/todos.md`
- Review file: `tasks/archive/review-20260922-0148-candidate-runtime-fixture-authority.md`
- Notes file: `tasks/archive/notes-20260922-0148-candidate-runtime-fixture-authority.md`
- Checks file: `.ai/harness/checks/latest.json`
- Run snapshots: `.ai/harness/runs/`
- Scope gate: edit only paths listed under `allowed_paths`; update this contract before widening scope.
- Completion gate: run `verify-sprint --prepare-acceptance`, record one typed AcceptanceReceipt under the frozen policy below, then run `verify-sprint`; review Markdown is projection only.

## Change Assessment

```json
{"protocol": 1, "oracles": [{"id": "candidate-runtime-tests", "kind": "deterministic_test", "paths": ["*"]}]}
```

## Acceptance Policy

```json
{"protocol":2,"reviewer":"Codex","source":"codex-plugin","user_waiver":"allowed"}
```

## Allowed Paths

```yaml
allowed_paths:
  - tests/unit/candidate-bound-global-runtime-reconciliation.test.ts
  - docs/researches/20260922-candidate-runtime-fixture-authority.md
  - docs/architecture/.projection-manifest.json
  - plans/archive/plan-20260922-0132-candidate-runtime-fixture-authority.md
  - tasks/archive/contract-20260922-0148-candidate-runtime-fixture-authority.md
  - tasks/archive/review-20260922-0148-candidate-runtime-fixture-authority.md
  - tasks/archive/notes-20260922-0148-candidate-runtime-fixture-authority.md
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
    - tests/unit/candidate-bound-global-runtime-reconciliation.test.ts
    - docs/researches/20260922-candidate-runtime-fixture-authority.md
  artifacts_exist: []
```

## Verification Plan

```json
{
  "protocol": 1,
  "checks": [
    {
      "id": "candidate-runtime-tests",
      "kind": "package_test",
      "path": "tests/unit/candidate-bound-global-runtime-reconciliation.test.ts",
      "cwd": ".",
      "phase": "verification",
      "cost": "normal",
      "evidence_policy": "current_exact",
      "necessity": "Regression guard: real isolated B/C runtime update and reconciliation",
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
      "necessity": "Required repository integrity and test type safety; task sync covers full PR diff",
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
      "necessity": "Required repository integrity and test type safety; task sync covers full PR diff",
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
      "necessity": "Required repository integrity and test type safety; task sync covers full PR diff",
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
      "necessity": "Required repository integrity and test type safety; task sync covers full PR diff",
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
      "necessity": "Required repository integrity and test type safety; task sync covers full PR diff",
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
      "necessity": "Required repository integrity and test type safety; task sync covers full PR diff",
      "inputs": {
        "env": []
      }
    },
    {
      "id": "task-sync",
      "kind": "command",
      "command": "REPO_HARNESS_DIFF_BASE=0d4371c3f95e63851f4e083718f3337bf9646345 REPO_HARNESS_DIFF_MODE=merge-base bash scripts/check-task-sync.sh",
      "cwd": ".",
      "phase": "verification",
      "cost": "normal",
      "evidence_policy": "current_exact",
      "necessity": "Required repository integrity and test type safety; task sync covers full PR diff",
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
      "necessity": "Required repository integrity and test type safety; task sync covers full PR diff",
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
      "necessity": "Required repository integrity and test type safety; task sync covers full PR diff",
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
      "necessity": "Required repository integrity and test type safety; task sync covers full PR diff",
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

The existing test file is the regression guard: pre-fix capture shows 6 pass, 2 fail at the stale authority assertion, PRE_FIX_EXIT=1. No new case/file is needed because the same real CLI tests prove installed C timeout=150 and distinct candidate identity. Lowest sufficient boundary is the existing copied-runtime fixture; all writes and installs remain inside temporary fixture HOME. Root checks and type check remain mandatory. No local full suite is added. Hosted CI remains independent and cannot be marked passed from this run.

One directly blocking out-of-scope fixture repair for the Agent-first roadmap goal. No production semantic change or real install. Independent review and actual external-pass receipt are required before closeout.

## Rollback Point

- Commit / checkpoint: main 0d4371c3f95e63851f4e083718f3337bf9646345.
- Revert strategy: revert the single test file diff plus own docs; no runtime state migration.
