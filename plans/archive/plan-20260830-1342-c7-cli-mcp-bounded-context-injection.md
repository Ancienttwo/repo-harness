# Plan: C7 CLI/MCP bounded collaboration surface and context injection

> **Status**: Archived
> **Created**: 20260830-1342
> **Slug**: c7-cli-mcp-bounded-context-injection
> **Planning Source**: repo-harness-sprint
> **Orchestration Kind**: host-plan
> **Source Ref**: sprint:plans/sprints/20260828-2321-collaborative-work-exchange-agent-succession.sprint.md#8
> **Artifact Level**: work-package
> **Promotion Reason**: verification_boundary
> **Verification Boundary**: Full bun suite, tsc --noEmit, check-task-sync, check-task-workflow --strict and architecture-projection check all green; a collaboration-mode delegated run without a valid CollaborationRunContextBinding is refused through the delegation dispatch CLI while a non-collaboration dispatch is unaffected; the Engineer CLI and MCP inventories are exact and expose no arbitrary file write, generic shell, task acquire/release, publication, acceptance or merge surface; a caller-supplied actor is refused and the published actor is the authenticated principal's; every mutation fails closed when collaboration.mode is off; a posted signal reads back through the exchange; the canonical untrusted coordination markers reach the caller unstripped
> **Rollback Surface**: collaboration.mode=off leaves every new mutation surface inert; remove the collaboration command registration and the collaboration MCP tool block and the surface disappears while the C1-C6 stores stay readable; the dispatch guard reverts with src/effects/collaboration/context-delivery.ts and src/cli/commands/delegation.ts in one commit; no persisted state migration
> **Spec**: `docs/spec.md`
> **Research**: See `docs/researches/`
> **Task Contract**: `tasks/contracts/20260830-1342-c7-cli-mcp-bounded-context-injection.contract.md`
> **Task Review**: `tasks/reviews/20260830-1342-c7-cli-mcp-bounded-context-injection.review.md`
> **Implementation Notes**: `tasks/notes/20260830-1342-c7-cli-mcp-bounded-context-injection.notes.md`

## Agentic Routing
- Selected route: planning
- Routing reason: Captured from repo-harness-sprint planning output.
- Source ref: sprint:plans/sprints/20260828-2321-collaborative-work-exchange-agent-succession.sprint.md#8
- Due diligence:
  - P1 map: See captured planning output below.
  - P2 trace: See captured planning output below.
  - P3 decision rationale: See captured planning output below.

## Workflow Inventory
Complete this inventory before implementation. If any line is unknown, keep the plan in Draft and fill it before projection.

- Active plan: `plans/plan-20260830-1342-c7-cli-mcp-bounded-context-injection.md`
- Sprint contract: `tasks/contracts/20260830-1342-c7-cli-mcp-bounded-context-injection.contract.md`
- Sprint review: `tasks/reviews/20260830-1342-c7-cli-mcp-bounded-context-injection.review.md`
- Implementation notes: `tasks/notes/20260830-1342-c7-cli-mcp-bounded-context-injection.notes.md`
- Deferred-goal ledger: `tasks/todos.md`
- Current checks: `.ai/harness/checks/latest.json`
- Run snapshots: `.ai/harness/runs/`
- Scope authority: `tasks/contracts/20260830-1342-c7-cli-mcp-bounded-context-injection.contract.md` `allowed_paths`
- Concurrency rule: `.ai/harness/active-plan` selects the active plan for this worktree when present; `.ai/harness/active-worktree` records the owning worktree. If another worktree already owns active work, open or switch to the matching worktree instead of serializing unrelated plans.
- Execution isolation: approved contract-level work projects through `repo-harness run plan-to-todo --plan plans/plan-20260830-1342-c7-cli-mcp-bounded-context-injection.md` and may start `repo-harness run contract-worktree start --plan plans/plan-20260830-1342-c7-cli-mcp-bounded-context-injection.md`.

## Approach
### Strategy
Use the captured planning output below as the execution source of truth.

### Trade-offs
| Option | Pros | Cons | Decision |
|--------|------|------|----------|
| Captured plan | Preserves the approved Codex Plan or Waza think decision | Requires the captured text to be concrete enough to execute | Use |

