# Task Contract: e1-observation-prepare

> **Status**: Active
> **Plan**: plans/plan-20260930-1842-e1-observation-prepare.md
> **Task Profile**: code-change
> <!-- legal values: code-change | docs-only | ledger-closeout | migration | eval-only | delegated-run | bugfix (omit for legacy passthrough); see docs/reference-configs/sprint-contracts.md -->
> **Owner**: chris
> **Capability ID**: root
> **Last Updated**: 2026-09-30 18:42
> **Review File**: `tasks/reviews/20260930-1842-e1-observation-prepare.review.md`
> **Notes File**: `tasks/notes/20260930-1842-e1-observation-prepare.notes.md`
> **Exemplar**: `docs/reference-configs/contract-brief-example.md`

## Why

Freeze server observation identity across host requests without trusting client time or changing admission.

## Goal

Add immutable content-addressed observation prepare/reader with authenticated principal, repository, canonical snapshot, policy revision and exact 30s admission-start freshness; explicit CLI/MCP prepare only.

## Scope

- In scope: S1 additions in the exact paths below and canonical workflow artifacts.
- Out of scope: admission wiring, S2+, old acquisition ledgers, GC, main/S0 worktrees, merge/finish.
- Taste constraints: reuse canonical JSON, Git common directory, exclusive locks and durable evidence primitives; no new dependency or fallback.

## Stop Conditions

- Stop and hand back to the parent if the change would require editing a path outside Allowed Paths.
- Stop if an Exit Criteria command cannot be run in this environment.
- Stop if Goal, Scope, or Exit Criteria are internally contradictory.

## Falsifier

If trusted T1 receipt cannot reproduce a null-attempt offer at T2 without changing admission, or a changed authority remains accepted, this direction fails. Existing me1a fixture is the cheapest proof.

## Root Cause Evidence

Required when Task Profile is `bugfix`; leave as-is otherwise.

- root_cause: one sentence naming file:line/condition (testable, not "a state issue").
- repro: the command or UI path that reproduces the symptom.
- regression_guard: path to a test that fails on the unfixed code and passes after the fix (must also appear as a `package_test` check in Verification Plan).
- pre_fix_failure_artifact: path to a captured run of regression_guard on the UNFIXED code. Capture with `bun test <regression_guard> > <artifact> 2>&1; echo "PRE_FIX_EXIT=$?" >> <artifact>` (no pipes — pipes swallow the exit status). The gate requires a non-zero `PRE_FIX_EXIT=` line plus the regression_guard path string in the artifact (see the Root Cause Evidence Gate section in docs/reference-configs/sprint-contracts.md).

## Workflow Inventory

- Source plan: `plans/plan-20260930-1842-e1-observation-prepare.md`
- Deferred-goal ledger: `tasks/todos.md`
- Review file: `tasks/reviews/20260930-1842-e1-observation-prepare.review.md`
- Notes file: `tasks/notes/20260930-1842-e1-observation-prepare.notes.md`
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
  - src/effects/engineers/scheduling-acquire-next.ts
  - src/cli/commands/engineer.ts
  - src/cli/mcp/engineer-tools.ts
  - tests/unit/issue-280-acquire-next.test.ts
  - tests/unit/me1a-engineer-scheduling-acquire.test.ts
  - tests/unit/me1a-engineer-scheduling.test.ts
  - tests/unit/issue-287-automation-attempt.test.ts
  - tests/cli/engineer.test.ts
  - tests/cli/mcp-engineer-tools.test.ts
  - tests/cli/mcp-http.test.ts
  - plans/plan-20260930-1842-e1-observation-prepare.md
  - tasks/contracts/20260930-1842-e1-observation-prepare.contract.md
  - tasks/reviews/20260930-1842-e1-observation-prepare.review.md
  - tasks/notes/20260930-1842-e1-observation-prepare.notes.md
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
    - src/effects/engineers/scheduling-acquire-next.ts
    - src/cli/commands/engineer.ts
    - src/cli/mcp/engineer-tools.ts
    - tests/unit/issue-280-acquire-next.test.ts
    - tests/unit/me1a-engineer-scheduling-acquire.test.ts
    - tests/unit/issue-287-automation-attempt.test.ts
    - tests/cli/engineer.test.ts
    - tests/cli/mcp-engineer-tools.test.ts
    - plans/plan-20260930-1842-e1-observation-prepare.md
    - tasks/contracts/20260930-1842-e1-observation-prepare.contract.md
    - tasks/reviews/20260930-1842-e1-observation-prepare.review.md
    - tasks/notes/20260930-1842-e1-observation-prepare.notes.md

  artifacts_exist: []
