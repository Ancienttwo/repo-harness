> **Archived**: 2026-08-20 18:10
> **Related Plan**: plans/archive/plan-20260612-1151-loop-engine-03-no-go-router-schema-repair.md
> **Outcome**: Superseded
> **Lifecycle**: contract
> **Parent Run ID**: orphan-family-sweep

# Sprint Contract: loop-engine-03-no-go-router-schema-repair

> **Status**: Fulfilled
> **Plan**: plans/plan-20260612-1151-loop-engine-03-no-go-router-schema-repair.md
> **Owner**: chris
> **Capability ID**: root
> **Last Updated**: 2026-06-12 11:51
> **Review File**: `tasks/reviews/20260612-1151-loop-engine-03-no-go-router-schema-repair.review.md`
> **Notes File**: `tasks/notes/20260612-1151-loop-engine-03-no-go-router-schema-repair.notes.md`

## Goal

Repair the row 2 G1 no-go by making the `route-nl-vs-ts` eval expose a
controlled intent/action output vocabulary and normalize known agent aliases,
then rerun Codex and Claude evidence without changing runtime prompt-guard
authority.

## Scope

- In scope:
- `docs/reference-configs/loop-engine-nl-decision-table.md` output vocabulary
  guidance.
- `scripts/route-nl-vs-ts-eval.ts` scenario schema and alias normalization.
- `evals/evals.json` prompt wording and `evals/benchmark.md` latest Codex
  benchmark evidence.
- Focused route eval tests.
- `.ai/harness/runs/` reports proving the second G1 decision.
- Out of scope:
- Runtime prompt-guard behavior changes.
- Shadow injection.
- Classifier deletion or cutover.

## Workflow Inventory

- Source plan: `plans/plan-20260612-1151-loop-engine-03-no-go-router-schema-repair.md`
- Deferred-goal ledger: `tasks/todo.md`
- Review file: `tasks/reviews/20260612-1151-loop-engine-03-no-go-router-schema-repair.review.md`
- Notes file: `tasks/notes/20260612-1151-loop-engine-03-no-go-router-schema-repair.notes.md`
- Checks file: `.ai/harness/checks/latest.json`
- Run snapshots: `.ai/harness/runs/`
- Scope gate: edit only paths listed under `allowed_paths`; update this contract before widening scope.
- Completion gate: `scripts/verify-sprint.sh` must see this contract pass, the review recommend pass, and `## External Acceptance Advice` pass or record a manual override.

## Allowed Paths

```yaml
allowed_paths:
  - docs/reference-configs/loop-engine-nl-decision-table.md
  - docs/spec.md
  - evals/benchmark.md
  - evals/evals.json
  - plans/
  - scripts/route-nl-vs-ts-eval.ts
  - tasks/sprints/20260612-0236-loop-engine.sprint.md
  - tasks/todo.md
  - tasks/contracts/20260612-1151-loop-engine-03-no-go-router-schema-repair.contract.md
  - tasks/reviews/20260612-1151-loop-engine-03-no-go-router-schema-repair.review.md
  - tasks/notes/20260612-1151-loop-engine-03-no-go-router-schema-repair.notes.md
  - .ai/context/capabilities.json
  - .ai/harness/runs/
  - tests/route-nl-vs-ts-eval.test.ts
  - tests/evals-contract.test.ts
  - tests/run-skill-evals.test.ts
```

## Exit Criteria (Machine Verifiable)

```yaml
exit_criteria:
  files_exist:
    - docs/spec.md
    - docs/reference-configs/loop-engine-nl-decision-table.md
    - scripts/route-nl-vs-ts-eval.ts
    - tests/route-nl-vs-ts-eval.test.ts
  artifacts_exist:
    - .ai/harness/checks/latest.json
    - .ai/harness/runs/route-nl-vs-ts-report.json
    - .ai/harness/runs/loop-engine-03-no-go-router-schema-repair.json
    - tasks/notes/20260612-1151-loop-engine-03-no-go-router-schema-repair.notes.md
  tests_pass:
    - path: tests/route-nl-vs-ts-eval.test.ts
  commands_succeed:
    - bun test --timeout 20000 tests/route-nl-vs-ts-eval.test.ts tests/evals-contract.test.ts tests/run-skill-evals.test.ts
    - bun scripts/route-nl-vs-ts-eval.ts --check-report .ai/harness/runs/route-nl-vs-ts-report.json
    - bash scripts/check-task-sync.sh
    - bash scripts/check-task-workflow.sh --strict
  files_contain:
    - path: .ai/harness/runs/loop-engine-03-no-go-router-schema-repair.json
      pattern: '"conclusion": "go"'
    - path: tasks/reviews/20260612-1151-loop-engine-03-no-go-router-schema-repair.review.md
      pattern: "Second G1: go"
  qa_scores:
    - dimension: functionality
      min: 7
  manual_checks:
    - "Evaluator review file recommends pass"
```

## Acceptance Notes (Human Review)

- Functional behavior: scenario pack exposes exact allowed intent/action
  vocabulary, the NL table documents that vocabulary, and the evaluator
  normalizes known action aliases.
- Edge cases: true allow/block mistakes still produce no-go; harmless passive
  intent labels with `allow` do not fail routing compliance.
- Regression risks: token delta increased because the NL table now includes the
  exact vocabulary; runtime prompt-guard remains unchanged.

## Rollback Point

- Commit / checkpoint:
- Revert strategy:
