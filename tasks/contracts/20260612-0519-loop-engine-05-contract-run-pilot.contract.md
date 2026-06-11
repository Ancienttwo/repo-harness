# Sprint Contract: loop-engine-05-contract-run-pilot

> **Status**: Fulfilled
> **Plan**: plans/plan-20260612-0519-loop-engine-05-contract-run-pilot.md
> **Owner**: chris
> **Capability ID**: root
> **Last Updated**: 2026-06-12 05:25
> **Review File**: `tasks/reviews/20260612-0519-loop-engine-05-contract-run-pilot.review.md`
> **Notes File**: `tasks/notes/20260612-0519-loop-engine-05-contract-run-pilot.notes.md`

## Goal

Add a `repo-harness contract-run` command that packages a task contract for worker/verifier child runners, enforces delegation budget limits before child execution, and requires the verifier to produce a passing review using the contract exit criteria as the only rubric.

## Scope

- In scope:
  - CLI command surface for `repo-harness contract-run`.
  - Contract task package generation for worker and verifier child runners.
  - `delegation.budget.tool_calls` enforcement before invoking child runners.
  - Verifier review gate requiring a passing review recommendation.
  - Focused tests with a fake child runner.
- Out of scope:
  - Calling Claude/Codex directly from this command.
  - Implementing token accounting beyond metadata packaging.
  - Automatically approving or merging parent workflow state.

## Delegation Fields (κ)

These fields are optional delegation defaults for `contract-run` and child
agent calls. They do not loosen `allowed_paths`, exit criteria, or local
approval policy; omitted values inherit repo policy defaults.

```yaml
delegation:
  budget:
    tokens: null
    tool_calls: null
    wall_time_minutes: null
  permission_scope:
    filesystem: allowed_paths
    network: none
    approvals: owner
  roles:
    parent: narrate_only
    worker: implement_within_contract
    verifier: verify_exit_criteria
```

## Workflow Inventory

- Source plan: `plans/plan-20260612-0519-loop-engine-05-contract-run-pilot.md`
- Deferred-goal ledger: `tasks/todo.md`
- Review file: `tasks/reviews/20260612-0519-loop-engine-05-contract-run-pilot.review.md`
- Notes file: `tasks/notes/20260612-0519-loop-engine-05-contract-run-pilot.notes.md`
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
  - tasks/contracts/20260612-0519-loop-engine-05-contract-run-pilot.contract.md
  - tasks/reviews/20260612-0519-loop-engine-05-contract-run-pilot.review.md
  - tasks/notes/20260612-0519-loop-engine-05-contract-run-pilot.notes.md
  - .ai/context/capabilities.json
  - src/
  - tests/
```

## Exit Criteria (Machine Verifiable)

```yaml
exit_criteria:
  files_exist:
    - docs/spec.md
  artifacts_exist:
    - .ai/harness/checks/latest.json
    - tasks/notes/20260612-0519-loop-engine-05-contract-run-pilot.notes.md
  tests_pass:
    - path: tests/unit/loop-engine-05-contract-run-pilot.test.ts
  commands_succeed:
    - bun test tests/unit/loop-engine-05-contract-run-pilot.test.ts
    - bun src/cli/index.ts contract-run --help
    - bash scripts/check-task-workflow.sh --strict
  files_contain:
    - path: src/cli/index.ts
      pattern: "contract-run"
    - path: src/cli/commands/contract-run.ts
      pattern: "verifier_rubric_source"
    - path: tests/unit/loop-engine-05-contract-run-pilot.test.ts
      pattern: "budget exceeded"
  qa_scores:
    - dimension: functionality
      min: 7
  manual_checks:
    - "Evaluator review file recommends pass"
```

## Acceptance Notes (Human Review)

- Functional behavior: parent command writes task packages and invokes the configured runner once as worker and once as verifier.
- Edge cases: `tool_calls` budgets below the required two child calls abort before any runner is invoked.
- Regression risks: no default Claude/Codex invocation is introduced; child execution remains explicit via `--runner`.

## Rollback Point

- Commit / checkpoint: row5 branch before finish.
- Revert strategy: revert the row5 commit; no hook routing or contract template behavior from row4 is changed by this slice.
