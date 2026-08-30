> **Archived**: 2026-08-30 13:19
> **Related Plan**: plans/archive/plan-20260830-1031-c6-collaborative-work-exchange-context-packet.md
> **Outcome**: Completed
> **Lifecycle**: contract
> **Parent Run ID**: run-20260830-1319

# Task Contract: c6-collaborative-work-exchange-context-packet

> **Status**: Fulfilled
> **Plan**: plans/plan-20260830-1031-c6-collaborative-work-exchange-context-packet.md
> **Task Profile**: code-change
> <!-- legal values: code-change | docs-only | ledger-closeout | migration | eval-only | delegated-run | bugfix (omit for legacy passthrough); see docs/reference-configs/sprint-contracts.md -->
> **Owner**: ancienttwo
> **Capability ID**: root
> **Last Updated**: 2026-08-30 10:31
> **Review File**: `tasks/reviews/20260830-1031-c6-collaborative-work-exchange-context-packet.review.md`
> **Notes File**: `tasks/notes/20260830-1031-c6-collaborative-work-exchange-context-packet.notes.md`
> **Exemplar**: `docs/reference-configs/contract-brief-example.md`

## Why

C1-C5 shipped the collaboration substrate as five stores with declared but unfilled seams: the
context-packet builder refuses to synthesize `snapshot_consistency` or `handoff_facts` and waits for
a store reader to supply both. Without C6 there is no reader, so no packet can be built and nothing
in the substrate reaches a delegated run. Shipping it wrong is worse than not shipping it: if the
binding is recorded but not enforced before dispatch, a run can be handed collaboration context that
no record accounts for, and if `execution_context` is projected without C5's proof, a worker-supplied
claim id and lease generation become readable as if the Host had verified them.

## Goal

One read-only collector producing `CollaborativeWorkExchangeSnapshotV1` over the real stores, one
delivery path composing a `CollaborationContextPacketV1` into a delegated run's goal, and one
`CollaborationRunContextBindingV1` that is checked before dispatch and fails closed when missing or
stale.

## Scope

- In scope:
  - `CollaborativeWorkExchangeSnapshotV1` protocol with `execution_offers`, `active_participants`,
    `threads`, `relevant_signals`, `open_handoffs`, `contribution_opportunities`,
    `snapshot_consistency` and `snapshot_sha256`.
  - `ExistingEngineerOfferProjection` carrying the existing `EngineerOfferV1` and its
    `offer_revision` verbatim, with no reinterpretation of readiness.
  - `CollaborationRunContextBindingV1` protocol plus its store and the pre-dispatch fence.
  - The exchange collector: double-read over every mutable source, honest `snapshot_consistency`
    derivation, fail-loud on an unreadable source, zero filesystem writes.
  - Context delivery: real `handoff_facts` joined from the C3 handoff and adoption stores, canonical
    `[CoordinationContextUntrusted]` rendering, goal composition, binding persistence.
  - Routing every `execution_context` exposure through `resolveBoundTaskSuccession()`.
- Out of scope:
  - CLI/MCP surface (C7), Operator UI (C8), any Lease/Claim/Publication write.
  - Any change to `DelegationEnvelopeV1` or `DelegatedRunIntentV1` protocol numbers; the binding is
    additive and `intent.context_packet_sha256` keeps its frozen ExecutionPacket semantics.
- Taste constraints: no compatibility fallback. A source that cannot be read fails the collection; a
  binding that does not match refuses the dispatch; an `execution_context` that does not verify is
  excluded rather than flagged.

## Stop Conditions

- Stop and hand back to the parent if the change would require editing a path outside Allowed Paths.
- Stop if an Exit Criteria command cannot be run in this environment.
- Stop if Goal, Scope, or Exit Criteria are internally contradictory.

## Falsifier

The direction is wrong if the same store contents rebuild a snapshot or a packet with different
bytes, because the whole read model rests on the claim that provenance digests identify content
rather than a moment. Cheapest proof point: build the snapshot twice from one fixture store and
compare `snapshot_sha256`, then rebuild the packet and compare `packet_sha256`.

