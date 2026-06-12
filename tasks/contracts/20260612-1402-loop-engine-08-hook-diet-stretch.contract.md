# Sprint Contract: loop-engine-08-hook-diet-stretch

> **Status**: Fulfilled
> **Plan**: plans/archive/plan-20260612-1402-loop-engine-08-hook-diet-stretch.md
> **Owner**: chris
> **Capability ID**: root
> **Last Updated**: 2026-06-12 14:05
> **Review File**: `tasks/reviews/20260612-1402-loop-engine-08-hook-diet-stretch.review.md`
> **Notes File**: `tasks/archive/notes-20260612-1409-loop-engine-08-hook-diet-stretch.md`

## Goal

Close the stretch hook diet row by recording the current hook dispatch topology and phase-probe timings. The route registry is already at 7 public dispatch routes, so this slice must prove the <=8 target and preserve guard behavior rather than merging more hook scripts.

## Scope

- In scope: a report-only hook diet script, ignored run report, focused tests, hook-runtime regression verification, and review evidence.
- Out of scope: changing route registry behavior, deleting hook scripts, changing host adapter matchers, or weakening prompt/edit/done guards.

## Workflow Inventory

- Source plan: `plans/archive/plan-20260612-1402-loop-engine-08-hook-diet-stretch.md`
- Deferred-goal ledger: `tasks/todo.md`
- Review file: `tasks/reviews/20260612-1402-loop-engine-08-hook-diet-stretch.review.md`
- Notes file: `tasks/archive/notes-20260612-1409-loop-engine-08-hook-diet-stretch.md`
- Checks file: `.ai/harness/checks/latest.json`
- Run snapshots: `.ai/harness/runs/`
- Scope gate: edit only paths listed under `allowed_paths`; update this contract before widening scope.
- Completion gate: `scripts/verify-sprint.sh` must see this contract pass, the review recommend pass, and `## External Acceptance Advice` pass or record a manual override.

## Allowed Paths

```yaml
allowed_paths:
  - .ai/harness/runs/loop-engine-08-hook-diet-report.json
  - docs/spec.md
  - plans/
  - scripts/hook-dispatch-diet-report.ts
  - tasks/todo.md
  - tasks/contracts/20260612-1402-loop-engine-08-hook-diet-stretch.contract.md
  - tasks/reviews/20260612-1402-loop-engine-08-hook-diet-stretch.review.md
  - tasks/archive/notes-20260612-1409-loop-engine-08-hook-diet-stretch.md
  - .ai/context/capabilities.json
  - tests/hook-dispatch-diet-report.test.ts
```

## Delegation Contract

```yaml
delegation:
  budget:
    tokens: null
    tool_calls: null
    wall_time_minutes: null
  permission_scope:
    mode: inherit_allowed_paths
    writable_paths: []
    network: inherited
  roles:
    parent: narrate_and_gatekeep
    worker: implement_contract
    verifier: review_exit_criteria
```

## Exit Criteria (Machine Verifiable)

```yaml
exit_criteria:
  files_exist:
    - docs/spec.md
    - scripts/hook-dispatch-diet-report.ts
  artifacts_exist:
    - .ai/harness/checks/latest.json
    - .ai/harness/runs/loop-engine-08-hook-diet-report.json
    - tasks/archive/notes-20260612-1409-loop-engine-08-hook-diet-stretch.md
  tests_pass:
    - path: tests/hook-dispatch-diet-report.test.ts
  commands_succeed:
    - bun scripts/hook-dispatch-diet-report.ts --repo . --out .ai/harness/runs/loop-engine-08-hook-diet-report.json --iterations 3 --baseline-ms 250 --json
    - bun test tests/hook-runtime.test.ts tests/hook-contracts.test.ts tests/cli/route-registry.test.ts
    - bash scripts/check-task-workflow.sh --strict
  files_contain:
    - path: .ai/harness/runs/loop-engine-08-hook-diet-report.json
      pattern: "\"previous_count\": 13"
    - path: .ai/harness/runs/loop-engine-08-hook-diet-report.json
      pattern: "\"current_count\": 7"
    - path: .ai/harness/runs/loop-engine-08-hook-diet-report.json
      pattern: "\"within_baseline\": true"
  qa_scores:
    - dimension: functionality
      min: 7
  manual_checks:
    - "Evaluator review file recommends pass"
```

## Acceptance Notes (Human Review)

- Functional behavior: report records public hook dispatch count as 13 -> 7, target max 8, and phase probes within the 250ms baseline.
- Edge cases: this is a verification-only stretch because the route registry already met the diet target; behavior changes are intentionally out of scope.
- Regression risks: guard behavior is protected by `tests/hook-runtime.test.ts`, hook contract tests, and route-registry tests.

## Rollback Point

- Commit / checkpoint: row8 branch `codex/loop-engine-08-hook-diet-stretch-clean` before finish commit.
- Revert strategy: revert the row8 commit to remove the report script, focused test, and sprint artifacts; hook runtime behavior is unchanged.
