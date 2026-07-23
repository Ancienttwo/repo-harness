# Task Contract: verify-contract-qa-score-normalization

> **Status**: Active
> **Plan**: plans/plan-20260724-0129-verify-contract-qa-score-normalization.md
> **Task Profile**: bugfix
> <!-- legal values: code-change | docs-only | ledger-closeout | migration | eval-only | delegated-run | bugfix (omit for legacy passthrough); see docs/reference-configs/sprint-contracts.md -->
> **Owner**: kito
> **Capability ID**: verification-evals-checks
> **Last Updated**: 2026-07-24 01:29
> **Review File**: `tasks/reviews/20260724-0129-verify-contract-qa-score-normalization.review.md`
> **Notes File**: `tasks/notes/20260724-0129-verify-contract-qa-score-normalization.notes.md`
> **Exemplar**: `docs/reference-configs/contract-brief-example.md`

## Why

`verify-contract` is a merge gate. If a contract names a snake_case QA
dimension such as `code_quality`, the current lookup silently misses the
human-readable `Code quality` Scorecard row and reports the required score as
missing instead of enforcing the review score.

## Goal

Make QA dimension lookup compare one deterministic canonical label so
`code_quality` matches `Code quality`, while unrelated score labels and
verifier behavior remain unchanged.

## Scope

- In scope:
  - Add a regression fixture covering `code_quality` against `Code quality`.
  - Canonicalize underscores and whitespace only for QA dimension comparison.
  - Apply the same change to the authoritative helper and packaged mirror.
  - Remove the fulfilled deferred-goal row from `tasks/todos.md`.
- Out of scope:
  - New QA dimensions, fuzzy matching, aliases, or score-semantic changes.
  - Changes to any other verifier gate or deferred goal.
- Taste constraints: Minimal fail-closed normalization; no compatibility shim or heuristic parser.

## Stop Conditions

- Stop and hand back to the parent if the change would require editing a path outside Allowed Paths.
- Stop if an Exit Criteria command cannot be run in this environment.
- Stop if Goal, Scope, or Exit Criteria are internally contradictory.

## Falsifier

If a focused fixture using `dimension: code_quality` and a `Code quality`
Scorecard row already enforces the numeric minimum on unmodified `main`, the
root-cause hypothesis is false and implementation must stop.

## Root Cause Evidence

Required when Task Profile is `bugfix`; leave as-is otherwise.

- root_cause: `scripts/verify-contract.sh:404-413` lowercases the contract dimension and Scorecard label but does not canonicalize underscores and whitespace, so `code_quality` cannot equal `Code quality` and `review_score()` returns no score.
- repro: `bun test tests/helper-scripts.test.ts -t "verify-contract should enforce snake_case QA dimensions against human-readable Scorecard labels"`
- regression_guard: tests/helper-scripts.test.ts
- pre_fix_failure_artifact: .ai/harness/runs/20260724-0129-verify-contract-qa-score-normalization/pre-fix.log

## Workflow Inventory

- Source plan: `plans/plan-20260724-0129-verify-contract-qa-score-normalization.md`
- Deferred-goal ledger: `tasks/todos.md`
- Review file: `tasks/reviews/20260724-0129-verify-contract-qa-score-normalization.review.md`
- Notes file: `tasks/notes/20260724-0129-verify-contract-qa-score-normalization.notes.md`
- Checks file: `.ai/harness/checks/latest.json`
- Run snapshots: `.ai/harness/runs/`
- Scope gate: edit only paths listed under `allowed_paths`; update this contract before widening scope.
- Completion gate: run `verify-sprint --prepare-acceptance`, record one typed AcceptanceReceipt under the frozen policy below, then run `verify-sprint`; review Markdown is projection only.

## Acceptance Policy

```json
{"protocol":1,"reviewer":"Codex","user_waiver":"allowed"}
```

## Allowed Paths

```yaml
allowed_paths:
  - tasks/todos.md
  - plans/plan-20260724-0129-verify-contract-qa-score-normalization.md
  - tasks/contracts/20260724-0129-verify-contract-qa-score-normalization.contract.md
  - tasks/reviews/20260724-0129-verify-contract-qa-score-normalization.review.md
  - tasks/notes/20260724-0129-verify-contract-qa-score-normalization.notes.md
  - scripts/verify-contract.sh
  - assets/templates/helpers/verify-contract.sh
  - tests/helper-scripts.test.ts
  - .ai/harness/runs/20260724-0129-verify-contract-qa-score-normalization/
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
      - codex-exec
      - main-thread
    fallback: main-thread
    brief_is_authoritative: true
```

## Exit Criteria (Machine Verifiable)

```yaml
exit_criteria:
  files_exist:
    - scripts/verify-contract.sh
    - assets/templates/helpers/verify-contract.sh
  artifacts_exist:
    - .ai/harness/checks/latest.json
    - .ai/harness/runs/20260724-0129-verify-contract-qa-score-normalization/pre-fix.log
    - tasks/notes/20260724-0129-verify-contract-qa-score-normalization.notes.md
  tests_pass:
    - path: tests/helper-scripts.test.ts
  commands_succeed:
    - cmp scripts/verify-contract.sh assets/templates/helpers/verify-contract.sh
    - git diff --check
    - repo-harness run check-task-workflow --strict
    - bash scripts/check-task-sync.sh
    - bun run check:type
```

## Acceptance Notes (Human Review)

- Functional behavior: `code_quality` must enforce the score in `Code quality`.
- Edge cases: case and repeated whitespace remain normalized; punctuation and unrelated labels remain distinct.
- Regression risks: source/helper drift or over-broad label equivalence.

## Rollback Point

- Commit / checkpoint: branch baseline `051f8383`.
- Revert strategy: revert the reviewed diff on `codex/verify-contract-qa-score-normalization`.
