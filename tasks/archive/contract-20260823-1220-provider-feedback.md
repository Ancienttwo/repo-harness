> **Archived**: 2026-08-23 12:20
> **Related Plan**: plans/archive/plan-20260823-0626-provider-feedback.md
> **Outcome**: Completed
> **Lifecycle**: contract
> **Parent Run ID**: run-20260823-1220

# Task Contract: provider-feedback

> **Status**: Fulfilled
> **Plan**: plans/plan-20260823-0626-provider-feedback.md
> **Task Profile**: code-change
> <!-- legal values: code-change | docs-only | ledger-closeout | migration | eval-only | delegated-run | bugfix (omit for legacy passthrough); see docs/reference-configs/sprint-contracts.md -->
> **Owner**: ancienttwo
> **Capability ID**: root
> **Last Updated**: 2026-08-23 06:27
> **Review File**: `tasks/reviews/20260823-0626-provider-feedback.review.md`
> **Notes File**: `tasks/notes/20260823-0626-provider-feedback.notes.md`
> **Exemplar**: `docs/reference-configs/contract-brief-example.md`

## Why

WP0-WP2 provide publication identity, lifecycle, reconcile, readiness, and safe acquisition, but provider feedback still cannot be persisted or mapped back to an exact publication claim. Without this slice, failed checks and review feedback cannot enter a durable repair loop, and repeated no-progress repairs cannot hand attention back to the user without inventing session liveness authority.

## Goal

Implement PRD v3 Module 6: manual GitHub feedback intake into immutable reconstructible events plus separate delivery receipts; a derived repair offer that reuses the existing reopen/takeover lifecycle; and a separate completed-reaction ledger whose pure trailing-two same-token rule yields `no_progress` and user attention. Provider, pointer, revision, path, and pagination uncertainty must fail closed before feedback writes, while intake/observation/projection leave lease bytes unchanged.

## Scope

- In scope: exact FeedbackEventV1/delivery/reaction/repair-offer contracts; evidence-only RepairDispatchProofV1 transaction; canonical digests; common-dir store; fakeable complete GitHub observation; manual `fleet feedback` intake/offers/show/ack/repair surfaces; reuse of existing reopen/takeover and existing ship-journal completion verifier; no-progress extraction and tests.
- Out of scope: Task Inbox WP3-A, WP4 board, MCP/hooks, daemon/webhook/SSE/polling, PTY/resume/wake, handoff writes, automatic repair dispatch, normal acquire changes, lease schema/state changes, merge automation, compatibility parsers, or any `COORDINATION_PROTOCOL`/task-digest change.
- Taste constraints: provider object IDs are mandatory; comment bodies are fetched on demand and always untrusted; feedback/delivery/reaction are evidence, never task/lease/readiness/merge authority; no synthesized provider identity or bucket/count fallback. The no-progress `reaction_token` domain is exactly publication/head, failing check IDs plus conclusions, unresolved thread IDs, and mergeability; changes-requested review IDs affect `feedback_revision` but not the breaker token.

## Stop Conditions

- Stop and hand back to the parent if the change would require editing a path outside Allowed Paths.
- Stop if an Exit Criteria command cannot be run in this environment.
- Stop if Goal, Scope, or Exit Criteria are internally contradictory.

## Falsifier

Direction is wrong if GitHub cannot provide stable check/review/thread object IDs and a complete head-fenced snapshot through the existing `gh` boundary, or if repair dispatch cannot call the existing lifecycle without duplicating lease transitions. Cheapest proof: fake-`gh` tests must show exact object IDs, reject `hasNextPage=true`/missing IDs/head drift with zero writes, and prove takeover still ends at `reserving` while reopen alone may return `bound`.

## Root Cause Evidence

Required when Task Profile is `bugfix`; leave as-is otherwise.

- root_cause: one sentence naming file:line/condition (testable, not "a state issue").
- repro: the command or UI path that reproduces the symptom.
- regression_guard: path to a test that fails on the unfixed code and passes after the fix (must also appear under exit_criteria.tests_pass).
- pre_fix_failure_artifact: path to a captured run of regression_guard on the UNFIXED code. Capture with `bun test <regression_guard> > <artifact> 2>&1; echo "PRE_FIX_EXIT=$?" >> <artifact>` (no pipes — pipes swallow the exit status). The gate requires a non-zero `PRE_FIX_EXIT=` line plus the regression_guard path string in the artifact (see the Root Cause Evidence Gate section in docs/reference-configs/sprint-contracts.md).

## Workflow Inventory

- Source plan: `plans/plan-20260823-0626-provider-feedback.md`
- Deferred-goal ledger: `tasks/todos.md`
- Review file: `tasks/reviews/20260823-0626-provider-feedback.review.md`
- Notes file: `tasks/notes/20260823-0626-provider-feedback.notes.md`
- Checks file: `.ai/harness/checks/latest.json`
- Run snapshots: `.ai/harness/runs/`
- Scope gate: edit only paths listed under `allowed_paths`; update this contract before widening scope.
- Completion gate: run `verify-sprint --prepare-acceptance`, record one typed AcceptanceReceipt under the frozen policy below, then run `verify-sprint`; review Markdown is projection only.