## Detailed Design
### File Changes
| File | Action | Description |
|------|--------|-------------|
| See captured planning output | Follow | Implement only the approved scope named below |

### Code Snippets
See captured planning output.

### Data Flow
See captured planning output.

## Risk Assessment
| Risk | Likelihood | Impact | Mitigation |
|------|------------|--------|------------|
| Captured plan lacks enough detail | Medium | Execution may need clarification | Stop before implementation if the captured output contradicts repo rules or lacks concrete file targets |

## Task Contracts
- Contract file: `tasks/contracts/20260830-1342-c7-cli-mcp-bounded-context-injection.contract.md`
- Review file: `tasks/reviews/20260830-1342-c7-cli-mcp-bounded-context-injection.review.md`
- Implementation notes file: `tasks/notes/20260830-1342-c7-cli-mcp-bounded-context-injection.notes.md`
- Template: `.claude/templates/contract.template.md`
- Verification command: `repo-harness run verify-contract --contract tasks/contracts/20260830-1342-c7-cli-mcp-bounded-context-injection.contract.md --strict`
- Active plan rule: this captured plan is written to `.ai/harness/active-plan` and the owning worktree is written to `.ai/harness/active-worktree` unless --no-active is used. Do not infer active execution from the latest non-archived plan.

## Handoff

- Checks file: `.ai/harness/checks/latest.json`
- Session handoff: `.ai/harness/handoff/current.md`

## Promotion Gate

- **Merge/PR unit**: Captured plan `plans/plan-20260830-1342-c7-cli-mcp-bounded-context-injection.md` is the proposed mergeable execution unit; revise before execute if this is only a checklist step.
- **Rollback surface**: collaboration.mode=off leaves every new mutation surface inert; remove the collaboration command registration and the collaboration MCP tool block and the surface disappears while the C1-C6 stores stay readable; the dispatch guard reverts with src/effects/collaboration/context-delivery.ts and src/cli/commands/delegation.ts in one commit; no persisted state migration
- **Verification boundary**: Full bun suite, tsc --noEmit, check-task-sync, check-task-workflow --strict and architecture-projection check all green; a collaboration-mode delegated run without a valid CollaborationRunContextBinding is refused through the delegation dispatch CLI while a non-collaboration dispatch is unaffected; the Engineer CLI and MCP inventories are exact and expose no arbitrary file write, generic shell, task acquire/release, publication, acceptance or merge surface; a caller-supplied actor is refused and the published actor is the authenticated principal's; every mutation fails closed when collaboration.mode is off; a posted signal reads back through the exchange; the canonical untrusted coordination markers reach the caller unstripped
- **Review/acceptance boundary**: `tasks/reviews/20260830-1342-c7-cli-mcp-bounded-context-injection.review.md` must record pass against the captured acceptance criteria.
- **High-risk surface**: Risks named in captured planning output; keep the plan Draft if risk ownership is not concrete.
- **Why not checklist row**: verification_boundary

## Evidence Contract

- **State/progress path**: `plans/plan-20260830-1342-c7-cli-mcp-bounded-context-injection.md` task breakdown, `tasks/todos.md` deferred-goal ledger, `tasks/contracts/20260830-1342-c7-cli-mcp-bounded-context-injection.contract.md`, `tasks/reviews/20260830-1342-c7-cli-mcp-bounded-context-injection.review.md`, and `tasks/notes/20260830-1342-c7-cli-mcp-bounded-context-injection.notes.md`
- **Verification evidence**: `.ai/harness/checks/latest.json`, `.ai/harness/runs/`, and the commands named in the captured planning output
- **Evaluator rubric**: `tasks/reviews/20260830-1342-c7-cli-mcp-bounded-context-injection.review.md` must record a passing Waza /check style recommendation
- **Stop condition**: all task breakdown items are complete, sprint verification passes, and the review recommends pass
- **Rollback surface**: collaboration.mode=off leaves every new mutation surface inert; remove the collaboration command registration and the collaboration MCP tool block and the surface disappears while the C1-C6 stores stay readable; the dispatch guard reverts with src/effects/collaboration/context-delivery.ts and src/cli/commands/delegation.ts in one commit; no persisted state migration

