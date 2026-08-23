> **Archived**: 2026-08-23 16:07
> **Related Plan**: plans/archive/plan-20260823-1452-fleet-acquire-state-boundary.md
> **Outcome**: Completed
> **Lifecycle**: contract
> **Parent Run ID**: run-20260823-1607

# Task Contract: fleet-acquire-state-boundary

> **Status**: Fulfilled
> **Plan**: plans/plan-20260823-1452-fleet-acquire-state-boundary.md
> **Task Profile**: bugfix
> <!-- legal values: code-change | docs-only | ledger-closeout | migration | eval-only | delegated-run | bugfix (omit for legacy passthrough); see docs/reference-configs/sprint-contracts.md -->
> **Owner**: ancienttwo
> **Capability ID**: root
> **Last Updated**: 2026-08-23 14:52
> **Review File**: `tasks/reviews/20260823-1452-fleet-acquire-state-boundary.review.md`
> **Notes File**: `tasks/notes/20260823-1452-fleet-acquire-state-boundary.notes.md`
> **Exemplar**: `docs/reference-configs/contract-brief-example.md`

## Why

`bun run check:ci` currently stops at the state-boundary gate because the fleet acquire effect imports CLI adapters. Until the reverse dependency is removed, Required/CI cannot reach the behavior tests and `main` cannot become green.

## Goal

Move the reusable sprint coordination verbs and their typed outcome/dependency contract to an effect-owned module, then have both the sprint CLI adapter and fleet acquisition consume that module while preserving claim/bind/release behavior byte-for-byte.

## Scope

- In scope: one shared coordination-sprint effect owner; rewiring the sprint CLI and fleet acquire effect; a regression guard for the state boundary; focused and full verification.
- Out of scope: lease schema/state changes, `COORDINATION_PROTOCOL` or digest-domain changes, fleet board/provider feedback/task inbox behavior, new CLI flags, compatibility aliases, CI workflow changes.
- Taste constraints: <!-- advisory only, no run gate; default style/taste lives in AGENTS.md and the minimal-change policy, use this to record a per-task override -->

## Stop Conditions

- Stop and hand back to the parent if the change would require editing a path outside Allowed Paths.
- Stop if an Exit Criteria command cannot be run in this environment.
- Stop if Goal, Scope, or Exit Criteria are internally contradictory.

## Falsifier

If `src/effects/fleet/acquire.ts` can retain imports from `src/cli/commands/*` while `bun scripts/check-state-boundaries.ts --repo .` passes on the unfixed tree, the proposed extraction does not address the actual gate. Check that command first.

## Root Cause Evidence

Required when Task Profile is `bugfix`; leave as-is otherwise.

- root_cause: `src/effects/fleet/acquire.ts:36-43` imports sprint command functions and `CommandOutcome` from `src/cli/commands/*`, violating the repository's effect-to-CLI dependency invariant and triggering `EFFECTS_REVERSE_IMPORT` before CI tests run.
- repro: `bun scripts/check-state-boundaries.ts --repo .`
- regression_guard: tests/fleet-acquire-state-boundary.test.ts
- pre_fix_failure_artifact: .ai/harness/runs/pre-fix-fleet-acquire-state-boundary.log

## Workflow Inventory

- Source plan: `plans/plan-20260823-1452-fleet-acquire-state-boundary.md`
- Deferred-goal ledger: `tasks/todos.md`
- Review file: `tasks/reviews/20260823-1452-fleet-acquire-state-boundary.review.md`
- Notes file: `tasks/notes/20260823-1452-fleet-acquire-state-boundary.notes.md`
- Checks file: `.ai/harness/checks/latest.json`
- Run snapshots: `.ai/harness/runs/`
- Scope gate: edit only paths listed under `allowed_paths`; update this contract before widening scope.
- Completion gate: run `verify-sprint --prepare-acceptance`, record one typed AcceptanceReceipt under the frozen policy below, then run `verify-sprint`; review Markdown is projection only.

## Change Assessment

