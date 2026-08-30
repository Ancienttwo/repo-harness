# Plan: C6 collaboration-centric Work Exchange and Context Packet

> **Status**: Archived
> **Created**: 20260830-1031
> **Slug**: c6-collaborative-work-exchange-context-packet
> **Planning Source**: repo-harness-sprint
> **Orchestration Kind**: host-plan
> **Source Ref**: sprint:plans/sprints/20260828-2321-collaborative-work-exchange-agent-succession.sprint.md#7
> **Artifact Level**: work-package
> **Promotion Reason**: verification_boundary
> **Verification Boundary**: Full bun suite, tsc --noEmit, check-task-sync, check-task-workflow --strict and architecture-projection check all green; the exchange snapshot rebuilds byte-identically from the same stores; existing EngineerOfferV1 payload and offer_revision are projected verbatim; a source changing mid-collection yields changed_during_read and an unreadable shard yields degraded; a non-stable snapshot fails loud instead of building a packet; a collaboration-mode delegated run with a missing or stale CollaborationRunContextBinding is refused dispatch; an unverifiable bound_task execution_context is excluded from every projection
> **Rollback Surface**: collaboration.mode=off leaves the collector and delivery path inert; new modules under src/core/collaboration and src/effects/collaboration plus their tests revert as one commit; no persisted state migration since the binding store is additive and no existing caller reads it
> **Spec**: `docs/spec.md`
> **Research**: See `docs/researches/`
> **Task Contract**: `tasks/contracts/20260830-1031-c6-collaborative-work-exchange-context-packet.contract.md`
> **Task Review**: `tasks/reviews/20260830-1031-c6-collaborative-work-exchange-context-packet.review.md`
> **Implementation Notes**: `tasks/notes/20260830-1031-c6-collaborative-work-exchange-context-packet.notes.md`

## Agentic Routing
- Selected route: planning
- Routing reason: Captured from repo-harness-sprint planning output.
- Source ref: sprint:plans/sprints/20260828-2321-collaborative-work-exchange-agent-succession.sprint.md#7
- Due diligence:
  - P1 map: See captured planning output below.
  - P2 trace: See captured planning output below.
  - P3 decision rationale: See captured planning output below.

## Workflow Inventory
Complete this inventory before implementation. If any line is unknown, keep the plan in Draft and fill it before projection.

- Active plan: `plans/plan-20260830-1031-c6-collaborative-work-exchange-context-packet.md`
- Sprint contract: `tasks/contracts/20260830-1031-c6-collaborative-work-exchange-context-packet.contract.md`
- Sprint review: `tasks/reviews/20260830-1031-c6-collaborative-work-exchange-context-packet.review.md`
- Implementation notes: `tasks/notes/20260830-1031-c6-collaborative-work-exchange-context-packet.notes.md`
- Deferred-goal ledger: `tasks/todos.md`
- Current checks: `.ai/harness/checks/latest.json`
- Run snapshots: `.ai/harness/runs/`
- Scope authority: `tasks/contracts/20260830-1031-c6-collaborative-work-exchange-context-packet.contract.md` `allowed_paths`
- Concurrency rule: `.ai/harness/active-plan` selects the active plan for this worktree when present; `.ai/harness/active-worktree` records the owning worktree. If another worktree already owns active work, open or switch to the matching worktree instead of serializing unrelated plans.
- Execution isolation: approved contract-level work projects through `repo-harness run plan-to-todo --plan plans/plan-20260830-1031-c6-collaborative-work-exchange-context-packet.md` and may start `repo-harness run contract-worktree start --plan plans/plan-20260830-1031-c6-collaborative-work-exchange-context-packet.md`.

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
- Contract file: `tasks/contracts/20260830-1031-c6-collaborative-work-exchange-context-packet.contract.md`
- Review file: `tasks/reviews/20260830-1031-c6-collaborative-work-exchange-context-packet.review.md`
- Implementation notes file: `tasks/notes/20260830-1031-c6-collaborative-work-exchange-context-packet.notes.md`
- Template: `.claude/templates/contract.template.md`
- Verification command: `repo-harness run verify-contract --contract tasks/contracts/20260830-1031-c6-collaborative-work-exchange-context-packet.contract.md --strict`
- Active plan rule: this captured plan is written to `.ai/harness/active-plan` and the owning worktree is written to `.ai/harness/active-worktree` unless --no-active is used. Do not infer active execution from the latest non-archived plan.

