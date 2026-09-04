> **Archived**: 2026-09-05 02:36
> **Related Plan**: plans/archive/plan-20260905-0201-task-sync-archived-evidence.md
> **Outcome**: Completed
> **Lifecycle**: contract
> **Parent Run ID**: run-20260905-0236
> **Archive Projection V1**: `plans/plan-20260905-0201-task-sync-archived-evidence.md` => `plans/archive/plan-20260905-0201-task-sync-archived-evidence.md`
> **Archive Projection V1**: `tasks/notes/20260905-0201-task-sync-archived-evidence.notes.md` => `tasks/archive/notes-20260905-0236-task-sync-archived-evidence.md`
> **Archive Projection V1**: `tasks/contracts/20260905-0201-task-sync-archived-evidence.contract.md` => `tasks/archive/contract-20260905-0236-task-sync-archived-evidence.md`
> **Archive Projection V1**: `tasks/reviews/20260905-0201-task-sync-archived-evidence.review.md` => `tasks/archive/review-20260905-0236-task-sync-archived-evidence.md`

# Task Contract: task-sync-archived-evidence

> **Status**: Fulfilled
> **Plan**: plans/archive/plan-20260905-0201-task-sync-archived-evidence.md
> **Task Profile**: bugfix
> <!-- legal values: code-change | docs-only | ledger-closeout | migration | eval-only | delegated-run | bugfix (omit for legacy passthrough); see docs/reference-configs/sprint-contracts.md -->
> **Owner**: ancienttwo
> **Capability ID**: root
> **Last Updated**: 2026-09-05 02:01
> **Review File**: `tasks/archive/review-20260905-0236-task-sync-archived-evidence.md`
> **Notes File**: `tasks/archive/notes-20260905-0236-task-sync-archived-evidence.md`
> **Exemplar**: `docs/reference-configs/contract-brief-example.md`

## Why

The single-publication closeout flow can publish correct digest-bound workflow evidence only under archive paths. CI evaluates the full push range after that closeout, so rejecting all archive paths makes a valid completed work package fail the governance gate.

## Goal

Accept exact-digest plan/contract/review/notes evidence newly added under the canonical archive paths during the evaluated range, while rejecting modified historical archives.

## Scope

- In scope: the source task-sync helper, its packaged template mirror, and focused regression tests.
- Out of scope: archive-workflow behavior, digest format, waiver semantics, unrelated archive consumers, and sprint BRC3.
- Taste constraints: keep one direct classifier rule; do not add a second archive metadata parser.

## Stop Conditions

- Stop and hand back to the parent if the change would require editing a path outside Allowed Paths.
- Stop if an Exit Criteria command cannot be run in this environment.
- Stop if Goal, Scope, or Exit Criteria are internally contradictory.

## Falsifier

If a newly added archived notes artifact with the exact digest still fails in base mode, or if editing a pre-existing archive begins to pass, the classifier rule is wrong. The two focused tests in `tests/check-task-sync.test.ts` are the cheapest proof.

## Root Cause Evidence

- root_cause: scripts/check-task-sync.sh classifies every `plans/archive/*` and `tasks/archive/*` path as ignored, so a closeout that archives the only exact-digest evidence leaves `evidence_files` empty when CI evaluates the publication base range.
- repro: bun test tests/check-task-sync.test.ts --timeout 60000 --test-name-pattern "base mode accepts exact-digest evidence archived in the same publication"
- regression_guard: tests/check-task-sync.test.ts
- pre_fix_failure_artifact: .ai/harness/runs/task-sync-archived-evidence/pre-fix.log

## Workflow Inventory

- Source plan: `plans/archive/plan-20260905-0201-task-sync-archived-evidence.md`
- Deferred-goal ledger: `tasks/todos.md`
- Review file: `tasks/archive/review-20260905-0236-task-sync-archived-evidence.md`
- Notes file: `tasks/archive/notes-20260905-0236-task-sync-archived-evidence.md`
- Checks file: `.ai/harness/checks/latest.json`
- Run snapshots: `.ai/harness/runs/`
- Scope gate: edit only paths listed under `allowed_paths`; update this contract before widening scope.
- Completion gate: run `verify-sprint --prepare-acceptance`, record one typed AcceptanceReceipt under the frozen policy below, then run `verify-sprint`; review Markdown is projection only.

## Change Assessment

```json
{"protocol":1,"oracles":[{"id":"task-sync-archive-regression","kind":"deterministic_test","paths":["*"]}]}
```

## Acceptance Policy

```json
{"protocol":2,"reviewer":"Codex","source":"codex-plugin","user_waiver":"allowed"}
```

## Allowed Paths

```yaml
allowed_paths:
  - plans/
  - tasks/todos.md
  - tasks/archive/contract-20260905-0236-task-sync-archived-evidence.md
  - tasks/archive/review-20260905-0236-task-sync-archived-evidence.md
  - tasks/archive/notes-20260905-0236-task-sync-archived-evidence.md
  - scripts/check-task-sync.sh
  - assets/templates/helpers/check-task-sync.sh
  - tests/check-task-sync.test.ts
  - .ai/harness/runs/
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
    - scripts/check-task-sync.sh
    - assets/templates/helpers/check-task-sync.sh
  artifacts_exist:
    - .ai/harness/checks/latest.json
    - tasks/archive/notes-20260905-0236-task-sync-archived-evidence.md
    - .ai/harness/runs/task-sync-archived-evidence/pre-fix.log
  tests_pass:
    - path: tests/check-task-sync.test.ts
  commands_succeed:
    - cmp scripts/check-task-sync.sh assets/templates/helpers/check-task-sync.sh
    - bash scripts/check-deploy-sql-order.sh
    - bash scripts/check-architecture-sync.sh
    - bash scripts/check-task-sync.sh
    - bash scripts/check-task-workflow.sh --strict
    - bun scripts/inspect-project-state.ts --repo . --format text
    - bun src/cli/index.ts init --repo . --dry-run
# Optional exact-subject reuse is fail-closed and opt-in. List only deterministic
# criteria whose inputs are fully bound by the frozen subject/toolchain context.
# criterion_reuse:
#   tests_pass:
#     - path/to/deterministic.test.ts
#   commands_succeed:
#     - bun test --timeout 60000
```

## Acceptance Notes (Human Review)

- Functional behavior:
- Edge cases:
- Regression risks:

## Rollback Point

- Commit / checkpoint: branch `codex/task-sync-archived-evidence` before implementation.
- Revert strategy: revert the helper classifier and its two focused regressions; no persisted data migration is involved.
