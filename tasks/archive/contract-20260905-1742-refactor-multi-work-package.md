> **Archived**: 2026-09-05 17:42
> **Related Plan**: plans/archive/plan-20260905-1617-refactor-multi-work-package.md
> **Outcome**: Completed
> **Lifecycle**: contract
> **Parent Run ID**: run-20260905-1742
> **Archive Projection V1**: `plans/plan-20260905-1617-refactor-multi-work-package.md` => `plans/archive/plan-20260905-1617-refactor-multi-work-package.md`
> **Archive Projection V1**: `tasks/notes/20260905-1617-refactor-multi-work-package.notes.md` => `tasks/archive/notes-20260905-1742-refactor-multi-work-package.md`
> **Archive Projection V1**: `tasks/contracts/20260905-1617-refactor-multi-work-package.contract.md` => `tasks/archive/contract-20260905-1742-refactor-multi-work-package.md`
> **Archive Projection V1**: `tasks/reviews/20260905-1617-refactor-multi-work-package.review.md` => `tasks/archive/review-20260905-1742-refactor-multi-work-package.md`

# Task Contract: refactor-multi-work-package

> **Status**: Fulfilled
> **Plan**: plans/archive/plan-20260905-1617-refactor-multi-work-package.md
> **Task Profile**: code-change
> <!-- legal values: code-change | docs-only | ledger-closeout | migration | eval-only | delegated-run | bugfix (omit for legacy passthrough); see docs/reference-configs/sprint-contracts.md -->
> **Owner**: ancienttwo
> **Capability ID**: root
> **Last Updated**: 2026-09-05 16:17
> **Review File**: `tasks/archive/review-20260905-1742-refactor-multi-work-package.md`
> **Notes File**: `tasks/archive/notes-20260905-1742-refactor-multi-work-package.md`
> **Exemplar**: `docs/reference-configs/contract-brief-example.md`

## Why

ArchContext 0.5.7 emits one recommendation for a cross-module proposal; one-to-one execution assumptions prevent the approved multi-module route from closing.

## Goal

Materialize and verify multiple canonical Work Packages for one accepted recommendation, aggregate their evidence at exact final main, and resolve/project the recommendation only when all mapped tasks are covered.

## Scope

- In scope: Program mapping consistency; canonical task selection; task-scoped candidate and execution receipts; final-main evidence aggregation/retry; Board Work Package identities; focused regression and durable docs.
- Out of scope: activation promotion/canary ladder, upstream changes, Operator UI, unrelated main workflow rules.

## Stop Conditions

- Stop and hand back to the parent if the change would require editing a path outside Allowed Paths.
- Stop if an Exit Criteria command cannot be run in this environment.
- Stop if Goal, Scope, or Exit Criteria are internally contradictory.

## Falsifier

A genuine two-task Program cannot materialize from a single accepted recommendation, or one task can close the other task's result. Prove with the Git-backed multi-work-package regression before source edits.

## Workflow Inventory

- Source plan: `plans/archive/plan-20260905-1617-refactor-multi-work-package.md`
- Deferred-goal ledger: `tasks/todos.md`
- Review file: `tasks/archive/review-20260905-1742-refactor-multi-work-package.md`
- Notes file: `tasks/archive/notes-20260905-1742-refactor-multi-work-package.md`
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
  - src/core/refactor/
  - src/effects/refactor/
  - tests/unit/
  - docs/researches/20260905-refactor-multi-work-package.md
  - docs/architecture/modules/runtime-harness/refactor-program.md
  - docs/architecture/.projection-manifest.json
  - plans/
  - tasks/archive/contract-20260905-1742-refactor-multi-work-package.md
  - tasks/archive/review-20260905-1742-refactor-multi-work-package.md
  - tasks/archive/notes-20260905-1742-refactor-multi-work-package.md
  - tasks/archive/
  - tasks/current.md
  - tasks/workstreams/runtime-harness/refactor-program/
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
    - docs/researches/20260905-refactor-multi-work-package.md
  commands_succeed:
    - bun test --timeout 60000 tests/unit/refactor-multi-work-package.test.ts tests/unit/refactor-post-merge-resolution.test.ts
    - bun run check:type
    - bun scripts/check-state-boundaries.ts
criterion_reuse:
  commands_succeed:
    - bun test --timeout 60000 tests/unit/refactor-multi-work-package.test.ts tests/unit/refactor-post-merge-resolution.test.ts
    - bun run check:type
    - bun scripts/check-state-boundaries.ts
```

## Acceptance Notes (Human Review)

- Functional behavior: one accepted recommendation → two independently verified canonical tasks → one aggregate final-main measurement and lifecycle resolution.
- Edge cases: incomplete, duplicate, crossed task identities, partial candidate measurements, retry after provider lifecycle interruption, Board rebuild.
- Regression risks: focused checks cover all refactor consumers and canonical task identity. Baseline 78bb1716 has documented 350-file partitioned coverage; no new full-suite claim or uncovered integration risk requires another full run. Root integrity checks remain mandatory.

- Frozen baseline verification: `run-20260905T163419-18978-20260905-1617-refactor-multi-work-package` passed all refactor tests, canonical task identity, typecheck and state boundaries at checkpoint 5628522d (subject `sha256:6b5322acf00c88d61f66ef1904d8c727276545d9d322a9616d3c0a0c3dcbe10a`). The final delta canonicalizes begin_merge event refs for stale concurrent replay; final criteria cover both affected integration files plus type/boundary checks. Baseline evidence remains bound to its original subject.

## Rollback Point

- Commit / checkpoint: 78bb171628ea8ecc3b33d1f0df763b2acbf14ca0.
- Revert strategy: revert this branch as one unit before activation.
