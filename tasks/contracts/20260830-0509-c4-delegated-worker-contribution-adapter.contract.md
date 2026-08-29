# Task Contract: c4-delegated-worker-contribution-adapter

> **Status**: Active
> **Plan**: plans/plan-20260830-0509-c4-delegated-worker-contribution-adapter.md
> **Task Profile**: code-change
> <!-- legal values: code-change | docs-only | ledger-closeout | migration | eval-only | delegated-run | bugfix (omit for legacy passthrough); see docs/reference-configs/sprint-contracts.md -->
> **Owner**: ancienttwo
> **Capability ID**: root
> **Last Updated**: 2026-08-30 05:09
> **Review File**: `tasks/reviews/20260830-0509-c4-delegated-worker-contribution-adapter.review.md`
> **Notes File**: `tasks/notes/20260830-0509-c4-delegated-worker-contribution-adapter.notes.md`
> **Exemplar**: `docs/reference-configs/contract-brief-example.md`

## Why

C0 D7 recorded a negative proof: `admitReadOnlyDelegation()` does not consume
`delegation_policy`, so `max_parallel_readers` is today a declared profile value
with no admission-time enforcement. This row is what makes it real. If it ships
wrong the repo either keeps advertising a limit it does not apply, or a bridge
gets smuggled into the existing admission path and D7's proof becomes false.

The contribution collector is the only way a delegated Worker's output becomes
visible collaboration state. If its transaction is not convergent, a retried
collection publishes duplicate signals, two commits, or a synthesized empty
contribution that reads as a successful one.

## Goal

Land `CollaborationDelegationAdmissionV1` as a pre-step bridge that turns
`allowed_roles` and `max_parallel_readers` into runtime constraints, and
`CollaborationContributionDraftV1` / `CollaborationContributionCommitV1` with a
Host collector whose only draft source is the exact persisted stdout of that run.
Prove both against real runtime behaviour, not model-layer assertions.

## Scope

- In scope:
  - `src/core/collaboration/contribution.ts`, `src/core/collaboration/admission.ts`
  - `src/effects/collaboration/admission-bridge.ts`, `provider-output-adapter.ts`,
    `contribution-store.ts`, `contribution-collector.ts`
  - `src/effects/collaboration/actor.ts`: Host-derived `delegated_worker` actor
  - `src/effects/collaboration/signal-store.ts`, `handoff-store.ts`: one
    authorization union so a delegated contribution publishes under its own actor
  - `src/effects/collaboration/record-store.ts`: resolve the carried D9 lock
    deviation and correct the comment that claims compliance
  - the real multi-process admission canary and the fault-injection matrix
  - the architecture surface this row moves: `.archcontext/model/`,
    `docs/architecture/`, the controlled `AGENTS.md` / `CLAUDE.md` blocks, and the
    AXR7 / e2e count pins in `tests/architecture-projection-e2e.test.ts`
  - `docs/researches/20260829-c0-collaboration-two-plane-authority-freeze.md`
    ledger entry for the D9 deviation
- Out of scope:
  - CollaborationRunContextBinding and context-packet wiring (C6)
  - CLI and MCP surfaces (C7); Operator collaboration view (C8)
  - succession and TaskFreeze integration (C5)
  - any `DelegationEnvelopeV1` protocol bump or `max_turns` relaxation
  - editing `admitReadOnlyDelegation()` or its input shape
- Taste constraints: no second `*_PROTOCOL` for the collaboration plane; reuse
  `record-store.ts` and `common.ts` rather than copying their mechanics.

## Stop Conditions

- Stop and hand back to the parent if the change would require editing a path outside Allowed Paths.
- Stop if an Exit Criteria command cannot be run in this environment.
- Stop if Goal, Scope, or Exit Criteria are internally contradictory.

## Falsifier

The direction is wrong if the bridge cannot reject a real fourth concurrent
request without also changing `admitReadOnlyDelegation()`. Cheapest proof point:
run four independent OS processes against one parent claim and one round index
with `max_parallel_readers = 3` and assert exactly three admissions, one
`max_parallel_readers_exceeded` rejection, and byte-identical
`src/effects/engineers/delegated-run-store.ts`.

## Root Cause Evidence

Required when Task Profile is `bugfix`; leave as-is otherwise.

- root_cause: one sentence naming file:line/condition (testable, not "a state issue").
- repro: the command or UI path that reproduces the symptom.
- regression_guard: path to a test that fails on the unfixed code and passes after the fix (must also appear under exit_criteria.tests_pass).
- pre_fix_failure_artifact: path to a captured run of regression_guard on the UNFIXED code. Capture with `bun test <regression_guard> > <artifact> 2>&1; echo "PRE_FIX_EXIT=$?" >> <artifact>` (no pipes — pipes swallow the exit status). The gate requires a non-zero `PRE_FIX_EXIT=` line plus the regression_guard path string in the artifact (see the Root Cause Evidence Gate section in docs/reference-configs/sprint-contracts.md).

## Workflow Inventory

- Source plan: `plans/plan-20260830-0509-c4-delegated-worker-contribution-adapter.md`
- Deferred-goal ledger: `tasks/todos.md`
- Review file: `tasks/reviews/20260830-0509-c4-delegated-worker-contribution-adapter.review.md`
- Notes file: `tasks/notes/20260830-0509-c4-delegated-worker-contribution-adapter.notes.md`
- Checks file: `.ai/harness/checks/latest.json`
- Run snapshots: `.ai/harness/runs/`
- Scope gate: edit only paths listed under `allowed_paths`; update this contract before widening scope.
- Completion gate: run `verify-sprint --prepare-acceptance`, record one typed AcceptanceReceipt under the frozen policy below, then run `verify-sprint`; review Markdown is projection only.