## Root Cause Evidence

Required when Task Profile is `bugfix`; leave as-is otherwise.

- root_cause: one sentence naming file:line/condition (testable, not "a state issue").
- repro: the command or UI path that reproduces the symptom.
- regression_guard: path to a test that fails on the unfixed code and passes after the fix (must also appear under exit_criteria.tests_pass).
- pre_fix_failure_artifact: path to a captured run of regression_guard on the UNFIXED code. Capture with `bun test <regression_guard> > <artifact> 2>&1; echo "PRE_FIX_EXIT=$?" >> <artifact>` (no pipes — pipes swallow the exit status). The gate requires a non-zero `PRE_FIX_EXIT=` line plus the regression_guard path string in the artifact (see the Root Cause Evidence Gate section in docs/reference-configs/sprint-contracts.md).

## Workflow Inventory

- Source plan: `plans/plan-20260830-1031-c6-collaborative-work-exchange-context-packet.md`
- Deferred-goal ledger: `tasks/todos.md`
- Review file: `tasks/reviews/20260830-1031-c6-collaborative-work-exchange-context-packet.review.md`
- Notes file: `tasks/notes/20260830-1031-c6-collaborative-work-exchange-context-packet.notes.md`
- Checks file: `.ai/harness/checks/latest.json`
- Run snapshots: `.ai/harness/runs/`
- Scope gate: edit only paths listed under `allowed_paths`; update this contract before widening scope.
- Completion gate: run `verify-sprint --prepare-acceptance`, record one typed AcceptanceReceipt under the frozen policy below, then run `verify-sprint`; review Markdown is projection only.

## Change Assessment

```json
{"protocol":1,"oracles":[{"id":"collaboration-work-exchange-collector","kind":"deterministic_test","paths":["*"]},{"id":"collaboration-context-delivery-binding","kind":"deterministic_test","paths":["*"]},{"id":"collaboration-store-regression","kind":"deterministic_test","paths":["*"]},{"id":"engineer-scheduling-regression","kind":"deterministic_test","paths":["*"]},{"id":"architecture-projection-model-pins","kind":"deterministic_test","paths":["*"]},{"id":"repo-full-suite","kind":"deterministic_test","paths":["*"]},{"id":"repo-typecheck","kind":"deterministic_test","paths":["*"]}]}
```

## Acceptance Policy

```json
{"protocol":2,"reviewer":"Codex","source":"codex-review","user_waiver":"allowed"}
```

## Allowed Paths

```yaml
allowed_paths:
  - plans/plan-20260830-1031-c6-collaborative-work-exchange-context-packet.md
  - plans/sprints/20260828-2321-collaborative-work-exchange-agent-succession.sprint.md
  - tasks/current.md
  - tasks/todos.md
  - tasks/lessons.md
  - tasks/contracts/20260830-1031-c6-collaborative-work-exchange-context-packet.contract.md
  - tasks/reviews/20260830-1031-c6-collaborative-work-exchange-context-packet.review.md
  - tasks/notes/20260830-1031-c6-collaborative-work-exchange-context-packet.notes.md
  - tasks/workstreams/runtime-harness/collaboration/
  - src/core/collaboration/
  - src/effects/collaboration/
  - tests/effects/
  - tests/helpers/
  # The architecture surface. This row changes entrypoints and adds a flow, so the
  # model and its projection move with the code in one acceptance round; the C5
  # succession entrypoint declaration is resolved here rather than paying for a
  # second approval event.
  - .archcontext/model/
  - docs/architecture/
  - tests/architecture-projection-e2e.test.ts
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
    - src/core/collaboration/work-exchange.ts
    - src/core/collaboration/run-binding.ts
    - src/effects/collaboration/work-exchange.ts
    - src/effects/collaboration/context-delivery.ts
  artifacts_exist:
    - .ai/harness/checks/latest.json
    - tasks/notes/20260830-1031-c6-collaborative-work-exchange-context-packet.notes.md
  tests_pass:
    - path: tests/effects/collaboration-work-exchange.test.ts
    - path: tests/effects/collaboration-context-delivery.test.ts
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
