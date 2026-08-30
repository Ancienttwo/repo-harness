# Implementation Notes: c7-cli-mcp-bounded-context-injection

> **Status**: Active
> **Plan**: plans/plan-20260830-1342-c7-cli-mcp-bounded-context-injection.md
> **Contract**: tasks/contracts/20260830-1342-c7-cli-mcp-bounded-context-injection.contract.md
> **Review**: tasks/reviews/20260830-1342-c7-cli-mcp-bounded-context-injection.review.md
> **Last Updated**: 2026-08-30 13:42
> **Lifecycle**: notes

## Design Decisions

- **The fence discriminator is a union, not a single test.** `collaborationDispatchIntent()`
  calls a dispatch a collaboration dispatch when a binding record exists for it *or* when the
  envelope goal carries either untrusted coordination marker. Binding-exists alone leaves the
  interesting hole open: a caller who injects the block into a goal and never records a binding
  would skip the fence by omitting the very record the fence checks. Marker-carries alone fails
  symmetrically. `delegation_only` therefore means "no binding and no marker", which is exactly
  the shape every dispatch this command served before this row.
- **Markers are tested by presence, not by attempting a split.** A goal carrying a partial or
  malformed block is a collaboration dispatch whose binding will not check out, and it must reach
  the fence to be told so. Catching a parse failure here would be the surface forming its own
  opinion about a forgery.
- **One shared surface module, two thin adapters.** `src/effects/collaboration/agent-surface.ts`
  is the only place the actor derivation, the fixed `public` destination, the `first_publication`
  recorded time and the untrusted marking are stated. The CLI and the MCP tool set restate none of
  them. Two copies of a rule that must agree is how one of them silently falls behind.
- **No actor, destination or recorded time on the wire, and an unknown key is refused rather than
  dropped.** The CLI parses mutation payloads with an exact key set and the tools use
  `additionalProperties: false` plus `rejectUnknown()`. Rejection is strictly stronger than
  ignoring, and it keeps C1's store enforcement from being the only thing between a caller and a
  forged author.
- **Reads answer with the flag off; mutations do not.** This follows C1-C6 rather than deciding
  anything new: each store gates itself, and `collectCollaborativeWorkExchange()` reads the mode,
  reports it and returns a snapshot regardless. A read surface that refused when off would make
  the flag unobservable through the surface an operator would use to observe it. Every payload
  carries `mode`.
- **The untrusted marking is a pass-through, not a second producer.**
  `renderCollaborationContext()` stays the only emitter of `[CoordinationContextUntrusted]`,
  because `decomposeCollaborationGoal()` depends on exactly one such line existing in a composed
  goal. `packet build` returns C6's rendering verbatim; every other payload carries
  `content_trust` with the same frozen warning sentence and no markers.
- **`packet build` is CLI-only.** The PRD's Engineer tool profile lists packet *read*; composing a
  packet into a delegated run's goal is a Host act C6 gave the Host, so it is not something a
  Worker's parent can ask a tool for. The MCP inventory is the PRD's six; the CLI family is the
  sprint row's list plus `packet read`.
- **`mcp doctor --live` had to move with the server.** `src/cli/mcp/setup.ts` compares the served
  `tools/list` byte for byte against the inventory it builds, so leaving it on the engineer-only
  list would have made the doctor report the profile not ready.

## Deviations From Plan Or Spec

- Allowed Paths were widened mid-slice, through the contract, for
  `src/effects/collaboration/agent-surface.ts` (the shared surface module) and
  `src/cli/mcp/setup.ts` (the live doctor inventory). Both are recorded in the contract with the
  reason.
- Codex round-1 found a P1 this row introduced: `collaboration handoff list` read
  `listWorkStateHandoffs()` raw and returned unverified `execution_context`, re-opening on the first
  agent-facing surface the exact leak C6 removed from its own collection. Fixed by routing every
  surface read through `collect()`; see the sweep table above.
