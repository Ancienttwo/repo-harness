> **Archived**: 2026-08-20 15:03
> **Related Plan**: plans/archive/plan-20260820-1436-cross-review-single-pass.md
> **Outcome**: Completed
> **Lifecycle**: contract
> **Parent Run ID**: run-20260820-1503

# Task Contract: cross-review-single-pass

> **Status**: Fulfilled
> **Plan**: plans/plan-20260820-1436-cross-review-single-pass.md
> **Task Profile**: bugfix
> <!-- legal values: code-change | docs-only | ledger-closeout | migration | eval-only | delegated-run | bugfix (omit for legacy passthrough); see docs/reference-configs/sprint-contracts.md -->
> **Owner**: ancienttwo
> **Capability ID**: root
> **Last Updated**: 2026-08-20 14:37
> **Review File**: `tasks/reviews/20260820-1436-cross-review-single-pass.review.md`
> **Notes File**: `tasks/notes/20260820-1436-cross-review-single-pass.notes.md`
> **Exemplar**: `docs/reference-configs/contract-brief-example.md`

## Why

The configured one-review contract is only advisory for prompt routing: a direct `repo-harness cross-review` invocation bypasses the circuit and can be repeated after every finding correction. Separately, Markdown-bold finding headings parse as no findings, producing a false PASS even when the transcript contains P1 blockers.

## Goal

For an active work-package, the direct cross-review CLI may enter provider execution exactly once across all later subject changes. A second invocation fails before spawning the provider and points to owner waiver/closeout rather than re-review. Plain, bulleted, headed, and Markdown-bold P1/P2 finding lines must preserve severity so a P1 can never generate a PASS recommendation.

## Scope

- In scope: stable active-contract identity; direct CLI admission through a one-attempt semantic-review circuit; provider-before-spawn enforcement; narrow Markdown-wrapper finding parsing; regression coverage.
- Out of scope: provider retry count; acceptance exact-subject rules; review/repair/subagent circuit limits; reset/re-review overrides; provider prompt content.
- Taste constraints: Reuse the existing circuit-breaker state and lock rather than create a second ledger. Bind progress to the active contract path, never the changing implementation subject.

## Stop Conditions

- Stop and hand back to the parent if the change would require editing a path outside Allowed Paths.
- Stop if an Exit Criteria command cannot be run in this environment.
- Stop if Goal, Scope, or Exit Criteria are internally contradictory.

## Falsifier

If `parseFindings('**[P1] blocker**')` already yields a P1 and two direct command calls under one active contract spawn the fixture provider only once, the premise is false. The cheapest proof is two focused tests before production edits.

## Root Cause Evidence

Required when Task Profile is `bugfix`; leave as-is otherwise.

- root_cause: `src/cli/commands/cross-review.ts:40` calls the provider runner without recording a stable work-package attempt, while `src/core/review/cross-review.ts:107` rejects Markdown-bold severity markers and returns an empty finding set.
- repro: run `repo-harness cross-review --provider claude` twice after editing the same active work-package, or call `parseFindings('**[P1] blocker**')`.
- regression_guard: tests/cli/cross-review.test.ts
- pre_fix_failure_artifact: tasks/notes/20260820-1436-cross-review-single-pass.pre-fix.log

## Workflow Inventory

- Source plan: `plans/plan-20260820-1436-cross-review-single-pass.md`
- Deferred-goal ledger: `tasks/todos.md`
- Review file: `tasks/reviews/20260820-1436-cross-review-single-pass.review.md`
- Notes file: `tasks/notes/20260820-1436-cross-review-single-pass.notes.md`
- Checks file: `.ai/harness/checks/latest.json`
- Run snapshots: `.ai/harness/runs/`
- Scope gate: edit only paths listed under `allowed_paths`; update this contract before widening scope.
- Completion gate: run `verify-sprint --prepare-acceptance`, record one typed AcceptanceReceipt under the frozen policy below, then run `verify-sprint`; review Markdown is projection only.

## Change Assessment

```json
{"protocol":1,"oracles":[{"id":"cross-review-single-pass-suite","kind":"deterministic_test","paths":[".ai/harness/policy.json","src/core/adoption/standard-plan.ts","src/core/review/cross-review.ts","src/effects/review/cross-review-runner.ts","src/cli/commands/cross-review.ts","src/cli/hook/circuit-breaker.ts","scripts/ensure-task-workflow.sh","scripts/lib/project-init-lib.sh","assets/templates/helpers/ensure-task-workflow.sh","tests/cli/cross-review.test.ts","tests/harness-circuit-breakers.test.ts","tests/create-project-dirs.runtime.test.ts"]}]}
```

## Acceptance Policy

```json
{"protocol":1,"reviewer":"Claude","user_waiver":"allowed"}
```

## Allowed Paths

```yaml
allowed_paths:
  - plans/plan-20260820-1436-cross-review-single-pass.md
  - tasks/todos.md
  - tasks/contracts/20260820-1436-cross-review-single-pass.contract.md
  - tasks/reviews/20260820-1436-cross-review-single-pass.review.md
  - tasks/notes/20260820-1436-cross-review-single-pass.notes.md
  - tasks/notes/20260820-1436-cross-review-single-pass.pre-fix.log
  - src/core/review/cross-review.ts
  - src/effects/review/cross-review-runner.ts
  - src/cli/commands/cross-review.ts
  - src/cli/hook/circuit-breaker.ts
  - src/core/adoption/standard-plan.ts
  - .ai/harness/policy.json
  - scripts/ensure-task-workflow.sh
  - scripts/lib/project-init-lib.sh
  - assets/templates/helpers/ensure-task-workflow.sh
  - tests/cli/cross-review.test.ts
  - tests/harness-circuit-breakers.test.ts
  - tests/create-project-dirs.runtime.test.ts
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
    - src/core/review/cross-review.ts
    - src/effects/review/cross-review-runner.ts
    - src/cli/commands/cross-review.ts
    - tests/cli/cross-review.test.ts
  artifacts_exist:
    - .ai/harness/checks/latest.json
    - tasks/notes/20260820-1436-cross-review-single-pass.notes.md
  tests_pass:
    - path: tests/cli/cross-review.test.ts
    - path: tests/harness-circuit-breakers.test.ts
    - path: tests/create-project-dirs.runtime.test.ts
  commands_succeed:
    - bun run check:type
    - bash scripts/check-task-sync.sh
    - bash scripts/check-task-workflow.sh --strict
    - bash scripts/check-architecture-sync.sh
```

## Acceptance Notes (Human Review)

- Functional behavior: first direct review enters provider execution; the second under the same active contract stops before spawn even if the review subject changed.
- Edge cases: no active work-package retains advisory standalone review behavior; provider-internal retries remain capped at two; P1 under Markdown emphasis remains blocking.
- Regression risks: Circuit state is operational and contract-path keyed; stale state for an archived contract cannot block a different active contract.

## Rollback Point

- Commit / checkpoint: pre-change main `92170e6d`.
- Revert strategy: revert the semantic-review circuit kind, runner admission callback, and parser/test changes together.
