> **Archived**: 2026-08-26 22:40
> **Related Plan**: plans/archive/plan-20260826-1558-archctx-v2-provider-acceptance.md
> **Outcome**: Completed
> **Lifecycle**: contract
> **Parent Run ID**: run-20260826-2240

# Task Contract: archctx-v2-provider-acceptance

> **Status**: Fulfilled
> **Plan**: plans/plan-20260826-1558-archctx-v2-provider-acceptance.md
> **Task Profile**: code-change
> <!-- legal values: code-change | docs-only | ledger-closeout | migration | eval-only | delegated-run | bugfix (omit for legacy passthrough); see docs/reference-configs/sprint-contracts.md -->
> **Owner**: ancienttwo
> **Capability ID**: root
> **Last Updated**: 2026-08-26 17:18
> **Review File**: `tasks/reviews/20260826-1558-archctx-v2-provider-acceptance.review.md`
> **Notes File**: `tasks/notes/20260826-1558-archctx-v2-provider-acceptance.notes.md`
> **Exemplar**: `docs/reference-configs/contract-brief-example.md`

## Why

ArchContext now commits projection-owned writes before it can know whether a concurrent non-owned mutation will invalidate its post-write observation. repo-harness currently accepts only projection-result/v1 and unconditionally rechecks the old snapshot, so it collapses the new durable `applied-reconcile-required` state into an ordinary failure and cannot consume the committed apply receipt's refresh signal through the normal path.

## Goal

Accept projection-result/v2 from package-local ArchContext 0.4.5, preserve fail-closed pre-write failures, expose typed evidence for committed-but-unreconciled post-write divergence, and prove a retry performs no second apply or Human acceptance while delivering the original refresh signal exactly once before later returning noop.

## Scope

- In scope: strict v2 wire/capability validation; apply identity validation; provider post-write reconciliation observation; orchestrator/CLI handling; focused tests; local-tarball acceptance; exact published 0.4.5 dependency, policy, generated-template and fixture pins; registry-backed package-local gate.
- Out of scope: publishing repo-harness; v1 compatibility; upstream selector implementation; suppressing concurrent mutation; changing refresh action semantics.
- Taste constraints: Keep the signed ArchContext result byte-semantically intact. Provider-local diagnostics must not enter the upstream receipt digest.

## Stop Conditions

- Stop and hand back to the parent if the change would require editing a path outside Allowed Paths.
- Stop if an Exit Criteria command cannot be run in this environment.
- Stop if Goal, Scope, or Exit Criteria are internally contradictory.

## Falsifier

If the local v2 package cannot correlate a fresh-snapshot retry to the original durable apply identity, or if its result lacks enough identity to distinguish committed reconciliation from pre-write failure, stop and return the missing contract fields to ArchContext. Cheapest proof: focused provider tests plus one real local-tarball apply/reconcile cycle.

## Root Cause Evidence

Required when Task Profile is `bugfix`; leave as-is otherwise.

- root_cause: one sentence naming file:line/condition (testable, not "a state issue").
- repro: the command or UI path that reproduces the symptom.
- regression_guard: path to a test that fails on the unfixed code and passes after the fix (must also appear under exit_criteria.tests_pass).
- pre_fix_failure_artifact: path to a captured run of regression_guard on the UNFIXED code. Capture with `bun test <regression_guard> > <artifact> 2>&1; echo "PRE_FIX_EXIT=$?" >> <artifact>` (no pipes — pipes swallow the exit status). The gate requires a non-zero `PRE_FIX_EXIT=` line plus the regression_guard path string in the artifact (see the Root Cause Evidence Gate section in docs/reference-configs/sprint-contracts.md).

## Workflow Inventory

- Source plan: `plans/plan-20260826-1558-archctx-v2-provider-acceptance.md`
- Deferred-goal ledger: `tasks/todos.md`
- Review file: `tasks/reviews/20260826-1558-archctx-v2-provider-acceptance.review.md`
- Notes file: `tasks/notes/20260826-1558-archctx-v2-provider-acceptance.notes.md`
- Checks file: `.ai/harness/checks/latest.json`
- Run snapshots: `.ai/harness/runs/`
- Scope gate: edit only paths listed under `allowed_paths`; update this contract before widening scope.
- Completion gate: run `verify-sprint --prepare-acceptance`, record one typed AcceptanceReceipt under the frozen policy below, then run `verify-sprint`; review Markdown is projection only.

