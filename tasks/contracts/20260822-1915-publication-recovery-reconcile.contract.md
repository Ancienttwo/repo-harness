# Task Contract: publication-recovery-reconcile

> **Status**: Fulfilled
> **Plan**: plans/plan-20260822-1915-publication-recovery-reconcile.md
> **Task Profile**: code-change
> <!-- legal values: code-change | docs-only | ledger-closeout | migration | eval-only | delegated-run | bugfix (omit for legacy passthrough); see docs/reference-configs/sprint-contracts.md -->
> **Owner**: ancienttwo
> **Capability ID**: root
> **Last Updated**: 2026-08-22 19:15
> **Review File**: `tasks/reviews/20260822-1915-publication-recovery-reconcile.review.md`
> **Notes File**: `tasks/notes/20260822-1915-publication-recovery-reconcile.notes.md`
> **Exemplar**: `docs/reference-configs/contract-brief-example.md`

## Why

WP0-B deliberately leaves published work in `reviewing`; without provider-backed recovery and integration closeout, a receipt failure or merged/superseded PR can strand the task lease indefinitely. A wrong closeout is worse than a leak because it can clear the current owner from stale local state, so every mutation must be fenced to a fetched provider OID and the exact current publication pointer.

## Goal

Deliver WP0-C from PRD v3: explicit publication recovery plus provider-driven integration reconcile. Reconcile must fetch the provider target into an isolated observation ref, prove the canonical sprint row completed at that fetched OID, reuse the existing `worktree_merge_mode` authority, revalidate receipt/pointer/task/claim/generation/head under the task lock, durably record immutable integration evidence, and remove only the exact reviewing lease. Recovery must inspect incomplete completing work and either replay the deterministic closeout path or perform an explicitly confirmed, safely fenced abort.

## Scope

- In scope: strict recovery/reconcile contracts and typed errors; live PR observation; isolated target fetch and fetched-OID canonical `[x]` proof; existing merge-mode classification; task-locked exact lease clearance; immutable integration evidence; publication CLI JSON commands; required board actions; focused and full verification.
- Out of scope: WP1/WP2, feedback or Task Inbox, daemon polling, auto-merge, provider-side close, remote claim refs, session liveness, marker synthesis/adoption, heuristic legacy attribution, `COORDINATION_PROTOCOL` or digest changes, a second canonical parser, or a second merge classifier.
- Taste constraints: Keep `current_publication` the sole mutable current authority. Observation refs and integration evidence are proof/audit carriers only. Fail closed on missing or mismatched provider, ref, row, receipt, pointer, claim, generation, or head evidence.

## Stop Conditions

- Stop and hand back to the parent if the change would require editing a path outside Allowed Paths.
- Stop if an Exit Criteria command cannot be run in this environment.
- Stop if Goal, Scope, or Exit Criteria are internally contradictory.

## Falsifier

The direction is wrong if the provider target cannot be fetched without mutating a shared/local target ref, or if the existing `worktree_merge_mode` executable cannot classify the exact publication head against the fetched observation OID. Check those two seams before adding lifecycle mutation code.

## Root Cause Evidence

Required when Task Profile is `bugfix`; leave as-is otherwise.

- root_cause: one sentence naming file:line/condition (testable, not "a state issue").
- repro: the command or UI path that reproduces the symptom.
- regression_guard: path to a test that fails on the unfixed code and passes after the fix (must also appear under exit_criteria.tests_pass).
- pre_fix_failure_artifact: path to a captured run of regression_guard on the UNFIXED code. Capture with `bun test <regression_guard> > <artifact> 2>&1; echo "PRE_FIX_EXIT=$?" >> <artifact>` (no pipes — pipes swallow the exit status). The gate requires a non-zero `PRE_FIX_EXIT=` line plus the regression_guard path string in the artifact (see the Root Cause Evidence Gate section in docs/reference-configs/sprint-contracts.md).

## Workflow Inventory

- Source plan: `plans/plan-20260822-1915-publication-recovery-reconcile.md`
- Deferred-goal ledger: `tasks/todos.md`
- Review file: `tasks/reviews/20260822-1915-publication-recovery-reconcile.review.md`
- Notes file: `tasks/notes/20260822-1915-publication-recovery-reconcile.notes.md`
- Checks file: `.ai/harness/checks/latest.json`
- Run snapshots: `.ai/harness/runs/`
- Scope gate: edit only paths listed under `allowed_paths`; update this contract before widening scope.
- Completion gate: run `verify-sprint --prepare-acceptance`, record one typed AcceptanceReceipt under the frozen policy below, then run `verify-sprint`; review Markdown is projection only.