```json
{"protocol":1,"oracles":[{"id":"fleet-boundary-deterministic-contract","kind":"deterministic_test","paths":["src/core/state/command-outcome.ts","src/effects/state/coordination-sprint.ts","src/cli/commands/sprint.ts","src/cli/commands/state.ts","src/effects/fleet/acquire.ts","tests/fleet-acquire-state-boundary.test.ts","tests/check-state-boundaries.test.ts","tests/coordination-lease-store.test.ts","tests/fleet-acquire-concurrency.test.ts","tests/unit/fleet-acquire-effect.test.ts","tests/cli/fleet-offer-acquire.test.ts","tests/cli/mcp-fleet-publication.test.ts","tests/cli/state-command.test.ts"]},{"id":"fleet-boundary-runtime-readback","kind":"runtime_readback","paths":["src/effects/state/coordination-sprint.ts","src/cli/commands/sprint.ts","src/effects/fleet/acquire.ts","tests/coordination-lease-store.test.ts","tests/fleet-acquire-concurrency.test.ts","tests/cli/fleet-offer-acquire.test.ts","tests/cli/mcp-fleet-publication.test.ts"]}]}
```

## Acceptance Policy

```json
{"protocol":1,"reviewer":"Claude","user_waiver":"allowed"}
```

## Allowed Paths

```yaml
allowed_paths:
  - plans/
  - tasks/todos.md
  - tasks/current.md
  - tasks/contracts/20260823-1452-fleet-acquire-state-boundary.contract.md
  - tasks/reviews/20260823-1452-fleet-acquire-state-boundary.review.md
  - tasks/notes/20260823-1452-fleet-acquire-state-boundary.notes.md
  - docs/architecture/.projection-manifest.json
  - src/core/state/command-outcome.ts
  - src/effects/state/coordination-sprint.ts
  - src/effects/fleet/acquire.ts
  - src/cli/commands/sprint.ts
  - src/cli/commands/state.ts
  - tests/fleet-acquire-state-boundary.test.ts
  - tests/check-state-boundaries.test.ts
  - tests/coordination-lease-store.test.ts
  - tests/fleet-acquire-concurrency.test.ts
  - tests/unit/fleet-acquire-effect.test.ts
  - tests/cli/fleet-offer-acquire.test.ts
  - tests/cli/mcp-fleet-publication.test.ts
  - tests/cli/state-command.test.ts
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
    - src/effects/state/coordination-sprint.ts
    - tests/fleet-acquire-state-boundary.test.ts
  artifacts_exist:
    - .ai/harness/checks/latest.json
    - tasks/notes/20260823-1452-fleet-acquire-state-boundary.notes.md
    - .ai/harness/runs/pre-fix-fleet-acquire-state-boundary.log
  tests_pass:
    - path: tests/fleet-acquire-state-boundary.test.ts
    - path: tests/check-state-boundaries.test.ts
    - path: tests/coordination-lease-store.test.ts
    - path: tests/fleet-acquire-concurrency.test.ts
    - path: tests/unit/fleet-acquire-effect.test.ts
    - path: tests/cli/fleet-offer-acquire.test.ts
    - path: tests/cli/mcp-fleet-publication.test.ts
    - path: tests/cli/state-command.test.ts
  commands_succeed:
    - bun scripts/check-state-boundaries.ts --repo .
    - bun run check:type
    - bun test --timeout 60000
    - bash scripts/check-deploy-sql-order.sh
    - bash scripts/check-architecture-sync.sh
    - bash scripts/check-task-sync.sh
    - repo-harness run check-task-workflow --strict
    - bun scripts/inspect-project-state.ts --repo . --format text
    - bun src/cli/index.ts init --repo . --dry-run
```

## Acceptance Notes (Human Review)

- Functional behavior: sprint CLI and fleet acquisition share the same effect-owned claim/bind/release implementation; CLI JSON and exit codes remain unchanged.
- Edge cases: acquisition failure still releases the exact claim; `resumed` receipt ordering and lease bytes are unchanged.
- Regression risks: moving orchestration could alter imports or error shaping; focused lease, concurrency, CLI, and MCP tests plus the full suite cover those surfaces.

## Rollback Point

- Commit / checkpoint: `38b91a39`
- Revert strategy: revert the single merge commit for this work-package; no persisted schema or digest migration is involved.
