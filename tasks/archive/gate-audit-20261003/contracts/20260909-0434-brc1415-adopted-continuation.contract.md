# Task Contract: brc1415-adopted-continuation

> **Status**: Active
> **Plan**: plans/plan-20260909-0434-brc1415-adopted-continuation.md
> **Task Profile**: code-change
> <!-- legal values: code-change | docs-only | ledger-closeout | migration | eval-only | delegated-run | bugfix (omit for legacy passthrough); see docs/reference-configs/sprint-contracts.md -->
> **Owner**: ancienttwo
> **Capability ID**: root
> **Last Updated**: 2026-09-09 04:34
> **Review File**: `tasks/reviews/20260909-0434-brc1415-adopted-continuation.review.md`
> **Notes File**: `tasks/notes/20260909-0434-brc1415-adopted-continuation.notes.md`
> **Exemplar**: `docs/reference-configs/contract-brief-example.md`

## Why

The stopped adopted canary cannot use pre-adoption resume; changing old authority would invalidate provenance and risk duplicate execution.

## Goal

Permit one fresh-authority successor to revalidate the exact Issues of a stopped, published, never-acquired predecessor, then consume normal adoption and delivery guards.

## Scope

- In scope: existing resume-from, immutable successor binding, adoption identity enforcement, focused regression and PR delivery.
- Out of scope: old grant revival, acquired-source recovery, Oracle/Docker changes, new batch creation.
- Taste constraints: <!-- advisory only, no run gate; default style/taste lives in AGENTS.md and the minimal-change policy, use this to record a per-task override -->

## Stop Conditions

- Stop and hand back to the parent if the change would require editing a path outside Allowed Paths.
- Stop if an Exit Criteria command cannot be run in this environment.
- Stop if Goal, Scope, or Exit Criteria are internally contradictory.

## Falsifier

A successor can publish an Issue ID not in the predecessor manifest, or two successors can invoke provider work from the same predecessor. Real-store fake-provider regressions must reject both.

## Root Cause Evidence

Required when Task Profile is `bugfix`; leave as-is otherwise.

- root_cause: one sentence naming file:line/condition (testable, not "a state issue").
- repro: the command or UI path that reproduces the symptom.
- regression_guard: path to a test that fails on the unfixed code and passes after the fix (must also appear as a `package_test` check in Verification Plan).
- pre_fix_failure_artifact: path to a captured run of regression_guard on the UNFIXED code. Capture with `bun test <regression_guard> > <artifact> 2>&1; echo "PRE_FIX_EXIT=$?" >> <artifact>` (no pipes — pipes swallow the exit status). The gate requires a non-zero `PRE_FIX_EXIT=` line plus the regression_guard path string in the artifact (see the Root Cause Evidence Gate section in docs/reference-configs/sprint-contracts.md).

## Workflow Inventory

- Source plan: `plans/plan-20260909-0434-brc1415-adopted-continuation.md`
- Deferred-goal ledger: `tasks/todos.md`
- Review file: `tasks/reviews/20260909-0434-brc1415-adopted-continuation.review.md`
- Notes file: `tasks/notes/20260909-0434-brc1415-adopted-continuation.notes.md`
- Checks file: `.ai/harness/checks/latest.json`
- Run snapshots: `.ai/harness/runs/`
- Scope gate: edit only paths listed under `allowed_paths`; update this contract before widening scope.
- Completion gate: run `verify-sprint --prepare-acceptance`, record one typed AcceptanceReceipt under the frozen policy below, then run `verify-sprint`; review Markdown is projection only.

## Change Assessment

```json
{"protocol": 1, "oracles": [{"id": "continuation-regression", "kind": "deterministic_test", "paths": ["src/effects/automation/campaign-authoring-resume.ts"]}]}
```

## Acceptance Policy

```json
{"protocol":2,"reviewer":"Codex","source":"codex-plugin","user_waiver":"allowed"}
```

## Allowed Paths

```yaml
allowed_paths:
  - src/effects/automation/campaign-authoring-resume.ts
  - src/effects/automation/gpt-pro-issue-authoring.ts
  - src/effects/automation/issue-batch-store.ts
  - src/effects/automation/issue-batch-adoption.ts
  - tests/helpers/campaign-adoption-repository.ts
  - tests/effects/campaign-authoring-resume.test.ts
  - tests/effects/gpt-pro-issue-authoring.test.ts
  - docs/architecture/
  - docs/researches/20260908-brc14-provider-history-evidence.md
  - plans/plan-20260909-0434-brc1415-adopted-continuation.md
  - tasks/contracts/20260909-0434-brc1415-adopted-continuation.contract.md
  - tasks/reviews/20260909-0434-brc1415-adopted-continuation.review.md
  - tasks/notes/20260909-0434-brc1415-adopted-continuation.notes.md
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
    - docs/spec.md
  artifacts_exist:
    - .ai/harness/checks/latest.json
    - tasks/notes/20260909-0434-brc1415-adopted-continuation.notes.md
```

## Verification Plan

```json
{
  "protocol": 1,
  "checks": [
    {
      "id": "continuation-regression",
      "kind": "command",
      "command": "bun test --timeout 60000 tests/effects/campaign-authoring-resume.test.ts tests/effects/gpt-pro-issue-authoring.test.ts tests/effects/issue-batch-adoption.test.ts",
      "cwd": ".",
      "phase": "verification",
      "cost": "normal",
      "evidence_policy": "current_exact",
      "necessity": "Real stores, fresh authorization and actual admission/adoption prove exact-Issue continuation, negative authority branches and existing resume behavior.",
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
      "necessity": "Validate changed shared types.",
      "inputs": {
        "env": []
      }
    },
    {
      "id": "deploy-order",
      "kind": "command",
      "command": "bash scripts/check-deploy-sql-order.sh",
      "cwd": ".",
      "phase": "verification",
      "cost": "normal",
      "evidence_policy": "current_exact",
      "necessity": "Required repository integrity.",
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
      "necessity": "Required architecture projection integrity.",
      "inputs": {
        "env": []
      }
    },
    {
      "id": "task-sync",
      "kind": "command",
      "command": "REPO_HARNESS_DIFF_BASE=dece01a1 REPO_HARNESS_DIFF_MODE=merge-base bash scripts/check-task-sync.sh",
      "cwd": ".",
      "phase": "verification",
      "cost": "normal",
      "evidence_policy": "current_exact",
      "necessity": "Bind workflow evidence to this exact substantive diff.",
      "inputs": {
        "env": []
      }
    },
    {
      "id": "workflow",
      "kind": "command",
      "command": "bash scripts/check-task-workflow.sh --strict",
      "cwd": ".",
      "phase": "verification",
      "cost": "normal",
      "evidence_policy": "current_exact",
      "necessity": "Required workflow integrity.",
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
      "necessity": "Required state integrity.",
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
      "necessity": "Required init projection integrity.",
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

- Functional behavior:
- Edge cases:
- Regression risks:

## Rollback Point

- Commit / checkpoint:
- Revert strategy:
