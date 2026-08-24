> **Archived**: 2026-08-25 01:52
> **Related Plan**: plans/archive/plan-20260824-2214-verify-sprint-incremental-retry.md
> **Outcome**: Completed
> **Lifecycle**: contract
> **Parent Run ID**: run-20260825-0152

# Task Contract: verify-sprint-incremental-retry

> **Status**: Fulfilled
> **Plan**: plans/plan-20260824-2214-verify-sprint-incremental-retry.md
> **Task Profile**: bugfix
> <!-- legal values: code-change | docs-only | ledger-closeout | migration | eval-only | delegated-run | bugfix (omit for legacy passthrough); see docs/reference-configs/sprint-contracts.md -->
> **Owner**: ancienttwo
> **Capability ID**: verification-evals-checks
> **Last Updated**: 2026-08-24 23:02
> **Review File**: `tasks/reviews/20260824-2214-verify-sprint-incremental-retry.review.md`
> **Notes File**: `tasks/notes/20260824-2214-verify-sprint-incremental-retry.notes.md`
> **Exemplar**: `docs/reference-configs/contract-brief-example.md`

## Why

`verify-sprint --prepare-acceptance` currently treats one contract run as an indivisible result. A cheap late sync failure therefore discards an already-passing full-suite result and makes the operator pay the full verification cost again for the same frozen subject.

## Goal

Make contract verification retry criterion-addressable: materialize automatic projections before freezing the retry identity, run known cheap state gates first, reuse only exact-key passing criterion results, and require a recorded force reason before an identical expensive pass can execute again.

## Scope

- In scope:
  - Exact retry identity bound to repository/worktree, normalized subject, target revision, contract, goal, command, and toolchain.
  - Passing-result cache, cheap-gate scheduling, expensive rerun fuse, and executed/reused run evidence.
  - Source and packaged helper projections plus focused regression coverage.
- Out of scope:
  - Cross-subject, cross-worktree, or remote result reuse.
  - Weakening AcceptanceReceipt, task sync, architecture sync, workflow sync, or allowed-path gates.
  - General-purpose build caching or semantic inference for missing authority values.
- Taste constraints: <!-- advisory only, no run gate; default style/taste lives in AGENTS.md and the minimal-change policy, use this to record a per-task override -->
  - Keep the scheduler inside the existing verifier scripts; add no dependency or general cache framework.

## Stop Conditions

- Stop and hand back to the parent if the change would require editing a path outside Allowed Paths.
- Stop if an Exit Criteria command cannot be run in this environment.
- Stop if Goal, Scope, or Exit Criteria are internally contradictory.

## Falsifier

If changing any declared identity dimension can still reuse a pass, or if a second same-key expensive process can spawn without a non-empty recorded reason, the design is invalid. The cheapest proof is the disposable two-run helper fixture.

## Root Cause Evidence

Required when Task Profile is `bugfix`; leave as-is otherwise.

- root_cause: `scripts/verify-contract.sh` executes every `tests_pass` and `commands_succeed` item on every invocation and `scripts/verify-sprint.sh` passes no frozen per-criterion retry identity, so a later cheap failure cannot reuse earlier passing work.
- repro: `bun test tests/helper-scripts.test.ts --test-name-pattern "verify-contract reuses a passing expensive criterion"` executes the expensive fixture twice across a failed cheap gate and its corrected retry.
- regression_guard: tests/helper-scripts.test.ts
- pre_fix_failure_artifact: tasks/notes/20260824-2214-verify-sprint-incremental-retry.pre-fix.txt

## Workflow Inventory

- Source plan: `plans/plan-20260824-2214-verify-sprint-incremental-retry.md`
- Deferred-goal ledger: `tasks/todos.md`
- Review file: `tasks/reviews/20260824-2214-verify-sprint-incremental-retry.review.md`
- Notes file: `tasks/notes/20260824-2214-verify-sprint-incremental-retry.notes.md`
- Checks file: `.ai/harness/checks/latest.json`
- Run snapshots: `.ai/harness/runs/`
- Scope gate: edit only paths listed under `allowed_paths`; update this contract before widening scope.
- Completion gate: run `verify-sprint --prepare-acceptance`, record one typed AcceptanceReceipt under the frozen policy below, then run `verify-sprint`; review Markdown is projection only.

## Change Assessment

```json
{"protocol":1,"oracles":[{"id":"criterion-retry-fixture","kind":"deterministic_test","paths":["scripts/verify-contract.sh","scripts/verify-sprint.sh","tests/helper-scripts.test.ts"]},{"id":"helper-projection-drift","kind":"deterministic_test","paths":["scripts/","assets/templates/helpers/"]}]}
```

## Acceptance Policy

```json
{"protocol":1,"reviewer":"Codex","user_waiver":"allowed"}
```

## Allowed Paths

```yaml
allowed_paths:
  - scripts/verify-contract.sh
  - scripts/verify-sprint.sh
  - assets/templates/helpers/verify-contract.sh
  - assets/templates/helpers/verify-sprint.sh
  - assets/templates/contract.template.md
  - .claude/templates/contract.template.md
  - docs/architecture/modules/verification/evals-checks.md
  - docs/architecture/modules/workflow-engine/contract-assets.md
  - plans/
  - tasks/todos.md
  - tasks/lessons.md
  - tasks/current.md
  - tasks/workstreams/verification/evals-checks/
  - tasks/contracts/20260824-2214-verify-sprint-incremental-retry.contract.md
  - tasks/reviews/20260824-2214-verify-sprint-incremental-retry.review.md
  - tasks/notes/20260824-2214-verify-sprint-incremental-retry.notes.md
  - tasks/notes/20260824-2214-verify-sprint-incremental-retry.pre-fix.txt
  - tests/helper-scripts.test.ts
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
    - tasks/notes/20260824-2214-verify-sprint-incremental-retry.pre-fix.txt
  artifacts_exist:
    - .ai/harness/checks/latest.json
    - tasks/notes/20260824-2214-verify-sprint-incremental-retry.notes.md
  tests_pass:
    - path: tests/helper-scripts.test.ts
  commands_succeed:
    - bun test --timeout 60000
    - bash scripts/check-deploy-sql-order.sh
    - bash scripts/check-architecture-sync.sh
    - bash scripts/check-task-sync.sh
    - repo-harness run check-task-workflow --strict
    - bun scripts/inspect-project-state.ts --repo . --format text
    - bun src/cli/index.ts init --repo . --dry-run
criterion_reuse:
  tests_pass:
    - tests/helper-scripts.test.ts
  commands_succeed:
    - bun test --timeout 60000
```

## Acceptance Notes (Human Review)

- Functional behavior: identical passing criteria are reused with explicit provenance; failed or invalid criteria execute again.
- Edge cases: identity changes, timeout/failure, malformed cache, concurrent attempts, and forced expensive reruns fail closed.
- Regression risks: stale reuse would be a false pass, so cache validation must reject every authority mismatch before reuse.

## Rollback Point

- Commit / checkpoint: branch `codex/verify-sprint-incremental-retry` before scheduler changes.
- Revert strategy: revert verifier/cache/evidence changes and focused regressions as one unit; full-run behavior is restored.
