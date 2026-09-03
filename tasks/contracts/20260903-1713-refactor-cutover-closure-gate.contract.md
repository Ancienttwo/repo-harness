# Task Contract: refactor-cutover-closure-gate

> **Status**: Active
> **Plan**: plans/plan-20260903-1713-refactor-cutover-closure-gate.md
> **Task Profile**: code-change
> **Owner**: ancienttwo
> **Capability ID**: root
> **Last Updated**: 2026-09-04 00:00
> **Review File**: `tasks/reviews/20260903-1713-refactor-cutover-closure-gate.review.md`
> **Notes File**: `tasks/notes/20260903-1713-refactor-cutover-closure-gate.notes.md`

## Why

Refactor Mode cannot activate until a provider-independent gate proves that every declared legacy surface is explicitly disposed and every removed selector is absent from an exact Git candidate tree. Without this slice, downstream workflows can claim cutover without deterministic closure evidence.

## Goal

Deliver the PRD Module 1 Cutover Closure evaluator, its manifest/helper projections, and a closed `policy.refactor` reader that defaults to `off` and `require_cutover_closure: false`; prove the contract against merged PR #230 without wiring it into existing workflows.

## Scope

- In scope: the 13 product/test files enumerated in the source plan, the three workflow artifacts, and the source plan status/task projection.
- Out of scope: workflow activation, Task Profile changes, provider/ArchContext integration, state machine/program/board/MCP work, compatibility parsing, fallbacks, caches, migrations, and architecture projection changes.
- Taste constraints: exactly six closure categories, `path|relation|symbol` selectors, three public error codes, exact Git-object reads, canonical bare SHA-256, and no legacy vocabulary.

## Stop Conditions

- Stop if implementation requires a path outside Allowed Paths.
- Stop if PR #230 cannot prove deterministic closure without semantic inference.
- Stop if exact-head evidence would depend on the dirty worktree or an authority not named by the plan.
- Stop rather than add aliases, legacy parsing, heuristics, fallbacks, or workflow wiring.

## Falsifier

Replay the handwritten closure inventory against PR #230 head `4f7cb37e0edf74a8d0b334a8a24370ac48807f86`. If exact fixed-string relation evidence cannot classify it, leave policy off/false and return the PRD to design.

## Workflow Inventory

- Source plan: `plans/plan-20260903-1713-refactor-cutover-closure-gate.md`
- Deferred-goal ledger: `tasks/todos.md`
- Review file: `tasks/reviews/20260903-1713-refactor-cutover-closure-gate.review.md`
- Notes file: `tasks/notes/20260903-1713-refactor-cutover-closure-gate.notes.md`
- Checks file: `.ai/harness/checks/latest.json`
- Run snapshots: `.ai/harness/runs/`
- Scope gate: edit only paths listed under `allowed_paths`; update this contract before widening scope.
- Completion gate: verify the exact subject, record review evidence, and keep activation out of this slice.

## Change Assessment

```json
{"protocol":1,"oracles":[{"id":"cutover-closure-protocol-and-first-proof","kind":"deterministic_test","paths":["scripts/cutover-closure.ts","assets/templates/helpers/cutover-closure.ts","assets/workflow-contract.v1.json",".ai/harness/workflow-contract.json","scripts/workflow-contract.ts","assets/templates/helpers/workflow-contract.ts","src/cli/commands/run.ts","tests/unit/cutover-closure-gate.test.ts","tests/fixtures/cutover-closure/pr-230.contract.md","tests/workflow-contract.test.ts","tests/cli/run.test.ts"]},{"id":"refactor-policy-reader-defaults","kind":"deterministic_test","paths":["src/core/refactor/policy.ts","tests/unit/refactor-policy.test.ts"]}]}
```

## Acceptance Policy

```json
{"protocol":2,"reviewer":"Codex","source":"codex-review","user_waiver":"allowed"}
```

## Allowed Paths

```yaml
allowed_paths:
  - plans/plan-20260903-1713-refactor-cutover-closure-gate.md
  - tasks/current.md
  - tasks/contracts/20260903-1713-refactor-cutover-closure-gate.contract.md
  - tasks/reviews/20260903-1713-refactor-cutover-closure-gate.review.md
  - tasks/notes/20260903-1713-refactor-cutover-closure-gate.notes.md
  - tests/unit/cutover-closure-gate.test.ts
  - tests/fixtures/cutover-closure/pr-230.contract.md
  - tests/unit/refactor-policy.test.ts
  - tests/workflow-contract.test.ts
  - tests/cli/run.test.ts
  - scripts/cutover-closure.ts
  - assets/templates/helpers/cutover-closure.ts
  - assets/workflow-contract.v1.json
  - .ai/harness/workflow-contract.json
  - scripts/workflow-contract.ts
  - assets/templates/helpers/workflow-contract.ts
  - src/core/refactor/policy.ts
  - src/cli/commands/run.ts
```

## Evidence Requirements

```yaml
evidence_requirements:
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
    - scripts/cutover-closure.ts
    - assets/templates/helpers/cutover-closure.ts
    - src/core/refactor/policy.ts
    - tests/fixtures/cutover-closure/pr-230.contract.md
  artifacts_exist:
    - .ai/harness/checks/latest.json
    - tasks/notes/20260903-1713-refactor-cutover-closure-gate.notes.md
  tests_pass:
    - path: tests/unit/cutover-closure-gate.test.ts
    - path: tests/unit/refactor-policy.test.ts
    - path: tests/workflow-contract.test.ts
    - path: tests/cli/run.test.ts
  commands_succeed:
    - bun test tests/unit/cutover-closure-gate.test.ts tests/unit/refactor-policy.test.ts tests/workflow-contract.test.ts tests/cli/run.test.ts --timeout 60000
    - bun test tests/unit/helper-projection-drift.test.ts --timeout 60000
    - bun scripts/sync-helper-sources.ts --check
    - bun scripts/cutover-closure.ts verify --repo . --contract tests/fixtures/cutover-closure/pr-230.contract.md --head 4f7cb37e0edf74a8d0b334a8a24370ac48807f86 --output .ai/harness/checks/pr-230-cutover-closure.v1.json
    - bun test --timeout 60000
    - bash scripts/check-deploy-sql-order.sh
    - bash scripts/check-architecture-sync.sh
    - bash scripts/check-task-sync.sh
    - repo-harness run check-task-workflow --strict
    - bun scripts/inspect-project-state.ts --repo . --format text
    - bun src/cli/index.ts init --repo . --dry-run
```

## Acceptance Notes (Human Review)

- Functional behavior: pending implementation and PR #230 replay.
- Edge cases: exact-head residue, incomplete inventory, missing required section, unsafe locator, and malformed policy must fail closed.
- Regression risks: repeated fixed-string scans are intentionally uncached; runtime must remain below the plan's 45-second threshold.

## Rollback Point

- Commit / checkpoint: main@ffddb51e
- Revert strategy: revert the work-package commit; no persisted data or external state is introduced.
