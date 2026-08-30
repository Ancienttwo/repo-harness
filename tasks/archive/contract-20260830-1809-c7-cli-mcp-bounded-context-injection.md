> **Archived**: 2026-08-30 18:09
> **Related Plan**: plans/archive/plan-20260830-1342-c7-cli-mcp-bounded-context-injection.md
> **Outcome**: Completed
> **Lifecycle**: contract
> **Parent Run ID**: run-20260830-1809

# Task Contract: c7-cli-mcp-bounded-context-injection

> **Status**: Fulfilled
> **Plan**: plans/plan-20260830-1342-c7-cli-mcp-bounded-context-injection.md
> **Task Profile**: code-change
> <!-- legal values: code-change | docs-only | ledger-closeout | migration | eval-only | delegated-run | bugfix (omit for legacy passthrough); see docs/reference-configs/sprint-contracts.md -->
> **Owner**: ancienttwo
> **Capability ID**: root
> **Last Updated**: 2026-08-30 13:42
> **Review File**: `tasks/reviews/20260830-1342-c7-cli-mcp-bounded-context-injection.review.md`
> **Notes File**: `tasks/notes/20260830-1342-c7-cli-mcp-bounded-context-injection.notes.md`
> **Exemplar**: `docs/reference-configs/contract-brief-example.md`

## Why

C6 shipped `assertCollaborationDispatchBinding()` with zero production callers, so the fence that is
supposed to stop a delegated run from being handed collaboration context no record accounts for is
machinery nothing runs. C1-C6 also left the substrate unreachable by any agent: there is no command
and no tool through which an Engineer can read the exchange or post a signal. Shipping the surface
wrong is worse than not shipping it — a surface that accepts a caller-declared actor, offers a write
destination, or hands an agent an unmarked block of other agents' prose turns the substrate into an
injection channel with a forged author.

## Goal

One bounded Engineer surface — a `repo-harness collaboration` command family plus a closed Engineer
MCP collaboration tool set — whose actor is always derived server-side from the authenticated
principal, whose mutations fail closed when `collaboration.mode` is off, which exposes no arbitrary
file write, generic shell, task acquire/release, publication, acceptance or merge tool, and which
passes C6's untrusted coordination rendering through unstripped; plus the dispatch fence wired in
front of `dispatchDelegatedRun()` so a collaboration-mode run without a valid binding is refused
through the CLI, while an ordinary delegated dispatch is unaffected. A handoff publication returns
an identity-only acknowledgement: the full record, especially its caller-supplied
`execution_context`, becomes externally readable only through C6's verified projection.

## Scope

- In scope:
  - `collaborationDispatchIntent()` and `fenceCollaborationDispatch()` in
    `src/effects/collaboration/context-delivery.ts`, over the existing `readLiveRun()`.
  - The fence call site in `src/cli/commands/delegation.ts` ahead of `dispatchDelegatedRun()`.
  - `src/cli/commands/collaboration.ts` with `exchange`, `threads`, `signals`, `post`,
    `handoff publish|list|adopt` and `packet build`, registered in `src/cli/index.ts`.
  - `src/cli/mcp/collaboration-tools.ts` and its append to the engineer profile in
    `src/cli/mcp/tools.ts`.
  - The frozen injection budget's upper bound in `buildCollaborationContextPacket()`, since
    `collaboration packet build` is the first caller-reachable path that can name the budget.
  - The architecture model entries and projection for the new entrypoints and flow.
- Out of scope:
  - the Operator read-only surface (C8), `operator-web/`, `src/core/operator/`,
    `src/effects/operator/`.
  - Any Task, Lease, Publication or Acceptance write, and any change to the frozen
    `src/core/collaboration/common.ts` and `src/core/collaboration/signal.ts` protocols.
  - Any new store, cache or projection in front of C6's collector.
- Taste constraints: no compatibility fallback. An unknown input key is refused rather than dropped;
  a mutation with the flag off fails closed rather than degrading to a read; the untrusted rendering
  is passed through verbatim rather than re-emitted by a second producer.

## Stop Conditions

- Stop and hand back to the parent if the change would require editing a path outside Allowed Paths.
- Stop if an Exit Criteria command cannot be run in this environment.
- Stop if Goal, Scope, or Exit Criteria are internally contradictory.

## Falsifier

The direction is wrong if the discriminator lets a run carrying an untrusted coordination block reach
`dispatchDelegatedRun()` without a binding, because then the fence is still decorative and the row
delivered a surface without the guarantee that justifies it. Cheapest proof point: admit one seat whose
envelope goal is a composed collaboration goal, record no binding, and run `delegation dispatch`
through the CLI — it must exit non-zero with `binding_missing`, while a seat carrying a bare base goal
dispatches unchanged.

## Root Cause Evidence

Required when Task Profile is `bugfix`; leave as-is otherwise.

