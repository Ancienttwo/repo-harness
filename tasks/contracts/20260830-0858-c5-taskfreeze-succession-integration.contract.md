# Task Contract: c5-taskfreeze-succession-integration

> **Status**: Active
> **Plan**: plans/plan-20260830-0858-c5-taskfreeze-succession-integration.md
> **Task Profile**: code-change
> <!-- legal values: code-change | docs-only | ledger-closeout | migration | eval-only | delegated-run | bugfix (omit for legacy passthrough); see docs/reference-configs/sprint-contracts.md -->
> **Owner**: ancienttwo
> **Capability ID**: root
> **Last Updated**: 2026-08-30 08:58
> **Review File**: `tasks/reviews/20260830-0858-c5-taskfreeze-succession-integration.review.md`
> **Notes File**: `tasks/notes/20260830-0858-c5-taskfreeze-succession-integration.notes.md`
> **Exemplar**: `docs/reference-configs/contract-brief-example.md`

## Why

`HandoffExecutionContextV1.bound_task` names a `TaskFreezeReceiptV1` by digest and
a Claim by id, and nothing resolves either. `buildWorkStateHandoff()` validates
the branch's shape and stops, so a syntactically valid record can point at a
freeze receipt that does not exist or describes different bytes. If that ships,
the successor reconstructs a state nobody ever froze, and the frozen sentence --
handoff passes knowledge, TaskFreeze passes exact state, the Lease lifecycle
passes the right to execute -- is true in prose and false in code.

The second failure mode is the inverse: succession machinery that quietly grants
execution. A row that wires a successor to a handoff without going through
release / takeover / acquire would put successor election in the collaboration
plane, which is exactly the authority D1 froze out of it.

## Goal

Land `src/effects/collaboration/succession.ts` as the single join between the two
planes: derive a handoff's `bound_task` execution context from the persisted
freeze receipt so an unbound context cannot be published, prove the same binding
on read so a record from any other route is refused, refuse succession for a
dirty bound executor that has not frozen, and refuse a successor that has not
been granted a live Claim by the existing lifecycle. No new protocol, no new
store, no successor field, no second destination resolver.

## Scope

- In scope:
  - `src/effects/collaboration/succession.ts` (new; the only source file)
  - `tests/helpers/collaboration-succession-fixture.ts` (new; three-actor
    collaboration repository plus a real bound task)
  - `tests/effects/collaboration-succession.test.ts` (new)
  - `tasks/workstreams/runtime-harness/collaboration/collaboration-substrate-program.md`
  - `tasks/lessons.md`: the C4 sprint-backlog hand-edit correction
  - the architecture surface this row moves: `.archcontext/model/`,
    `docs/architecture/`, the controlled `AGENTS.md` / `CLAUDE.md` blocks, and the
    AXR7 / e2e count pins in `tests/architecture-projection-e2e.test.ts`
- Out of scope:
  - `CollaborationRunContextBindingV1` and the context-packet store reader (C6)
  - CLI and MCP surfaces (C7); the Operator collaboration view (C8)
  - any edit to `src/core/collaboration/common.ts` (C1 owns it)
  - any edit to the delivery plane's stores, or any new Task/Lease/Publication/
    Acceptance authority
  - unblocking `delegated_worker` handoff adoption (decided in notes; stays for C6)
- Taste constraints: match the existing collaboration modules -- module docblock
  states the invariant and the failure it prevents, comments explain why at the
  boundary that owns the decision, no restating of the operation.

## Stop Conditions

- Stop and hand back to the parent if the change would require editing a path outside Allowed Paths.
- Stop if an Exit Criteria command cannot be run in this environment.
- Stop if Goal, Scope, or Exit Criteria are internally contradictory.

## Falsifier

The direction is wrong if a bound-task handoff can be published whose
`task_freeze_receipt_sha256` names no persisted receipt, or whose `claim_id` /
`lease_generation` / `work_envelope_sha256` disagree with the receipt it names.
Cheapest proof point: construct such a record through
`publishBoundTaskSuccessionHandoff()` and through `buildWorkStateHandoff()` +
`resolveBoundTaskSuccession()`, and confirm both refuse.

It is also wrong if adopting a handoff, on its own, moves any byte under
`repo-harness/coordination/v1` or `repo-harness/engineers/v1`. Cheapest proof
point: `deliveryPlaneDigest()` before and after.

## Root Cause Evidence

Required when Task Profile is `bugfix`; leave as-is otherwise.