## Captured Planning Output

## P1 Map

Sprint row C7 gives the collaboration substrate its first agent-facing surface and closes C6's
bolded forward constraint: `assertCollaborationDispatchBinding()` currently has zero production
callers, so the fence C6 built is machinery nothing runs.

Authoritative surfaces:

- `src/cli/commands/delegation.ts` — the only production dispatch path today; `dispatchDelegatedRun()`
  is called at line 185 with no collaboration pre-step.
- `src/effects/collaboration/context-delivery.ts` — C6's delivery path, the binding recorder and the
  fence, plus the private `readLiveRun()` that is the single reader of a dispatch's live intent and
  envelope.
- `src/effects/collaboration/signal-store.ts`, `handoff-store.ts`, `adoption-store.ts`,
  `work-exchange.ts` — the C1/C3/C6 stores the bounded surface reads and writes through.
- `src/effects/collaboration/actor.ts` — D4's server-side actor derivation; the only way this surface
  learns who is speaking.
- `src/effects/collaboration/record-store.ts` — `authorizeCollaborationDestination()`, which already
  binds a `module_engineer` actor to the public shard and a `delegated_worker` to its own candidate
  area.
- `src/cli/mcp/tools.ts` + `src/cli/mcp/engineer-tools.ts` — the engineer MCP profile and its closed
  tool inventory.
- `src/core/collaboration/context-packet.ts` — `COLLABORATION_CONTEXT_START/WARNING/END`, the canonical
  untrusted rendering this surface must pass through without stripping.

Out of scope: the Operator read-only surface (C8), `operator-web/`, `src/core/operator/`,
`src/effects/operator/`, any Task/Lease/Publication/Acceptance write, and any change to the frozen
`common.ts` / `signal.ts` protocols.

## P2 Trace

Two concrete paths.

**Path 1 — the fence, through the CLI.** `repo-harness delegation dispatch --input <json>` parses an
exact three-key input, then calls `dispatchDelegatedRun()`. Today a run whose envelope goal carries a
`[CoordinationContextUntrusted]` block dispatches with no check that any record accounts for that
block. The pressure point is exactly this call site: the fence exists, is tested as a unit, and is
never reached in production.

**Path 2 — a bounded post and read-back.** `repo-harness collaboration post --authorization-id <id>
--input <json>` resolves the authenticated principal through `resolveModuleEngineerActor()`, publishes
one `CoordinationSignalV1` to the public shard, and `repo-harness collaboration exchange` then reads it
back through `collectCollaborativeWorkExchange()`. No parameter on either path names an actor, a
destination or a recorded time: the actor comes from the authorization, the destination is fixed to
`public` because `authorizeCollaborationDestination()` already refuses anything else for a
`module_engineer`, and the recorded time is `first_publication` because a caller-chosen instant is a
second authority over a Host-derived field.

## P3 Decision

**The fence discriminator.** A binding exists only when context was delivered through
`deliverCollaborationContext()`, so an ordinary delegated run has none and an unconditional fence would
break the existing delegation CLI. The discriminator is therefore computed from Host-owned state, and
it is a union rather than a single test:

    collaboration dispatch  <=>  a binding record exists for the dispatch
                             OR  the envelope goal carries either untrusted coordination marker

Binding-exists alone is insufficient and would be a hole: a forger who injects the untrusted block into
a goal and simply never records a binding would skip the fence entirely. Marker-carries alone is
insufficient for the symmetric reason. With the union, `delegation_only` means "no binding and no
marker", which is precisely a run this row makes no claim about; every other run must produce a
binding that reproduces the goal actually being dispatched or it does not dispatch. The discriminator
reads the same `readLiveRun()` the recorder and the fence read, so no shadow reader of the delegation
plane is introduced.

**Reads are allowed when the flag is off; mutations are not.** This is the established C1-C6
convention, not a new decision: `assertCollaborationMutationEnabled()` gates writes and
`collectCollaborativeWorkExchange()` reads the mode, reports it on the collection, and returns a
snapshot regardless. A read surface that refused when off would make the flag unobservable through the
surface an operator would use to observe it.