## Handoff

- Checks file: `.ai/harness/checks/latest.json`
- Session handoff: `.ai/harness/handoff/current.md`

## Promotion Gate

- **Merge/PR unit**: Captured plan `plans/plan-20260830-1031-c6-collaborative-work-exchange-context-packet.md` is the proposed mergeable execution unit; revise before execute if this is only a checklist step.
- **Rollback surface**: collaboration.mode=off leaves the collector and delivery path inert; new modules under src/core/collaboration and src/effects/collaboration plus their tests revert as one commit; no persisted state migration since the binding store is additive and no existing caller reads it
- **Verification boundary**: Full bun suite, tsc --noEmit, check-task-sync, check-task-workflow --strict and architecture-projection check all green; the exchange snapshot rebuilds byte-identically from the same stores; existing EngineerOfferV1 payload and offer_revision are projected verbatim; a source changing mid-collection yields changed_during_read and an unreadable shard yields degraded; a non-stable snapshot fails loud instead of building a packet; a collaboration-mode delegated run with a missing or stale CollaborationRunContextBinding is refused dispatch; an unverifiable bound_task execution_context is excluded from every projection
- **Review/acceptance boundary**: `tasks/reviews/20260830-1031-c6-collaborative-work-exchange-context-packet.review.md` must record pass against the captured acceptance criteria.
- **High-risk surface**: Risks named in captured planning output; keep the plan Draft if risk ownership is not concrete.
- **Why not checklist row**: verification_boundary

## Evidence Contract

- **State/progress path**: `plans/plan-20260830-1031-c6-collaborative-work-exchange-context-packet.md` task breakdown, `tasks/todos.md` deferred-goal ledger, `tasks/contracts/20260830-1031-c6-collaborative-work-exchange-context-packet.contract.md`, `tasks/reviews/20260830-1031-c6-collaborative-work-exchange-context-packet.review.md`, and `tasks/notes/20260830-1031-c6-collaborative-work-exchange-context-packet.notes.md`
- **Verification evidence**: `.ai/harness/checks/latest.json`, `.ai/harness/runs/`, and the commands named in the captured planning output
- **Evaluator rubric**: `tasks/reviews/20260830-1031-c6-collaborative-work-exchange-context-packet.review.md` must record a passing Waza /check style recommendation
- **Stop condition**: all task breakdown items are complete, sprint verification passes, and the review recommends pass
- **Rollback surface**: collaboration.mode=off leaves the collector and delivery path inert; new modules under src/core/collaboration and src/effects/collaboration plus their tests revert as one commit; no persisted state migration since the binding store is additive and no existing caller reads it

## Captured Planning Output

## P1 Map

Sprint row C6 wires the collaboration substrate's shipped seams into a single read model plus a
context-delivery path with a mandatory dispatch fence.

Authoritative surfaces:

- `src/core/collaboration/context-packet.ts` — C2's builder. Already accepts `snapshot_consistency`
  and `handoff_facts` as consumer-declared injection seams and refuses to synthesize either.
- `src/core/collaboration/thread-projection.ts` — C2's thread/hotspot/opportunity projection and
  `CollaborationHandoffFactV1`, the seam C6 now fills from real C3 stores.
- `src/effects/collaboration/record-store.ts` — the sharded append-only reader every collaboration
  store sits on; the layer that can observe a torn read.
- `src/effects/collaboration/handoff-store.ts`, `adoption-store.ts`, `signal-store.ts`,
  `contribution-store.ts` — C1/C3/C4 stores the collector double-reads.
- `src/effects/collaboration/succession.ts` — C5's `resolveBoundTaskSuccession()`, the read-time
  proof for a persisted `bound_task` execution context.
- `src/core/engineers/scheduling.ts` — existing `EngineerOfferV1`, projected verbatim.
- `src/effects/engineers/delegated-run-store.ts` — `prepareDelegatedRun()` / `intentForDispatch()`,
  where the binding fence attaches without a second destination resolver.

Out of scope: CLI/MCP surface (C7), Operator UI (C8), any Lease/Claim/Publication write.

## P2 Trace

One collaboration round, end to end:

1. `collectCollaborativeWorkExchange()` double-reads signals, handoffs, adoptions, contribution
   commits and engineer offers. Each mutable source is read twice; a source whose digest differs
   between reads yields `changed_during_read`, an unreadable shard yields `degraded`, and both are
   derived by the reader because it is the only layer that can observe them. The result is
   `CollaborativeWorkExchangeSnapshotV1` carrying `execution_offers`, `active_participants`,
   `threads`, `relevant_signals`, `open_handoffs`, `contribution_opportunities`,
   `snapshot_consistency` and `snapshot_sha256`.