- root_cause: one sentence naming file:line/condition (testable, not "a state issue").
- repro: the command or UI path that reproduces the symptom.
- regression_guard: path to a test that fails on the unfixed code and passes after the fix (must also appear under exit_criteria.tests_pass).
- pre_fix_failure_artifact: path to a captured run of regression_guard on the UNFIXED code. Capture with `bun test <regression_guard> > <artifact> 2>&1; echo "PRE_FIX_EXIT=$?" >> <artifact>` (no pipes — pipes swallow the exit status). The gate requires a non-zero `PRE_FIX_EXIT=` line plus the regression_guard path string in the artifact (see the Root Cause Evidence Gate section in docs/reference-configs/sprint-contracts.md).

## Workflow Inventory

- Source plan: `plans/plan-20260830-0858-c5-taskfreeze-succession-integration.md`
- Deferred-goal ledger: `tasks/todos.md`
- Review file: `tasks/reviews/20260830-0858-c5-taskfreeze-succession-integration.review.md`
- Notes file: `tasks/notes/20260830-0858-c5-taskfreeze-succession-integration.notes.md`
- Checks file: `.ai/harness/checks/latest.json`
- Run snapshots: `.ai/harness/runs/`
- Scope gate: edit only paths listed under `allowed_paths`; update this contract before widening scope.
- Completion gate: run `verify-sprint --prepare-acceptance`, record one typed AcceptanceReceipt under the frozen policy below, then run `verify-sprint`; review Markdown is projection only.

## Change Assessment

```json
{"protocol":1,"oracles":[{"id":"collaboration-succession-integration","kind":"deterministic_test","paths":["*"]},{"id":"collaboration-store-regression","kind":"deterministic_test","paths":["*"]},{"id":"bound-task-freeze-regression","kind":"deterministic_test","paths":["*"]},{"id":"architecture-projection-model-pins","kind":"deterministic_test","paths":["*"]},{"id":"repo-full-suite","kind":"deterministic_test","paths":["*"]},{"id":"repo-typecheck","kind":"deterministic_test","paths":["*"]}]}
```

## Acceptance Policy

```json
{"protocol":2,"reviewer":"Codex","source":"codex-review","user_waiver":"allowed"}
```

## Allowed Paths

```yaml
allowed_paths:
  - plans/plan-20260830-0858-c5-taskfreeze-succession-integration.md
  - plans/sprints/20260828-2321-collaborative-work-exchange-agent-succession.sprint.md
  - tasks/current.md
  - tasks/todos.md
  - tasks/contracts/20260830-0858-c5-taskfreeze-succession-integration.contract.md
  - tasks/reviews/20260830-0858-c5-taskfreeze-succession-integration.review.md
  - tasks/notes/20260830-0858-c5-taskfreeze-succession-integration.notes.md
  - tasks/workstreams/runtime-harness/collaboration/
  - src/effects/collaboration/succession.ts
  - tests/effects/collaboration-succession.test.ts
  - tests/helpers/collaboration-succession-fixture.ts
  # The shared three-actor fixture C1-C4 use. The succession fixture composes it
  # rather than hand-copying it; if it needs one seam, it is opened here.
  - tests/helpers/collaboration-store-fixture.ts
  # Declared up front, not after a refusal. C5 adds a real capability surface, so
  # the node moves and the projection re-renders. Everything under
  # docs/architecture/ and both controlled root-contract blocks is machine output:
  # runArchitectureProjection and context-contract-sync write them.
  - .archcontext/model/
  - docs/architecture/
  - AGENTS.md
  - CLAUDE.md
  - tasks/lessons.md
  # AXR7 pins the archcontext model inventory by count, so a new entrypoint,
  # relation or flow is a red test until the pin moves with it. This is the
  # standing lesson from C3 and C4.
  - tests/architecture-projection-e2e.test.ts
  - tests/unit/architecture-*.test.ts
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
    - src/effects/collaboration/succession.ts
    - tests/helpers/collaboration-succession-fixture.ts
  artifacts_exist:
    - .ai/harness/checks/latest.json
    - tasks/notes/20260830-0858-c5-taskfreeze-succession-integration.notes.md
  tests_pass:
    - path: tests/effects/collaboration-succession.test.ts
    - path: tests/unit/me4a-bound-task-freeze-handoff.test.ts
    - path: tests/effects/collaboration-handoff-store.test.ts
    - path: tests/effects/collaboration-adoption-store.test.ts
    - path: tests/unit/collaboration-authority-baseline.test.ts
    - path: tests/architecture-projection-e2e.test.ts
  commands_succeed:
    - bun run check:type
    - repo-harness architecture-projection check --json
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