## Change Assessment

```json
{"protocol":1,"oracles":[{"id":"projection-v2-state-machine","kind":"deterministic_test","paths":["*"],"command":"bun test tests/architecture-projection-provider.test.ts tests/architecture-projection-orchestration.test.ts --timeout 60000"},{"id":"published-package-provider-readback","kind":"runtime_readback","paths":["*"],"command":"bash scripts/check-architecture-sync.sh"}]}
```

## Acceptance Policy

```json
{"protocol":2,"reviewer":"Codex","source":"codex-plugin","user_waiver":"allowed"}
```

## Allowed Paths

```yaml
allowed_paths:
  - docs/spec.md
  - .ai/harness/policy.json
  - package.json
  - bun.lock
  - plans/
  - tasks/todos.md
  - tasks/contracts/20260826-1558-archctx-v2-provider-acceptance.contract.md
  - tasks/reviews/20260826-1558-archctx-v2-provider-acceptance.review.md
  - tasks/notes/20260826-1558-archctx-v2-provider-acceptance.notes.md
  - src/core/architecture/projection.ts
  - src/effects/architecture/archctx-provider.ts
  - src/effects/architecture/projection-orchestrator.ts
  - src/effects/architecture/projection-jobs.ts
  - src/cli/commands/architecture-projection.ts
  - scripts/ensure-task-workflow.sh
  - scripts/lib/project-init-lib.sh
  - scripts/axr5-archctx-clean-room.ts
  - scripts/axr6-stop-host-cycle.ts
  - scripts/axr7-consumer-e2e.ts
  - assets/templates/helpers/ensure-task-workflow.sh
  - docs/architecture/.projection-manifest.json
  - docs/verification/axr5-archctx-clean-room-readback.json
  - tests/architecture-projection-e2e.test.ts
  - tests/architecture-projection-provider.test.ts
  - tests/architecture-projection-orchestration.test.ts
  - tests/architecture-projection-restamp-cli.test.ts
  - tests/architecture-restamp-classifier.test.ts
  - tests/architecture-restamp-publication.test.ts
  - tests/cli/global-runtime-init.test.ts
  - tests/state/operation-readiness.test.ts
  - tests/stop-handler.test.ts
  - tests/stop-handler-restamp-publication.test.ts
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
    - docs/spec.md
  artifacts_exist:
    - .ai/harness/checks/latest.json
    - tasks/notes/20260826-1558-archctx-v2-provider-acceptance.notes.md
  tests_pass:
    - path: tests/architecture-projection-provider.test.ts
    - path: tests/architecture-projection-orchestration.test.ts
  commands_succeed:
    - bun run check:type
    - bash scripts/check-architecture-sync.sh
    - bash scripts/check-task-sync.sh
    - bash scripts/check-task-workflow.sh --strict
# Optional exact-subject reuse is fail-closed and opt-in. List only deterministic
# criteria whose inputs are fully bound by the frozen subject/toolchain context.
# criterion_reuse:
#   tests_pass:
#     - path/to/deterministic.test.ts
#   commands_succeed:
#     - bun test --timeout 60000
```

## Acceptance Notes (Human Review)

- Functional behavior: v2 result states remain distinct across provider, durable job state, refresh delivery and CLI output.
- Edge cases: pre-write stale result has no apply identity; reconcile-required has an identity and zero signals; first retry returns the original signal; later retry is noop.
- Regression risks: admitting an uncorrelated post-check mismatch, mutating the signed upstream result, consuming signals before reconciliation, or incrementing retries into dead-letter for a committed apply.

## Rollback Point

- Commit / checkpoint: exact provider acceptance branch checkpoint.
- Revert strategy: revert the v2 contract/provider/orchestrator/test unit; repo-harness owns no new database migration.