## Change Assessment

```json
{"protocol":1,"oracles":[{"id":"publication-recovery-reconcile-deterministic-contract","kind":"deterministic_test","paths":["src/core/publication/publication-lifecycle.ts","src/core/state/project-board.ts","src/core/state/types.ts","src/effects/publication/publication-lifecycle.ts","src/effects/publication/publication-receipt.ts","tests/unit/publication-recovery-reconcile.test.ts","tests/unit/publication-lifecycle.test.ts","tests/board-projection.test.ts"]},{"id":"publication-recovery-reconcile-runtime-readback","kind":"runtime_readback","paths":["src/effects/publication/publication-lifecycle.ts","src/effects/publication/publication-receipt.ts","src/cli/commands/publication.ts","src/cli/hook/mutation-guard.ts","scripts/worktree-merge-lib.sh","tests/unit/publication-recovery-reconcile.test.ts","tests/contract-worktree-closeout-journal.test.ts","tests/mutation-guard.test.ts"]}]}
```

## Acceptance Policy

```json
{"protocol":1,"reviewer":"Claude","user_waiver":"allowed"}
```

## Allowed Paths

```yaml
allowed_paths:
  - plans/plan-20260822-1915-publication-recovery-reconcile.md
  - plans/prds/20260822-0405-fleet-acquire-publication-readiness.prd.md
  - tasks/todos.md
  - tasks/current.md
  - tasks/contracts/20260822-1915-publication-recovery-reconcile.contract.md
  - tasks/reviews/20260822-1915-publication-recovery-reconcile.review.md
  - tasks/notes/20260822-1915-publication-recovery-reconcile.notes.md
  - .ai/context/capabilities.json
  - docs/architecture/
  - src/core/publication/publication-lifecycle.ts
  - src/effects/publication/publication-lifecycle.ts
  - src/effects/publication/publication-receipt.ts
  - src/effects/state/coordination-canonical-source.ts
  - src/cli/commands/publication.ts
  - src/cli/hook/mutation-guard.ts
  - src/core/state/project-board.ts
  - src/core/state/types.ts
  - src/effects/state/collect-board-inputs.ts
  - scripts/worktree-merge-lib.sh
  - tests/unit/publication-recovery-reconcile.test.ts
  - tests/unit/publication-lifecycle.test.ts
  - tests/unit/publication-receipt.test.ts
  - tests/coordination-lease-store.test.ts
  - tests/sprint-claim-concurrency.test.ts
  - tests/board-projection.test.ts
  - tests/contract-worktree-closeout-journal.test.ts
  - tests/helper-scripts.test.ts
  - tests/mutation-guard.test.ts
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
    - src/core/publication/publication-lifecycle.ts
    - src/effects/publication/publication-lifecycle.ts
    - tests/unit/publication-recovery-reconcile.test.ts
  artifacts_exist:
    - .ai/harness/checks/latest.json
    - tasks/notes/20260822-1915-publication-recovery-reconcile.notes.md
  tests_pass:
    - path: tests/unit/publication-recovery-reconcile.test.ts
    - path: tests/unit/publication-lifecycle.test.ts
    - path: tests/unit/publication-receipt.test.ts
    - path: tests/coordination-lease-store.test.ts
    - path: tests/sprint-claim-concurrency.test.ts
    - path: tests/board-projection.test.ts
    - path: tests/contract-worktree-closeout-journal.test.ts
    - path: tests/helper-scripts.test.ts
    - path: tests/mutation-guard.test.ts
  commands_succeed:
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

- Functional behavior: Verify recovery convergence and provider-OID-fenced integration closeout without calling sprint reconcile.
- Edge cases: Open+absorbed succeeds with attention; closed+unmerged retains reviewing; stale observation, pointer, claim, generation, head, row, and evidence writes all refuse without lease mutation; retries are byte-idempotent.
- Regression risks: Existing receipt/lifecycle, lease concurrency, board projection, closeout journal, and merge classifier behavior remain unchanged.

## Rollback Point

- Commit / checkpoint: WP0-C implementation commit plus verified workflow closeout commits.
- Revert strategy: Revert WP0-C as one unit; WP0-A receipts and WP0-B reviewing leases remain valid and operator-actionable.
