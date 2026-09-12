> **Archived**: 2026-09-12 13:10
> **Related Plan**: plans/archive/plan-20260912-1239-init-automation-delivery.md
> **Outcome**: Completed
> **Lifecycle**: contract
> **Parent Run ID**: run-20260912-1310
> **Archive Projection V1**: `plans/plan-20260912-1239-init-automation-delivery.md` => `plans/archive/plan-20260912-1239-init-automation-delivery.md`
> **Archive Projection V1**: `tasks/notes/20260912-1239-init-automation-delivery.notes.md` => `tasks/archive/notes-20260912-1310-init-automation-delivery.md`
> **Archive Projection V1**: `tasks/contracts/20260912-1239-init-automation-delivery.contract.md` => `tasks/archive/contract-20260912-1310-init-automation-delivery.md`
> **Archive Projection V1**: `tasks/reviews/20260912-1239-init-automation-delivery.review.md` => `tasks/archive/review-20260912-1310-init-automation-delivery.md`

# Task Contract: init-automation-delivery

> **Status**: Fulfilled
> **Plan**: plans/archive/plan-20260912-1239-init-automation-delivery.md
> **Task Profile**: code-change
> <!-- legal values: code-change | docs-only | ledger-closeout | migration | eval-only | delegated-run | bugfix (omit for legacy passthrough); see docs/reference-configs/sprint-contracts.md -->
> **Owner**: ancienttwo
> **Capability ID**: root
> **Last Updated**: 2026-09-12 12:39
> **Review File**: `tasks/archive/review-20260912-1310-init-automation-delivery.md`
> **Notes File**: `tasks/archive/notes-20260912-1310-init-automation-delivery.md`
> **Exemplar**: `docs/reference-configs/contract-brief-example.md`

## Why

The target base requires a typed semantic acceptance receipt before merge; PR #412 must preserve initialization defaults and Stop recommendation behavior.

## Goal

Accept the exact PR #412 diff against origin/main, merge only after the installed seal and Required CI pass, then synchronize main and safely remove this task worktree.

## Scope

- In scope: existing PR #412 implementation, WIP documentation, fixture isolation, shared host-lock protection for the new defaults, and delivery evidence.
- Out of scope: additional product fixes, runtime installation, global configuration changes, releases, and unrelated worktrees.
- Taste constraints: <!-- advisory only, no run gate; default style/taste lives in AGENTS.md and the minimal-change policy, use this to record a per-task override -->

## Stop Conditions

- Stop and hand back to the parent if the change would require editing a path outside Allowed Paths.
- Stop if an Exit Criteria command cannot be run in this environment.
- Stop if Goal, Scope, or Exit Criteria are internally contradictory.

## Falsifier

Default seeding overwrites an explicit disabled preference or dry-run writes account config. Existing isolated init regression is the cheapest falsifier.

## Root Cause Evidence

Required when Task Profile is `bugfix`; leave as-is otherwise.

- root_cause: one sentence naming file:line/condition (testable, not "a state issue").
- repro: the command or UI path that reproduces the symptom.
- regression_guard: path to a test that fails on the unfixed code and passes after the fix (must also appear as a `package_test` check in Verification Plan).
- pre_fix_failure_artifact: path to a captured run of regression_guard on the UNFIXED code. Capture with `bun test <regression_guard> > <artifact> 2>&1; echo "PRE_FIX_EXIT=$?" >> <artifact>` (no pipes — pipes swallow the exit status). The gate requires a non-zero `PRE_FIX_EXIT=` line plus the regression_guard path string in the artifact (see the Root Cause Evidence Gate section in docs/reference-configs/sprint-contracts.md).

## Workflow Inventory

- Source plan: `plans/archive/plan-20260912-1239-init-automation-delivery.md`
- Deferred-goal ledger: `tasks/todos.md`
- Review file: `tasks/archive/review-20260912-1310-init-automation-delivery.md`
- Notes file: `tasks/archive/notes-20260912-1310-init-automation-delivery.md`
- Checks file: `.ai/harness/checks/latest.json`
- Run snapshots: `.ai/harness/runs/`
- Scope gate: edit only paths listed under `allowed_paths`; update this contract before widening scope.
- Completion gate: run `verify-sprint --prepare-acceptance`, record one typed AcceptanceReceipt under the frozen policy below, then run `verify-sprint`; review Markdown is projection only.