## Change Assessment

```json
{"protocol":1,"oracles":[{"id":"collaboration-contribution-schema","kind":"deterministic_test","paths":["*"]},{"id":"collaboration-admission-model","kind":"deterministic_test","paths":["*"]},{"id":"collaboration-admission-bridge-canary","kind":"deterministic_test","paths":["*"]},{"id":"collaboration-contribution-collector","kind":"deterministic_test","paths":["*"]},{"id":"collaboration-store-regression","kind":"deterministic_test","paths":["*"]},{"id":"architecture-projection-model-pins","kind":"deterministic_test","paths":["*"]},{"id":"repo-full-suite","kind":"deterministic_test","paths":["*"]},{"id":"repo-typecheck","kind":"deterministic_test","paths":["*"]}]}
```

## Acceptance Policy

```json
{"protocol":2,"reviewer":"Codex","source":"codex-review","user_waiver":"allowed"}
```

## Allowed Paths

```yaml
allowed_paths:
  - plans/plan-20260830-0509-c4-delegated-worker-contribution-adapter.md
  - plans/sprints/20260828-2321-collaborative-work-exchange-agent-succession.sprint.md
  - tasks/current.md
  - tasks/todos.md
  - tasks/contracts/20260830-0509-c4-delegated-worker-contribution-adapter.contract.md
  - tasks/reviews/20260830-0509-c4-delegated-worker-contribution-adapter.review.md
  - tasks/notes/20260830-0509-c4-delegated-worker-contribution-adapter.notes.md
  - tasks/workstreams/runtime-harness/collaboration/
  - src/core/collaboration/contribution.ts
  - src/core/collaboration/admission.ts
  - src/effects/collaboration/admission-bridge.ts
  - src/effects/collaboration/provider-output-adapter.ts
  - src/effects/collaboration/contribution-store.ts
  - src/effects/collaboration/contribution-collector.ts
  - src/effects/collaboration/actor.ts
  - src/effects/collaboration/signal-store.ts
  - src/effects/collaboration/handoff-store.ts
  - src/effects/collaboration/adoption-store.ts
  - src/effects/collaboration/record-store.ts
  # Declared up front. The PRD freezes "WorkerResultV1 is constructed exactly
  # once and references the commit", and the baseline test forbids a
  # delivery-plane module importing the collaboration plane, so the commit
  # reference can only arrive as an explicit input. `CollectDelegatedRunInput`
  # gains one required `contribution_refs` field and the collector gains the
  # exactly-once conflict check that makes the guarantee machine-enforced. No
  # protocol bump; `WorkerResultV1.evidence_refs` already accepts these bytes.
  - src/effects/engineers/delegated-run-store.ts
  - src/cli/commands/delegation.ts
  - tests/unit/me2a-me3b-readonly-delegation.test.ts
  - tests/unit/collaboration-contribution.test.ts
  - tests/unit/collaboration-admission.test.ts
  - tests/effects/collaboration-admission-bridge.test.ts
  - tests/effects/collaboration-contribution-collector.test.ts
  - tests/helpers/collaboration-store-fixture.ts
  - tests/helpers/collaboration-delegation-fixture.ts
  # One real admission request per process: the canary spawns this rather than
  # making three in-process calls, which cannot contend for an on-disk lock.
  - tests/helpers/collaboration-admission-runner.ts
  - tests/effects/collaboration-signal-store.test.ts
  - tests/effects/collaboration-handoff-store.test.ts
  - tests/effects/collaboration-adoption-store.test.ts
  - tests/unit/collaboration-authority-baseline.test.ts
  # Declared up front, not after a refusal (C2 and C3 both had to self-amend
  # here). C4 adds an admission entrypoint and a contribution-commit flow, so the
  # capability node moves and the projection re-renders. Everything under
  # docs/architecture/ and both controlled root-contract blocks are machine
  # output: runArchitectureProjection and context-contract-sync write them.
  - .archcontext/model/
  - docs/architecture/
  - AGENTS.md
  - CLAUDE.md
  - tasks/lessons.md
  # AXR7 and the e2e suite pin the archcontext model inventory by count, so a new
  # entrypoint or flow is a red test until the pin moves with it.
  - tests/architecture-projection-e2e.test.ts
  - tests/unit/architecture-*.test.ts
  # The D9 lock-deviation ledger entry the sprint carried into this row.
  - docs/researches/20260829-c0-collaboration-two-plane-authority-freeze.md
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
    - src/core/collaboration/contribution.ts
    - src/core/collaboration/admission.ts
    - src/effects/collaboration/admission-bridge.ts
    - src/effects/collaboration/provider-output-adapter.ts
    - src/effects/collaboration/contribution-store.ts
    - src/effects/collaboration/contribution-collector.ts
  artifacts_exist:
    - .ai/harness/checks/latest.json
    - tasks/notes/20260830-0509-c4-delegated-worker-contribution-adapter.notes.md
  tests_pass:
    - path: tests/unit/collaboration-contribution.test.ts
    - path: tests/unit/collaboration-admission.test.ts
    - path: tests/effects/collaboration-admission-bridge.test.ts
    - path: tests/effects/collaboration-contribution-collector.test.ts
    - path: tests/unit/collaboration-authority-baseline.test.ts
  commands_succeed:
    - bun run check:type
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

- Commit / checkpoint:
- Revert strategy:
