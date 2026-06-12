# Sprint Contract: loop-engine-08-hook-diet-stretch

> **Status**: Fulfilled
> **Plan**: plans/plan-20260612-1146-loop-engine-08-hook-diet-stretch.md
> **Owner**: chris
> **Capability ID**: root
> **Last Updated**: 2026-06-12 11:57
> **Review File**: `tasks/reviews/20260612-1146-loop-engine-08-hook-diet-stretch.review.md`
> **Notes File**: `tasks/notes/20260612-1146-loop-engine-08-hook-diet-stretch.notes.md`

## Goal

Reduce hook dispatch count for the current loop-engine sprint stretch without removing guard behavior. Current route registry has 7 host routes and 9 script dispatches; this task must reduce route-dispatched scripts to 8 or fewer while keeping SessionStart security context, prompt guard, edit guards, and hook runtime tests green.

## Scope

- In scope:
  - Merge SessionStart security sentinel dispatch into `session-start-context.sh` as an internal phase.
  - Update route registry and generated host adapter templates so SessionStart dispatches one script.
  - Keep `security-sentinel.sh` available as a standalone/manual compatibility script.
  - Add unit coverage for script dispatch count and SessionStart security context.
  - Record timing comparison evidence in the review and sprint execution log.
- Out of scope:
  - Removing required edit guards.
  - Changing public event/route IDs.
  - Deleting `security-sentinel.sh`.

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

- Source plan: `plans/plan-20260612-1146-loop-engine-08-hook-diet-stretch.md`
- Deferred-goal ledger: `tasks/todo.md`
- Review file: `tasks/reviews/20260612-1146-loop-engine-08-hook-diet-stretch.review.md`
- Notes file: `tasks/notes/20260612-1146-loop-engine-08-hook-diet-stretch.notes.md`
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
  - tasks/contracts/20260612-1146-loop-engine-08-hook-diet-stretch.contract.md
  - tasks/reviews/20260612-1146-loop-engine-08-hook-diet-stretch.review.md
  - tasks/notes/20260612-1146-loop-engine-08-hook-diet-stretch.notes.md
  - .ai/context/capabilities.json
  - src/
  - tests/
  - .ai/hooks/run-hook.sh
  - .ai/hooks/session-start-context.sh
  - assets/hooks/run-hook.sh
  - assets/hooks/session-start-context.sh
  - assets/hooks/settings.template.json
  - assets/hooks/codex.hooks.template.json
  - scripts/repo-harness.sh
  - README.md
  - docs/reference-configs/hook-operations.md
  - assets/reference-configs/hook-operations.md
  - tasks/sprints/20260612-0236-loop-engine.sprint.md
```

## Exit Criteria (Machine Verifiable)

```yaml
exit_criteria:
  files_exist:
    - docs/spec.md
  artifacts_exist:
    - .ai/harness/checks/latest.json
    - tasks/notes/20260612-1146-loop-engine-08-hook-diet-stretch.notes.md
  tests_pass:
    - path: tests/unit/loop-engine-08-hook-diet-stretch.test.ts
    - path: tests/cli/route-registry.test.ts
    - path: tests/cli/hook.test.ts
  commands_succeed:
    - bun test tests/unit/loop-engine-08-hook-diet-stretch.test.ts tests/cli/route-registry.test.ts tests/cli/hook.test.ts tests/hook-contracts.test.ts
    - bun test tests/hook-runtime.test.ts
    - bash scripts/check-task-workflow.sh --strict
  qa_scores:
    - dimension: functionality
      min: 7
  manual_checks:
    - "Evaluator review file recommends pass"
```

## Acceptance Notes (Human Review)

- Functional behavior: SessionStart runs one route-dispatched script; `session-start-context.sh` internally appends security sentinel context when the fingerprint changes.
- Edge cases: standalone `security-sentinel.sh` remains installable and executable for direct smoke/debug.
- Regression risks: duplicate JSON output or lost security findings on SessionStart; covered by CLI hook and runtime tests.

## Rollback Point

- Commit / checkpoint: row8 branch commit after hook-runtime and workflow gates pass.
- Revert strategy: restore `security-sentinel.sh` in `SessionStart.default` route and adapter templates if SessionStart context aggregation regresses.