## Change Assessment

```json
{"protocol": 1, "oracles": [{"id": "automation-regressions", "kind": "deterministic_test", "paths": ["*"]}]}
```

## Acceptance Policy

```json
{"protocol":2,"reviewer":"Codex","source":"codex-plugin","user_waiver":"allowed"}
```

## Allowed Paths

```yaml
allowed_paths:
  - README.md
  - assets/AGENTS.md
  - assets/CLAUDE.md
  - docs/architecture/modules/workflow-engine/contract-assets.md
  - docs/architecture/requests/archive/2026/20260912-120712-workflow-engine-contract-assets.md
  - docs/architecture/requests/archive/2026/20260912-120727-root.md
  - docs/researches/20260912-capability-architecture-automation-audit.md
  - docs/spec.md
  - src/cli/commands/init.ts
  - src/cli/index.ts
  - tasks/lessons.md
  - tasks/reviews/20260912-init-architecture-defaults.review.md
  - tests/cli/adoption-plan.test.ts
  - tests/cli/init.test.ts
  - plans/
  - tasks/contracts/
  - tasks/reviews/
  - tasks/notes/
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
missing or malformed plan fails closed.

```yaml
exit_criteria:
  files_exist:
    - docs/spec.md
  artifacts_exist:
    - .ai/harness/checks/latest.json
    - tasks/archive/notes-20260912-1310-init-automation-delivery.md
```

## Verification Plan

```json
{
  "protocol": 1,
  "checks": [
    {
      "id": "automation-regressions",
      "kind": "command",
      "command": "account=$(mktemp -d); trap 'rm -rf \"$account\"' EXIT; HOME=\"$account\" REPO_HARNESS_HOME=\"$account/.repo-harness\" bun test tests/cli/adoption-plan.test.ts tests/cli/init.test.ts tests/cli/fleet-offer-acquire.test.ts tests/unit/global-architecture-projection.test.ts tests/unit/refactor-recommendations.test.ts tests/stop-handler.test.ts --timeout 60000",
      "cwd": ".",
      "phase": "verification",
      "cost": "normal",
      "evidence_policy": "current_exact",
      "necessity": "Rebind initialization, preference preservation, Stop delivery, and fleet fixture behavior to the final contract subject.",
      "inputs": {
        "env": []
      }
    },
    {
      "id": "helper-delta",
      "kind": "command",
      "command": "account=$(mktemp -d); trap 'rm -rf \"$account\"' EXIT; HOME=\"$account\" REPO_HARNESS_HOME=\"$account/.repo-harness\" bun test tests/helper-scripts.test.ts --test-name-pattern 'bundled verify-sprint binds|verify-sprint prints a notes|verify-sprint should fail when committed|verify-sprint should scope the default' --timeout 60000",
      "cwd": ".",
      "phase": "verification",
      "cost": "normal",
      "evidence_policy": "current_exact",
      "necessity": "Cover all four helper regressions exposed by global HOME contamination.",
      "inputs": {
        "env": []
      }
    },
    {
      "id": "integrity",
      "kind": "command",
      "command": "bun run check:type && bun run check:hooks && bun run check:helpers && bun run check:reference-configs && bash scripts/check-deploy-sql-order.sh && bash scripts/check-architecture-sync.sh && bash scripts/check-task-sync.sh && bash scripts/check-task-workflow.sh --strict && bun scripts/inspect-project-state.ts --repo . --format text && bun src/cli/index.ts init --repo . --dry-run",
      "cwd": ".",
      "phase": "verification",
      "cost": "normal",
      "evidence_policy": "current_exact",
      "necessity": "Required repository-integrity checks for this substantive PR.",
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

- Functional behavior: seed unset automation defaults and preserve the existing Stop delivery path.
- Edge cases: dry-run, explicit disabled preferences, and isolated account configuration.
- Regression risks: missing code facts remains a readiness failure; no generated semantics are invented.
- Baseline: 86 implementation tests and package-entrypoint smoke; 81 fixture-delta tests. See tasks/reviews/20260912-init-architecture-defaults.review.md. Hosted Required CI remains an additional merge condition, not a duplicate local full-suite criterion.

## Rollback Point

- Commit / checkpoint: origin/main at d94ec3c7517230b361f1354805ab3d4a364a045a.
- Revert strategy: revert the eventual PR merge commit; preserve the separate WIP commit.