- Codex round-2 found the same P1 at a different egress: `handoff publish` returned the newly
  persisted `WorkStateHandoffV1` verbatim, so the write acknowledgement exposed a caller-supplied,
  shape-valid-only `execution_context` in the same record shape as a verified read. Fixed at the
  shared surface by making publication return an identity-only acknowledgement
  (`handoff_id`, `handoff_sha256`, `created`, mode and trust marking); both CLI and MCP pin that exact
  shape, and the forged-context non-containment tests include the publication response itself.
- One relation the plan did not anticipate was required:
  `relation.collaboration.engineer-scheduling`. The exchange surface asks the scheduling plane for
  the caller's own offers, and without the declared relation that flow step is unprovable.

## Tradeoffs Considered

| Option | Decision | Reason |
|--------|----------|--------|
| Fence every delegated dispatch vs only collaboration ones | Only collaboration ones | A binding exists only for a run that went through `deliverCollaborationContext()`; an unconditional fence would refuse the entire existing delegation CLI path |
| Binding-exists discriminator vs binding-or-marker | Binding-or-marker | Binding-exists alone lets a forger skip the fence by not recording the record the fence checks |
| Wrap read payloads in the canonical markers vs a `content_trust` field | `content_trust` | A second emitter of the markers would make `decomposeCollaborationGoal()`'s "exactly one such line" assumption ambiguous |
| Default `read_execution_offers` to `[]` vs asking the scheduling plane | Ask | The collector requires the caller to supply the plane's own answer precisely so an empty list cannot mean "nobody asked"; a scheduling refusal now fails the read instead of being reported as zero offers |
| Hoist the offer read out of the collector callback vs a named helper called from it | Named helper | Hoisting would give the double read one cached answer and make the offer source always look stable, defeating the consistency detection it exists for |
| A separate MCP profile for collaboration vs extending the engineer inventory | Extend | The surface is bounded by exactly the authenticated Engineer principal the profile already carries; a second profile would be a second place the boundary is stated |

## Open Questions

- None.

## Surface Read Sweep

Every read reachable from `src/effects/collaboration/agent-surface.ts`, and what it routes through.
The fixed question for each: *what is this data's existing verified projection, and did I route
through it?*

| Surface read | Routed through | Verdict |
|---|---|---|
| `collaborationExchangeView` → snapshot | `collect()` → `collectCollaborativeWorkExchange()` | Verified projection: double read, cross-repository check, C5 read-time proof |
| `collaborationThreadsView` → threads, opportunities | same collection's `snapshot` | Verified; no second derivation, so it cannot disagree with `snapshot_sha256` |
| `collaborationSignalsView` → signals | `collect().signals` (was raw `listCoordinationSignals()`) | Verified: the exact set the snapshot builder accepted, so it inherits the cross-repository check a raw list skips. Signals carry no `execution_context`, but the raw read was still the wrong authority |
| `collaborationHandoffsView` → handoffs | `collect().snapshot.open_handoffs` (was raw `listWorkStateHandoffs()` + `listHandoffAdoptionReceipts()`) | **The P1.** Verified: `proveExecutionContexts()` withholds every unproven `bound_task` branch and counts it in `unverified_execution_context_count`, which the view now returns. Adoption counts come off the summary, so the receipts read is gone too |
| `readExecutionOffersFor` → offers | `collectEngineerOffers()` | Adjudicated: the scheduling plane is the authority for its own offers; there is no projection above it |
| `collaborationPacketRead` → one packet | `readCollaborationContextPacket()` | Adjudicated in place: a Host record with no author and no `execution_context`, re-validated against its own content digest. No author-supplied branch exists for a proof to withhold, so this read *is* the authority |
| `collaborationHandoffPublish` acknowledgement | `publishWorkStateHandoff()` identity only | Persistence proves record identity and bytes, not execution authority. The acknowledgement contains no handoff body or `execution_context`; contents re-enter only through the verified exchange |
| other mutation acknowledgements (`signalPost`, `handoffAdopt`, `packetBuild`) | the stores' own write paths | Adjudicated by data shape: signals have no execution authority field and remain explicitly untrusted; adoption returns identity only; packets are Host-built and content-digested |

