> **Archived**: 2026-08-20 18:10
> **Related Plan**: plans/archive/plan-20260612-0350-loop-engine-02-routing-ab-eval.md
> **Outcome**: Superseded
> **Lifecycle**: contract
> **Parent Run ID**: orphan-family-sweep

# Sprint Contract: loop-engine-02-routing-ab-eval

> **Status**: Fulfilled
> **Plan**: plans/plan-20260612-0350-loop-engine-02-routing-ab-eval.md
> **Owner**: chris
> **Capability ID**: root
> **Last Updated**: 2026-06-12 03:50
> **Review File**: `tasks/reviews/20260612-0350-loop-engine-02-routing-ab-eval.review.md`
> **Notes File**: `tasks/archive/notes-20260612-0433-loop-engine-02-routing-ab-eval.md`

## Goal

Add a `route-nl-vs-ts` benchmark that compares the current TypeScript prompt
guard verdict against agent self-routing from the natural-language loop-engine
decision table, without changing runtime prompt-guard behavior or cutting over
the classifier.

## Scope

- In scope:
  - Deterministic route scenarios covering the historical prompt-routing
    regressions named in `tasks/lessons.md` and hook-runtime tests.
  - A report generator for TS verdict vs NL decision-table routing.
  - `benchmark:skills` manifest/fixture coverage for a real agent-run B arm.
  - Local run snapshots under `.ai/harness/runs/`.
- Out of scope:
  - Runtime prompt-guard behavior changes.
  - Classifier cutover or deletion.
  - `loop-engine-03-shadow-injection` implementation.

## Workflow Inventory

- Source plan: `plans/plan-20260612-0350-loop-engine-02-routing-ab-eval.md`
- Deferred-goal ledger: `tasks/todo.md`
- Review file: `tasks/reviews/20260612-0350-loop-engine-02-routing-ab-eval.review.md`
- Notes file: `tasks/archive/notes-20260612-0433-loop-engine-02-routing-ab-eval.md`
- Checks file: `.ai/harness/checks/latest.json`
- Run snapshots: `.ai/harness/runs/`
- Scope gate: edit only paths listed under `allowed_paths`; update this contract before widening scope.
- Completion gate: `scripts/verify-sprint.sh` must see this contract pass, the review recommend pass, and `## External Acceptance Advice` pass or record a manual override.

## Allowed Paths

```yaml
allowed_paths:
  - docs/spec.md
  - plans/
  - tasks/todo.md
  - tasks/sprints/20260612-0236-loop-engine.sprint.md
  - tasks/contracts/20260612-0350-loop-engine-02-routing-ab-eval.contract.md
  - tasks/reviews/20260612-0350-loop-engine-02-routing-ab-eval.review.md
  - tasks/archive/notes-20260612-0433-loop-engine-02-routing-ab-eval.md
  - .ai/context/capabilities.json
  - .ai/harness/runs/
  - evals/
  - scripts/route-nl-vs-ts-eval.ts
  - src/
  - tests/
```

## Exit Criteria (Machine Verifiable)

```yaml
exit_criteria:
  files_exist:
    - docs/spec.md
    - scripts/route-nl-vs-ts-eval.ts
    - evals/fixtures/route-nl-vs-ts/AGENTS.md
    - evals/fixtures/route-nl-vs-ts/CLAUDE.md
    - tests/route-nl-vs-ts-eval.test.ts
  artifacts_exist:
    - .ai/harness/checks/latest.json
    - .ai/harness/runs/route-nl-vs-ts-report.json
    - .ai/harness/runs/loop-engine-02-routing-ab-eval.json
    - tasks/archive/notes-20260612-0433-loop-engine-02-routing-ab-eval.md
  tests_pass:
    - path: tests/route-nl-vs-ts-eval.test.ts
  commands_succeed:
    - bun test --timeout 20000 tests/route-nl-vs-ts-eval.test.ts tests/evals-contract.test.ts tests/run-skill-evals.test.ts
    - bun scripts/route-nl-vs-ts-eval.ts --check-report .ai/harness/runs/route-nl-vs-ts-report.json
  files_contain:
    - path: .ai/harness/runs/route-nl-vs-ts-report.json
      pattern: '"go_no_go"'
    - path: tasks/reviews/20260612-0350-loop-engine-02-routing-ab-eval.review.md
      pattern: "G1 no-go"
  qa_scores:
    - dimension: functionality
      min: 7
```

## Acceptance Notes (Human Review)

- Functional behavior: deterministic script and benchmark manifest are implemented; Codex with_skill non-dry-run produced a `go` report, while Claude direct non-dry-run produced a `no-go` report.
- Edge cases: missing or mismatched NL decisions become `no-go` evidence instead of crashing the harness.
- Regression risks: G1 is no-go; shadow injection and classifier deletion remain blocked until the NL action vocabulary/output schema is repaired and rerun.

## Rollback Point

- Commit / checkpoint: branch `codex/loop-engine-02-routing-ab-eval`.
- Revert strategy: revert the scoped eval/script/test files and remove ignored `.ai/harness/runs/route-nl-vs-ts*` snapshots.