**The untrusted marking is a pass-through, not a second producer.** `renderCollaborationContext()` is
the only thing that emits `[CoordinationContextUntrusted]`, and `decomposeCollaborationGoal()` depends
on exactly one such line existing in a composed goal. Wrapping arbitrary tool JSON in the same markers
would mint a second producer and make that split ambiguous. So the packet surface returns C6's
rendering verbatim, markers intact, and every other collaboration read payload carries an explicit
`content_trust` object bearing the frozen `COLLABORATION_CONTEXT_WARNING` text.

**No destination and no self-declared identity on the wire.** The tool schemas use
`additionalProperties: false` and the CLI inputs use an exact key set, so an `actor`, `engineer_id` or
`destination` key is refused rather than silently dropped. Rejecting is strictly stronger than ignoring
and keeps the store's existing enforcement from being the only thing standing between a caller and a
forged author.

At 10x scale the first thing to fail is the exchange read, which double-reads every shard on every
call; that is C6's collector and this row deliberately adds no cache in front of it, because a cache
would be a second answer that could disagree with `snapshot_sha256`.

## Task Breakdown

- [ ] Add the dispatch discriminator and guard to `src/effects/collaboration/context-delivery.ts`:
      `collaborationDispatchIntent()` over the existing `readLiveRun()`, and
      `fenceCollaborationDispatch()` which returns null for a `delegation_only` run and otherwise calls
      `assertCollaborationDispatchBinding()`.
- [ ] Wire `fenceCollaborationDispatch()` into `src/cli/commands/delegation.ts` before
      `dispatchDelegatedRun()`, and map `CollaborationError` onto the command's typed error output.
- [ ] Add `src/cli/commands/collaboration.ts` with `exchange`, `threads`, `signals`, `post`,
      `handoff publish|list|adopt` and `packet build`; register it in `src/cli/index.ts`.
- [ ] Add `src/cli/mcp/collaboration-tools.ts` with the closed Engineer collaboration tool set and
      append it to the engineer profile in `src/cli/mcp/tools.ts`.
- [ ] Keep every mutation behind `assertCollaborationMutationEnabled()` and every actor derived from
      the authenticated principal; accept no actor, destination or recorded-time parameter anywhere.
- [ ] Tests: fence refusal through the CLI dispatch path plus an unaffected non-collaboration dispatch;
      exact CLI and MCP tool inventories with no arbitrary write, generic shell, task acquire/release,
      publication, acceptance or merge surface; server-side actor derivation with a caller-supplied
      actor refused; flag-off fail-closed on every mutation; post to exchange round trip; the untrusted
      markers present and unstripped.
- [ ] Architecture: declare the new CLI and MCP entrypoints plus the bounded-surface flow in
      `.archcontext/model/`, route intra-capability steps through `component.collaboration.primary`,
      and project into `docs/architecture/` in this same acceptance round under
      `event.orchestrator-approval-20260830-c7-collaboration-architecture`.

## Verification

- `codegraph index .`
- `bun test --timeout 60000`
- `node node_modules/typescript/bin/tsc --noEmit`
- `bash scripts/check-task-sync.sh`
- `repo-harness run check-task-workflow --strict`
- `repo-harness architecture-projection check --json`

## Annotations
<!-- [NOTE]: prefixed inline. Claude processes all and revises. -->

## Task Breakdown
- [ ] Add the dispatch discriminator and guard to `src/effects/collaboration/context-delivery.ts`:
- [ ] Wire `fenceCollaborationDispatch()` into `src/cli/commands/delegation.ts` before
- [ ] Add `src/cli/commands/collaboration.ts` with `exchange`, `threads`, `signals`, `post`,
- [ ] Add `src/cli/mcp/collaboration-tools.ts` with the closed Engineer collaboration tool set and
- [ ] Keep every mutation behind `assertCollaborationMutationEnabled()` and every actor derived from
- [ ] Tests: fence refusal through the CLI dispatch path plus an unaffected non-collaboration dispatch;
- [ ] Architecture: declare the new CLI and MCP entrypoints plus the bounded-surface flow in