2. `deliverCollaborationContext()` refuses a non-`stable` snapshot (fail loud), builds the C2
   packet from the collected signals plus real `handoff_facts` joined from the handoff and adoption
   stores, renders the canonical `[CoordinationContextUntrusted]` block, composes it into the
   delegated run's `DelegationExecutionPacket.goal`, and persists a
   `CollaborationRunContextBindingV1` recording every digest that was embedded.
3. `assertCollaborationDispatchBinding()` runs before dispatch: binding exists, its
   `delegated_run_intent_sha256` and `execution_packet_sha256` match the current intent and packet,
   it references the collaboration packet, and `rendered_context_sha256` plus `composed_goal_sha256`
   reproduce the goal actually being dispatched. Missing or stale fails closed.

Pressure point: `execution_context` on a persisted handoff. C4's delegated-worker contribution path
can persist a `bound_task` branch carrying any claim id, lease generation and freeze digest, because
the worker supplies it. Any C6 surface that exposes it must run C5's proof or not expose it.

## P3 Decision

Obligation 1 — `execution_context` consumption routes through `resolveBoundTaskSuccession()`, and
the shape is verify-or-exclude, not verify-or-flag. A flag is a fallback: it puts an unproven
claim id and lease generation on a projection and asks every downstream reader to remember to check
a boolean. The repository's fail-closed rule says an unverifiable authoritative value is surfaced as
a failure, not synthesized into something that keeps the flow moving. So an unverifiable
`bound_task` context is omitted from the projection entirely and the omission is counted, which is
itself the honest signal; the handoff still projects, because the knowledge is not what was forged.

Obligation 2 — the `delegated_worker` adoption refusal stays, with corrected wording. C6 makes the
Host the adopting actor: the Host builds the packet, composes it into the goal and records the
binding, so the Host is who context was delivered to on behalf of a worker round. A worker-authored
adoption receipt would be a public record with no commit reference, inverting C4's boundary that
worker-derived records become visible only after promotion. Round continuity does not need it: the
binding already proves which collaboration packet entered which run, with stronger provenance than a
self-reported receipt.

Binding as a fence, not metadata: the parent PRD's Authority Map calls the binding "advisory only",
meaning it confers no execution right. That is compatible with a mandatory fence — the fence proves
provenance integrity of injected context, it does not grant authority. The sprint row's amended text
governs the gate's necessity.

## Task Breakdown

- [ ] Add `CollaborativeWorkExchangeSnapshotV1` protocol in `src/core/collaboration/work-exchange.ts`
      with `ExistingEngineerOfferProjection` carrying `EngineerOfferV1` and `offer_revision` verbatim.
- [ ] Add `CollaborationRunContextBindingV1` protocol in `src/core/collaboration/run-binding.ts`
      with canonical digest, validator and a fence comparison helper.
- [ ] Implement `src/effects/collaboration/work-exchange.ts`: double-read collection over every
      mutable source, honest `snapshot_consistency` derivation, fail-loud on unreadable sources,
      zero filesystem writes.
- [ ] Implement `src/effects/collaboration/context-delivery.ts`: real `handoff_facts` join from the
      C3 handoff and adoption stores, packet build, canonical render, goal composition, binding
      persistence, and the pre-dispatch fence.
- [ ] Route every `execution_context` exposure through `resolveBoundTaskSuccession()` with
      verify-or-exclude semantics.
- [ ] Tests: snapshot determinism byte-identical; exact offer revision preservation; fail-loud
      collection; binding fence refuses missing and stale bindings; packet-from-real-stores round
      trip; consistency derivation for `changed_during_read` and `degraded`; verify-or-exclude.
- [ ] Architecture: declare the new entrypoints and flow in `.archcontext/model/`, project into
      `docs/architecture/`, and resolve the C5-deferred succession entrypoint declaration in the
      same acceptance round.

## Verification

- `codegraph index .`
- `bun test --timeout 60000`
- `node node_modules/typescript/bin/tsc --noEmit`
- `bash scripts/check-task-sync.sh`
- `repo-harness run check-task-workflow --strict`
- `repo-harness architecture-projection check --json`

## Annotations