- root_cause: one sentence naming file:line/condition (testable, not "a state issue").
- repro: the command or UI path that reproduces the symptom.
- regression_guard: path to a test that fails on the unfixed code and passes after the fix (must also appear under exit_criteria.tests_pass).
- pre_fix_failure_artifact: path to a captured run of regression_guard on the UNFIXED code. Capture with `bun test <regression_guard> > <artifact> 2>&1; echo "PRE_FIX_EXIT=$?" >> <artifact>` (no pipes — pipes swallow the exit status). The gate requires a non-zero `PRE_FIX_EXIT=` line plus the regression_guard path string in the artifact (see the Root Cause Evidence Gate section in docs/reference-configs/sprint-contracts.md).

## Workflow Inventory

- Source plan: `plans/plan-20260830-1342-c7-cli-mcp-bounded-context-injection.md`
- Deferred-goal ledger: `tasks/todos.md`
- Review file: `tasks/reviews/20260830-1342-c7-cli-mcp-bounded-context-injection.review.md`
- Notes file: `tasks/notes/20260830-1342-c7-cli-mcp-bounded-context-injection.notes.md`
- Checks file: `.ai/harness/checks/latest.json`
- Run snapshots: `.ai/harness/runs/`
- Scope gate: edit only paths listed under `allowed_paths`; update this contract before widening scope.
- Completion gate: run `verify-sprint --prepare-acceptance`, record one typed AcceptanceReceipt under the frozen policy below, then run `verify-sprint`; review Markdown is projection only.

## Change Assessment

```json
{"protocol":1,"oracles":[{"id":"collaboration-dispatch-fence-through-cli","kind":"deterministic_test","paths":["*"]},{"id":"collaboration-bounded-cli-surface","kind":"deterministic_test","paths":["*"]},{"id":"collaboration-mcp-tool-inventory","kind":"deterministic_test","paths":["*"]},{"id":"engineer-mcp-inventory-regression","kind":"deterministic_test","paths":["*"]},{"id":"collaboration-store-regression","kind":"deterministic_test","paths":["*"]},{"id":"architecture-projection-model-pins","kind":"deterministic_test","paths":["*"]},{"id":"repo-full-suite","kind":"deterministic_test","paths":["*"]},{"id":"repo-typecheck","kind":"deterministic_test","paths":["*"]}]}
```

## Acceptance Policy

```json
{"protocol":2,"reviewer":"Codex","source":"codex-review","user_waiver":"allowed"}
```

## Allowed Paths

```yaml
allowed_paths:
  - plans/plan-20260830-1342-c7-cli-mcp-bounded-context-injection.md
  - plans/sprints/20260828-2321-collaborative-work-exchange-agent-succession.sprint.md
  - tasks/current.md
  - tasks/todos.md
  - tasks/lessons.md
  - tasks/contracts/20260830-1342-c7-cli-mcp-bounded-context-injection.contract.md
  - tasks/reviews/20260830-1342-c7-cli-mcp-bounded-context-injection.review.md
  - tasks/notes/20260830-1342-c7-cli-mcp-bounded-context-injection.notes.md
  - tasks/workstreams/runtime-harness/collaboration/
  - src/cli/commands/collaboration.ts
  - src/cli/commands/delegation.ts
  - src/cli/index.ts
  - src/cli/mcp/collaboration-tools.ts
  - src/cli/mcp/tools.ts
  # The engineer profile's live doctor compares the served tools/list against the
  # inventory it builds, so it has to expect the same composition the server does.
  - src/cli/mcp/setup.ts
  # The injection budget's upper bound belongs in the builder every caller already
  # passes through, because `collaboration packet build` is the first surface that
  # lets a caller name the budget at all.
  - src/core/collaboration/context-packet.ts
  - tests/unit/collaboration-context-packet.test.ts
  - src/effects/collaboration/context-delivery.ts
  # One module both adapters call, so the actor derivation, the fixed destination,
  # the mutation gate and the untrusted marking are stated once instead of twice.
  - src/effects/collaboration/agent-surface.ts
  - tests/cli/
  # The architecture surface. This row adds CLI and MCP entrypoints and one flow, so
  # the model and its projection move with the code in one acceptance round under
  # event.orchestrator-approval-20260830-c7-collaboration-architecture rather than
  # paying for a second approval event.
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
    - src/cli/commands/collaboration.ts
    - src/cli/mcp/collaboration-tools.ts
  artifacts_exist:
    - .ai/harness/checks/latest.json
    - tasks/notes/20260830-1342-c7-cli-mcp-bounded-context-injection.notes.md
  tests_pass:
    - path: tests/unit/collaboration-context-packet.test.ts
    - path: tests/cli/collaboration.test.ts
    - path: tests/cli/mcp-collaboration-tools.test.ts
    - path: tests/cli/mcp-engineer-tools.test.ts
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