```

## Verification Plan

```json
{
  "protocol": 1,
  "checks": [
    {
      "id": "issue-280-acquire-next.test",
      "kind": "package_test",
      "path": "tests/unit/issue-280-acquire-next.test.ts",
      "necessity": "S1 producer/reader/transport and existing scheduling behavior regression",
      "cwd": ".",
      "phase": "verification",
      "cost": "normal",
      "evidence_policy": "current_exact",
      "inputs": {
        "env": []
      }
    },
    {
      "id": "me1a-engineer-scheduling-acquire.test",
      "kind": "package_test",
      "path": "tests/unit/me1a-engineer-scheduling-acquire.test.ts",
      "necessity": "S1 producer/reader/transport and existing scheduling behavior regression",
      "cwd": ".",
      "phase": "verification",
      "cost": "normal",
      "evidence_policy": "current_exact",
      "inputs": {
        "env": []
      }
    },
    {
      "id": "me1a-scheduling-real-collector",
      "kind": "package_test",
      "path": "tests/unit/me1a-engineer-scheduling.test.ts",
      "cwd": ".",
      "phase": "verification",
      "cost": "normal",
      "evidence_policy": "current_exact",
      "necessity": "Real collectEngineerOffers composition proves trusted time preserves null-attempt offer identity while changed authority still invalidates",
      "inputs": {
        "env": []
      }
    },
    {
      "id": "issue-287-automation-attempt.test",
      "kind": "package_test",
      "path": "tests/unit/issue-287-automation-attempt.test.ts",
      "necessity": "S1 producer/reader/transport and existing scheduling behavior regression",
      "cwd": ".",
      "phase": "verification",
      "cost": "normal",
      "evidence_policy": "current_exact",
      "inputs": {
        "env": []
      }
    },
    {
      "id": "engineer.test",
      "kind": "package_test",
      "path": "tests/cli/engineer.test.ts",
      "necessity": "S1 producer/reader/transport and existing scheduling behavior regression",
      "cwd": ".",
      "phase": "verification",
      "cost": "normal",
      "evidence_policy": "current_exact",
      "inputs": {
        "env": []
      }
    },
    {
      "id": "mcp-engineer-tools.test",
      "kind": "package_test",
      "path": "tests/cli/mcp-engineer-tools.test.ts",
      "necessity": "S1 producer/reader/transport and existing scheduling behavior regression",
      "cwd": ".",
      "phase": "verification",
      "cost": "normal",
      "evidence_policy": "current_exact",
      "inputs": {
        "env": []
      }
    },
    {
      "id": "mcp-http-engineer-inventory",
      "kind": "command",
      "command": "bun test tests/cli/mcp-http.test.ts --test-name-pattern \"Engineer\"",
      "cwd": ".",
      "phase": "verification",
      "cost": "normal",
      "evidence_policy": "current_exact",
      "necessity": "Existing closed HTTP Engineer tool inventory must include the additive prepare surface",
      "inputs": {
        "env": []
      }
    },
    {
      "id": "hooks",
      "kind": "command",
      "command": "bun run check:hooks",
      "necessity": "Required repository-integrity check",
      "cwd": ".",
      "phase": "verification",
      "cost": "normal",
      "evidence_policy": "current_exact",
      "inputs": {
        "env": []
      }
    },
    {
      "id": "helpers",
      "kind": "command",
      "command": "bun run check:helpers",
      "necessity": "Required repository-integrity check",
      "cwd": ".",
      "phase": "verification",
      "cost": "normal",
      "evidence_policy": "current_exact",
      "inputs": {
        "env": []
      }
    },
    {
      "id": "reference-configs",
      "kind": "command",
      "command": "bun run check:reference-configs",
      "necessity": "Required repository-integrity check",
      "cwd": ".",
      "phase": "verification",
      "cost": "normal",
      "evidence_policy": "current_exact",
      "inputs": {
        "env": []
      }
    },
    {
      "id": "deploy-sql",
      "kind": "command",
      "command": "bash scripts/check-deploy-sql-order.sh",
      "necessity": "Required repository-integrity check",
      "cwd": ".",
      "phase": "verification",
      "cost": "normal",
      "evidence_policy": "current_exact",
      "inputs": {
        "env": []
      }
    },
    {
      "id": "architecture",
      "kind": "command",
      "command": "bash scripts/check-architecture-sync.sh",
      "necessity": "Required repository-integrity check",
      "cwd": ".",
      "phase": "verification",
      "cost": "normal",
      "evidence_policy": "current_exact",
      "inputs": {
        "env": []
      }
    },
    {
      "id": "task-sync",
      "kind": "command",
      "command": "bash scripts/check-task-sync.sh",
      "necessity": "Required repository-integrity check",
      "cwd": ".",
      "phase": "verification",
      "cost": "normal",
      "evidence_policy": "current_exact",
      "inputs": {
        "env": []
      }
    },
    {
      "id": "task-workflow",
      "kind": "command",
      "command": "bash scripts/check-task-workflow.sh --strict",
      "necessity": "Required repository-integrity check",
      "cwd": ".",
      "phase": "verification",
      "cost": "normal",
      "evidence_policy": "current_exact",
      "inputs": {
        "env": []
      }
    },
    {
      "id": "state",
      "kind": "command",
      "command": "bun scripts/inspect-project-state.ts --repo . --format text",
      "necessity": "Required repository-integrity check",
      "cwd": ".",
      "phase": "verification",
      "cost": "normal",
      "evidence_policy": "current_exact",
      "inputs": {
        "env": []
      }
    },
    {
      "id": "adoption-dry-run",
      "kind": "command",
      "command": "bun src/cli/index.ts init --repo . --dry-run",
      "necessity": "Required repository-integrity check",
      "cwd": ".",
      "phase": "verification",
      "cost": "normal",
      "evidence_policy": "current_exact",
      "inputs": {
        "env": []
      }
    },
    {
      "id": "type",
      "kind": "command",
      "command": "bun run check:type",
      "necessity": "Gatekeeper found TS2345 in the null-attempt fixture; verify the complete TypeScript boundary before updating Draft PR #468",
      "cwd": ".",
      "phase": "verification",
      "cost": "normal",
      "evidence_policy": "current_exact",
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

- Changed behavior/boundary, existing covering tests and remaining gap:
- New test case/file rationale, or why existing coverage is sufficient:
- Selected check IDs and why their coverage is sufficient; omitted coverage:
- Full/expensive check justification and expected cost, if applicable:
- Execution/baseline references, subject, current delta and disposition:
- Residual risks and incomplete observations:

## Rollback Point

- Commit / checkpoint: main 2dd9ae01 (merged S0; S1 rebased onto this boundary)
- Revert strategy: revert S1 commit; observation records remain evidence, never claims.