Structurally enforced, not just corrected: after the routing, this module imports **no** raw
collaboration list or record reader at all, so the unverified path is unreachable from the surface
layer rather than merely unused. `tests/cli/collaboration.test.ts` asserts that import set, with
`readCollaborationContextPacket` named as the one adjudicated exception.

## Egress Shape Rule

The verify-or-exclude invariant applies to every serialized egress, not only verbs named `read` or
`list`. A success acknowledgement may return only fields whose meaning the completed write proved.
For handoff publication that set is the immutable record identity and byte digest plus idempotency
status; the write did not prove the caller-supplied `execution_context`, so returning the handoff
record would overstate what succeeded. CLI and MCP therefore share
`CollaborationHandoffPublishAcknowledgementV1`, and both transport tests pin its exact five-key
shape. The forged `bound_task` regression passes each serialized acknowledgement and verified read
through the same non-containment assertion.

## Injection Budget

`collaboration packet build` is the first caller-reachable, budget-overridable injection path in
the program: before this row every packet was built by a Host step inside an already-gated round,
and `budget_estimated_tokens` had no caller who could name it. The default remains the frozen
`COLLABORATION_CONTEXT_BUDGET_ESTIMATED_TOKENS` (1,500), and the upper bound is now enforced in
the core builder (`src/core/collaboration/context-packet.ts`) rather than at this surface, so every
current and future caller inherits the cap from one place. Asking for less is a caller's business;
asking for more is refused with a typed `collaboration_invalid`, covered at the builder
(`tests/unit/collaboration-context-packet.test.ts`) and through the CLI
(`tests/cli/collaboration.test.ts`).

## Evidence Links

- Checks: `.ai/harness/checks/latest.json`
- Run snapshots: `.ai/harness/runs/`
- Architecture acceptance: `event.orchestrator-approval-20260830-c7-collaboration-architecture`,
  `changeset.docs-projection-c7-collaboration-surface-b`, reason codes `entrypoint-changed`,
  `ownership-changed`, `relation-changed`, `responsibility-changed`,
  `verified-flow-proof-changed`, affected `capability.runtime-harness.collaboration`,
  `capability.runtime-harness.delegated-runs`, `capability.runtime-harness.mcp-sidecar`. Applied
  through the same internal-API route C1-C6 recorded as tool debt
  (`ProjectionRequestV1.acceptedChange` still has no production caller); the ordinary apply then
  converged the manifest and `check --json` returns `noop` at exit 0. The collaboration module doc
  reports `Proof: proven`, selectors `48/48`.

## Promotion Filter

Promote a candidate to `tasks/lessons.md`, `docs/researches/`, or harness asset files only when all three hold: hard to reverse, surprising without local context, and a real trade-off existed. If any one is missing, keep it in this notes file instead.

## Promotion Candidates

- Promote to `tasks/lessons.md` only after a repeated correction or failure pattern.
- Promote to `docs/researches/` only when it is durable repo knowledge with evidence.
- Promote to harness asset files only after verification across more than one task or fixture.
- Promoted to `tasks/lessons.md`: an archcontext flow step whose evidence edge passes through a
  closure, and a flow step crossing to a capability with no declared relation, both make the
  capability's proof `unprovable` and silently consume a major-change acceptance without
  applying. Same class as C6's self-edge lesson, different two triggers; hard to reverse (a wasted
  approval event plus a stale durable receipt that short-circuits the retry to `noop`), surprising
  without local context (the refusal names neither the step nor the missing relation), and the
  trade-off is real — the callback in question exists so the collector's double read stays a
  double read.