## Change Assessment

```json
{"protocol":1,"oracles":[{"id":"provider-feedback-deterministic-contract","kind":"deterministic_test","paths":["src/core/state/no-progress.ts","src/core/publication/feedback.ts","src/effects/publication/feedback-store.ts","src/effects/publication/feedback.ts","src/effects/publication/publication-lifecycle.ts","src/core/state/attempt-ledger.ts","src/cli/commands/fleet.ts","tests/unit/no-progress.test.ts","tests/unit/publication-feedback-v1.test.ts","tests/unit/publication-feedback-store.test.ts","tests/unit/publication-feedback-effect.test.ts","tests/unit/publication-lifecycle.test.ts","tests/cli/fleet-feedback.test.ts","tests/publication-feedback-concurrency.test.ts","tests/continuation-attempt.test.ts","tests/coordination-lease-store.test.ts"]},{"id":"provider-feedback-cli-readback","kind":"runtime_readback","paths":["src/effects/publication/feedback.ts","src/cli/commands/fleet.ts","tests/cli/fleet-feedback.test.ts"]}]}
```

## Acceptance Policy

```json
{"protocol":1,"reviewer":"Codex","user_waiver":"allowed"}
```

## Allowed Paths

```yaml
allowed_paths:
  - plans/
  - tasks/todos.md
  - tasks/current.md
  - tasks/contracts/20260823-0626-provider-feedback.contract.md
  - tasks/reviews/20260823-0626-provider-feedback.review.md
  - tasks/notes/20260823-0626-provider-feedback.notes.md
  - docs/architecture/.projection-manifest.json
  - src/core/state/no-progress.ts
  - src/core/state/attempt-ledger.ts
  - src/core/publication/feedback.ts
  - src/effects/publication/feedback-store.ts
  - src/effects/publication/feedback.ts
  - src/effects/publication/publication-lifecycle.ts
  - src/cli/commands/fleet.ts
  - tests/unit/no-progress.test.ts
  - tests/unit/publication-feedback-v1.test.ts
  - tests/unit/publication-feedback-store.test.ts
  - tests/unit/publication-feedback-effect.test.ts
  - tests/unit/publication-lifecycle.test.ts
  - tests/cli/fleet-feedback.test.ts
  - tests/publication-feedback-concurrency.test.ts
  - tests/continuation-attempt.test.ts
  - tests/coordination-lease-store.test.ts
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
    - src/core/state/no-progress.ts
    - src/core/publication/feedback.ts
    - src/effects/publication/feedback-store.ts
    - src/effects/publication/feedback.ts
  artifacts_exist:
    - .ai/harness/checks/latest.json
    - tasks/notes/20260823-0626-provider-feedback.notes.md
  tests_pass:
    - path: tests/unit/no-progress.test.ts
    - path: tests/unit/publication-feedback-v1.test.ts
    - path: tests/unit/publication-feedback-store.test.ts
    - path: tests/unit/publication-feedback-effect.test.ts
    - path: tests/unit/publication-lifecycle.test.ts
    - path: tests/cli/fleet-feedback.test.ts
    - path: tests/publication-feedback-concurrency.test.ts
    - path: tests/continuation-attempt.test.ts
    - path: tests/coordination-lease-store.test.ts
  commands_succeed:
    - bun run check:type
    - bun test --timeout 60000
    - bash scripts/check-deploy-sql-order.sh
    - bash scripts/check-architecture-sync.sh
    - bash scripts/check-task-sync.sh
    - repo-harness run check-task-workflow --strict
    - bun scripts/inspect-project-state.ts --repo . --format text
    - bun src/cli/index.ts init --repo . --dry-run
```

## Acceptance Notes (Human Review)

- Functional behavior: manual intake persists exact provider facts once; delivery is separate; offers are derived; repair wrappers reuse existing lifecycle; only completed repairs record reactions; two trailing same-token completions halt auto offering.
- Edge cases: duplicate/conflicting provider event, incomplete pagination, unknown enum/missing object ID, torn provider/local read, pointer/claim/generation/revision drift, symlink/non-regular/malformed records, partial event/delivery failure, token reset, and zero lease/reaction writes from observers.
- Regression risks: accidentally broadening continuation AttemptReceipt semantics, copying lifecycle transitions, synthesizing provider IDs, persisting untrusted comment bodies, treating notification as authority, or letting takeover write `bound`.

## Rollback Point

- Commit / checkpoint: pre-WP3 `1978de69`.
- Revert strategy: revert the single WP3 provider-feedback publication unit; WP0-WP2 and WP3-A remain intact.
