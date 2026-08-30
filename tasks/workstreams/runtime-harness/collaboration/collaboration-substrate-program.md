# Workstream: Collaboration substrate program (C0-C9)

> **Status**: active
> **Capability ID**: `runtime-harness-collaboration`
> **Functional Block**: `src/core/collaboration`
> **Matched Prefix**: `src/core/collaboration`
> **Architecture Domain**: `runtime-harness`
> **Architecture Capability**: `collaboration`
> **Architecture Module**: `docs/architecture/modules/runtime-harness/collaboration.md`
> **Source Plan**: plans/plan-20260830-0858-c5-taskfreeze-succession-integration.md
> **Current Slice**: todo-01
> **Last Handoff**: `.ai/harness/handoff/current.md`
> **Architecture Request**: docs/architecture/requests/archive/2026/runtime-harness-collaboration.md

## Purpose

Durable C0-C9 progress for the collaborative work exchange program
(`plans/sprints/20260828-2321-collaborative-work-exchange-agent-succession.sprint.md`,
Child PRD A `plans/prds/20260828-2321-collaboration-substrate.prd.md`).

C0 carried this ledger inside its freeze record because the capability registry
refuses a workstream directory that no declared capability owns, and a
capability node needs source prefixes that exist. C1 creates
`src/core/collaboration/` and registers the node, so the ledger moves here and
the freeze record keeps only a pointer.

## TODOs

- [x] C0: two-plane authority freeze -- architecture request accepted, D1-D12 frozen, baseline authority-enumeration contract test in place, zero `src/` change.
- [x] C1: `CoordinationSignalV1` schema, `src/core/collaboration/common.ts`, append-only store; capability node registered, architecture module projected, this ledger moved out of the freeze record, `collaboration.mode` wired to `off`, and the deferred closed inclusion scan landed.
- [x] C2: signal threads, discovery and hotspot projection -- deterministic thread aggregation on exact opaque keys, the capped integer hotspot function, the closed structural opportunity set, `RelevantSignalV1` retrieval with the 60/40 exploitation/exploration quota, and `CollaborationContextPacketV1` inside the 1,500 estimated-token budget. Pure read model: no store, no cache, no clock, no new protocol. `snapshot_consistency` is reserved on the packet and injected by the future store reader (C6); a pure projection over an already-assembled signal array cannot observe a torn or partial read, so deriving it is deferred with the collector.
- [x] C3: `WorkStateHandoffV1`, `HandoffExecutionContextV1` and `HandoffAdoptionReceiptV1` with their two append-only stores; adoption is non-exclusive by identity, and the store mechanics all three record families share moved into `record-store.ts` / `actor.ts`.
- [x] C4: `CollaborationDelegationAdmissionV1` bridge and the `CollaborationContributionDraftV1` / `CollaborationContributionCommitV1` collector. `max_parallel_readers` is a runtime constraint for the first time: three real parallel readers in separate processes admitted, a fourth real request rejected, terminal readers releasing their seat, and `reconciliation_required` or unreadable readers failing the window closed per D6.
- [x] C5: TaskFreeze / explicit takeover succession integration -- `src/effects/collaboration/succession.ts` joins the two planes: the `bound_task` execution context is derived from the persisted `TaskFreezeReceiptV1` on publish and re-derived and compared on read, a dirty bound executor is refused succession until it freezes, and a successor gets a write path only from a live Claim the existing release / takeover / acquire lifecycle granted. No new protocol, no new store, no successor field, no second destination resolver.
- [x] C6: collaboration-centric Work Exchange and ContextPacket, with the D3 binding gate -- `CollaborativeWorkExchangeSnapshotV1` over the real stores with `snapshot_consistency` derived from a double-read of every mutable source, C2's `CollaborationHandoffFactV1` seam filled from real C3 handoff and adoption records, existing `EngineerOfferV1` records carried through with their `offer_revision` untouched, and `CollaborationRunContextBindingV1` implemented as a fail-closed dispatch fence — `assertCollaborationDispatchBinding()` refuses a missing, dangling, digest-mismatched or unsplittable binding. Refusal coverage, stated exactly: `binding_missing`, `binding_context_packet_unresolvable` and `binding_composed_goal_stale` are reached through the honest path (a run with no binding, a packet deleted after recording, and a run admitted with a different goal); `binding_goal_not_composed` is unreachable that way, because the composed-goal digest check fires first, so it is tested against a hand-built binding driving the pure check directly. The remaining codes (`binding_dispatch_mismatch`, `binding_intent_stale`, `binding_execution_packet_stale`, `binding_rendered_context_stale`, `binding_base_goal_stale`) are unreached by any current test: the binding is keyed by dispatch and built from live records, so the recorder refuses before persisting rather than letting a mismatching binding exist. The fence is not yet wired: it has zero production callers, and the only dispatch path (`dispatchDelegatedRun()`, reached from `src/cli/commands/delegation.ts:185`) never consults it, because the CLI surface is C7's row. **Forward constraint: C7's collaboration dispatch surface MUST call `assertCollaborationDispatchBinding()` before `dispatchDelegatedRun()` — shipping a dispatch path without it recreates the exact failure this row exists to prevent.** Both C4/C5 obligations adjudicated: `execution_context` is verify-or-exclude through `resolveBoundTaskSuccession()`, and the `delegated_worker` adoption refusal stays with the Host as the adopting actor.
- [x] C7: CLI/MCP and bounded context injection -- one shared authenticated Engineer surface backs the CLI and the exact MCP inventory; actor, destination and recorded time remain Host-derived, every mutation is mode-gated, collaboration dispatch reaches C6's binding fence immediately before the sole production `dispatchDelegatedRun()` call, and context injection preserves the canonical untrusted markers under the frozen 1,500-token cap. Every handoff read enters through the verified Work Exchange projection, while publication returns an identity-only acknowledgement so a caller-supplied `execution_context` cannot masquerade as proven on any serialized egress. CLI and MCP pin that acknowledgement's exact shape and the forged-context regression covers publication plus every read surface.
- [x] C8: read-only Operator collaboration surface -- `OperatorCollaborationSnapshotV1` in `src/core/operator/collaboration-snapshot.ts` as the sibling of the existing Fleet transport view, one new GET route at `/api/v1/collaboration/{repository_id}/snapshot`, and lanes, discoveries, handoffs with adoption counts, hotspots and contributors rendered under the existing attention-first detail pane. Three things the projection removes and why: `execution_offers`, because offer eligibility needs an `EngineerPrincipalV1` the board does not have and C6 requires a reader precisely so an empty list cannot be mistaken for "nothing to pick up"; `snapshot_sha256`, because it is the digest of a document containing that unasked-for list, with `source_snapshot_sha256` carried instead; and every `execution_context` branch below its discriminant, because a proven `bound_task` still names a Claim id and freeze digest a browser has no use for, while `null` and `'none'` stay distinct facts in both the payload and the copy. The write boundary is now structural: `OPERATOR_ROUTES` declares the whole surface with one `write: true` entry, and the test asserts the inventory as well as the live 405. Redaction is proven at the HTTP boundary against a real collaboration store whose repository root is an absolute temp path and whose handoff carries a forged Claim. **The sprint row's "当前 writer" is deliberately not in this panel: the collaboration snapshot has no writer concept, the delivery-plane writer is the Lease owner the worklist already shows, and deriving one here would be the client-side semantic inference the row forbids.** No architecture acceptance event: `check --json` planned only the manifest restamp with `affectedNodeIds: []`.
- [ ] C9: real multi-agent canary and multi-seat decision.

## Notes

- Frozen decisions D1-D12 stay in
  `docs/researches/20260829-c0-collaboration-two-plane-authority-freeze.md`.
  Later rows read them; they do not re-derive them, and a revision supersedes
  that record rather than editing it silently.
- `src/core/collaboration/common.ts` is frozen after C1. C2-C9 consume the actor
  union, scope refs, artifact refs, record identity and recorded time without
  editing them; two writers in `src/core/collaboration/` at once is forbidden by
  the sprint's parallelism rules.
- `collaboration.mode` is `off` in `.ai/harness/policy.json`. Promotion is
  `off -> shadow -> active` with no skipped state, and Gate 1 in the sprint says
  what shadow requires.
- The C1 architecture acceptance is recorded, not implied. `capability.runtime-harness.collaboration`
  is a `node-added` major change, accepted 2026-08-29 with changeSetId
  `changeset.docs-projection-eb1d7ac0475d1b2b`, eventId
  `event.user-approval-20260829-c1-collaboration-architecture` and reason codes
  `node-added` / `relation-changed`. `repo-harness architecture-projection` has
  no acceptance verb, so the delta was applied through the internal
  `runArchitectureProjection` API; that tool debt is in `tasks/todos.md` and the
  full invocation evidence is in
  `tasks/notes/20260829-2137-c1-coordination-signal-store.notes.md`. C2-C9 add no
  capability, so the next row to need this path is the first one outside this
  program.
- C2 declared no new archcontext entrypoint. Adding one to
  `capability.runtime-harness.collaboration.yaml` classifies as
  `unresolved-major-change` (`entrypoint-changed`, `responsibility-changed`) and
  would need the same acceptance path C1 recorded as tool debt above. C2 changed
  only `extensions.verification` and let the source size bucket move
  (`2-5 files / 1000-2000 lines` -> `5-10 files / 2000-5000 lines`), which the
  projection applies automatically. Declaring the C2 entrypoints is available as
  a separate architecture slice whenever that acceptance verb lands.
- The C3 seam is `CollaborationHandoffFactV1` in
  `src/core/collaboration/thread-projection.ts`: `{thread_key, handoff_id,
  adoption_count}`, injected as a collection that defaults to empty. C3 fills it
  from real handoff and adoption records without changing C2.
- The `CollaborationHandoffFactV1` seam above is still unfilled after C3, and
  that is deliberate rather than an omission. C3 delivered the handoff and
  adoption stores; nothing in `src/` constructs a handoff fact from them, and
  only the C2 tests supply literals. C3's scope excluded the context-packet
  builder and every thread/hotspot file, and Child PRD A puts the store reader
  in C6, so C6 is the row that joins `listWorkStateHandoffs()` and
  `listHandoffAdoptionReceipts()` onto the projection. Treat the C2 note's
  "C3 fills it" as the expectation at the time it was written, not as landed
  state.
- C3 extracted the durable create-once publish protocol and the server-side
  actor derivation out of `signal-store.ts` into
  `src/effects/collaboration/record-store.ts` and `actor.ts`. C4-C9 add their
  stores on top of those two modules; a fourth hand-copied publish path is the
  thing to reject at review. `tests/helpers/collaboration-store-fixture.ts` is
  the shared three-actor disposable repository for the same reason.
- Adoption is non-exclusive, and it is non-exclusive *by identity*: the receipt
  id is `derive(handoff_sha256, adopter_actor_sha256, context_packet_sha256)`, so
  two adopters differ in one term and neither can exclude the other. C5 wires
  succession onto `TaskFreezeReceiptV1` and the existing release / takeover /
  acquire lifecycle; it must not reach for an adoption receipt to decide who may
  write.
- Knowledge adoption never uses the delivery plane's ownership vocabulary. The
  term for a handoff nobody has picked up is `unadopted_handoff`, and
  `tests/unit/collaboration-handoff.test.ts` enforces that lexically over the C3
  surface. The one allowed exception is `claim_id` inside the `bound_task`
  execution-context branch, which references a real Task Claim.
- C4 extended the admission critical section one step past D5's list, through
  `prepareDelegatedRun()`. A seat is only observable once an intent exists, so
  releasing the lock at the admission would let four concurrent requests each see
  an empty window at a limit of three. Any later row that adds another admission
  path must keep counting and seat creation in one section. Recorded as a D5
  addendum in the C0 freeze record.
- D7's negative proof is now a machine assertion rather than a recorded `rg`:
  `tests/effects/collaboration-admission-bridge.test.ts` proves
  `delegated-run-store.ts` still contains none of `delegation_policy`,
  `allowed_roles` or `max_parallel_readers`, and that the bridge contains the
  last two. C5-C9 must not move the policy check into the delegation plane.
- The collaboration stores take a `CollaborationAuthorizationV1` union rather
  than an authorization id, so a contribution publishes under a
  `delegated_worker` actor the Host derives from the persisted run. C5-C9 consume
  that union; adding a third actor kind means adding a branch there and a member
  to the D4 matrix, not a nullable field.
- Worker-derived signals and handoffs are staged under
  `contribution-candidates/<run_ref>/` and become publicly readable only when
  their contribution commit promotes them by `link`. `listCoordinationSignals()`
  and `listWorkStateHandoffs()` never open that area, so C6-C8 need no
  commit filter to avoid uncommitted records — and must not add one, because a
  filter would re-create the reader-side obligation this replaced. Direct
  Module Engineer publications pass the `public` destination and are visible
  immediately, unchanged.
- Write destination is bound to actor kind at a single enforcement point,
  `authorizeCollaborationDestination()` in `record-store.ts`; it is the only
  producer of the branded value `collaborationDestinationPaths()` accepts. C5-C9
  get the binding for free on any new store, and must not add a second
  destination resolver that skips it. `module_engineer` writes public only;
  `delegated_worker` writes only its own run's candidate area. The adoption store
  has no destination and refuses `delegated_worker` outright until a row wires it.
- The contribution transaction converges by construction, not by a resume marker:
  every identity is derived from the run, so re-running the whole collector is
  the recovery path. A later row that adds a step to it must derive that step's
  identity the same way, or the convergence proof in
  `tests/effects/collaboration-contribution-collector.test.ts` stops covering it.
- C4 declared `relation.collaboration.delegated-runs` and
  `flow.collaboration.delegated-contribution`. Both AXR7 inventory pins in
  `tests/architecture-projection-e2e.test.ts` moved with them (relations 39 to
  40, flows 25 to 26); that suite is not in the acceptance path, so run it
  explicitly on any row that touches `.archcontext/model/**`.
- C5 elects nobody, and the code says so structurally rather than in prose.
  `handoffSuccessionRequirement()` is a total function over
  `HandoffExecutionContextV1`: the `bound_task` branch needs execution authority
  and every other branch is `knowledge_only`. Read-only participant succession
  therefore needs no takeover *by kind*, not by a rule someone could relax, and
  the bound-executor path needs one for the same reason.
- The mismatch C5 closes was C3-shaped and could only be closed here. C3
  validated the `bound_task` branch's shape -- six well-formed references,
  present together or not at all -- and a valid-looking record could still name a
  freeze receipt that does not exist or describes different bytes. Closing it in
  the schema layer would have meant importing the freeze store into
  `src/core/collaboration/`, inverting the direction D1 froze, so the cross-check
  lives in `effects` beside `admission-bridge.ts`. C6-C9 read succession through
  `resolveBoundTaskSuccession()`; a projection that trusts `execution_context`
  without it is reading unvalidated references.
- `publishBoundTaskSuccessionHandoff()` takes no `execution_context` parameter.
  That absence is the guarantee: derive on write so the bad record is
  unexpressible on the supported path, compare on read so a record from any other
  route is still refused. Both use one derivation, `boundTaskExecutionContext()`.
- The `delegated_worker` adoption refusal in `adoption-store.ts` stays closed
  after C5, and this is a decision rather than an omission. That comment names
  "C5 succession or C6 packets" as the row that unblocks it; C5 is not that row.
  Unblocking needs a decision about how a Worker adoption receipt becomes
  visible -- the adoption store has no destination, so a `delegated_worker`
  receipt would be publicly readable while no contribution commit references it
  -- and the receipt identity binds `context_packet_sha256`, which only the C6
  store reader can produce. C5's read-only succession path meanwhile completes
  with a `module_engineer` adoption, because the Host is the actor that delivers
  a packet, so nothing C5 owes is blocked by the refusal. C6 owns it.
- How succession composes with C4's admission rounds, for the row that wires it:
  a successor delegated run adopts before its round starts, never during. The
  order is adopt (collaboration plane, non-exclusive, zero seats) ->
  `admitCollaborationDelegation()` (counts the seat and creates it in one
  critical section) -> dispatch. Adoption takes no seat and must not be moved
  inside the admission critical section, which counts readers per parent claim
  and round index and would then serialize on an unrelated record. For a *bound*
  successor the ordering is stricter and one-way: the Claim comes from the
  delivery-plane lifecycle first, and only then does its round begin --
  `assertSuccessorExecutionAuthority()` reads the Claim and never the admission,
  so a round can never be the thing that grants a write path. C6 owns the wiring;
  C5 owns the ordering constraint.
- C5 declared no new archcontext entrypoint, and the projection agreed: with the
  model untouched, `architecture-projection check --json` planned exactly two
  renderer outputs (`docs/architecture/.projection-manifest.json` and the
  collaboration module doc) for a source size-bucket move, `10-20` to `20-50`
  files. No `unresolved-major-change`, no relation to declare, no AXR7 pin to
  move. Declaring `entrypoint.collaboration.succession` with sinks into
  `src/effects/engineers/task-freeze-store.ts` would classify as
  `entrypoint-changed` plus `relation-changed` and need the same internal-API
  acceptance route C1, C3 and C4 recorded as tool debt; it is available as a
  separate architecture slice, on the same terms C2 deferred its own.

- C6 filled both seams C2 declared. `snapshot_consistency` is derived by the
  collector because it is the only layer that can observe a torn read: every
  mutable source is read twice and compared on canonical bytes, and the worst of
  the four observations wins. The snapshot is built from the second read, never
  from a merge -- a merged set is one no single moment contained, and
  `source_snapshot_sha256` would then identify a state that never existed.
- The split between failing closed and marking degraded is not a preference.
  Signals are what every projection is derived from, so an unreadable signal
  shard leaves nothing to describe and the collection throws. Handoffs,
  adoptions and execution offers are additive: their absence leaves counts at
  zero, which reads exactly like "there are none", so the snapshot carries
  `degraded` and every consumer that builds injectable context refuses it. The
  mark is what stops a partial view being read as a complete one.
- Obligation 1 (carried from C4/C5) is closed as **verify-or-exclude**. A
  persisted `bound_task` context is shape-checked only, so the delegated-worker
  contribution path can write any Claim id, lease generation and freeze digest.
  Every C6 surface that would expose one runs `resolveBoundTaskSuccession()`
  first; a branch that does not prove is withheld and counted in
  `unverified_execution_context_count`. Flagging was rejected: it leaves the
  unproven value in the read model and makes every downstream reader responsible
  for remembering to check a boolean, which is the shape the fail-closed rule
  exists to prevent. The handoff's knowledge still projects, because the
  knowledge was never the forged part.
- Obligation 2 is closed as **the refusal stays, with corrected wording**. C6
  makes the Host the adopting actor: it builds the packet, composes it into the
  goal and records the binding, so a `module_engineer` adoption on behalf of a
  worker round is who the context was handed to. A Worker-authored receipt would
  be a public record with no commit reference -- the inversion of C4's
  visibility boundary -- and would carry weaker provenance than the binding,
  which is derived from the persisted intent and envelope rather than from the
  Worker's own account. Round continuity does not need it.
- The binding is additive and the Delegation protocol is untouched.
  `intent.context_packet_sha256` keeps the ExecutionPacket meaning C0's D2 froze,
  and is cross-checked against the envelope rather than reinterpreted. Goal
  composition is deliberately reversible: the fence splits the dispatched goal
  back into base and rendering and compares both, so it checks the block actually
  embedded rather than a digest of something it never saw. A base goal carrying
  the untrusted markers is refused rather than escaped, which is what keeps the
  split total.
- C6 declared the entrypoints C2 and C5 deferred, in one acceptance event
  (`event.orchestrator-approval-20260830-c6-collaboration-architecture`). One
  trap worth keeping: an intra-capability flow step written as
  `from: collaboration to: collaboration` produces `relation-binding-missing`
  for every such step, which makes the capability `unprovable`, which makes
  `classifyArchitectureMajorChange()` discard a valid `acceptedChange` and return
  `human-action-required` with no diagnostic. The existing flows already route
  those steps through the `component.collaboration.primary` participant; the fix
  is to match them. Diagnosis came from instrumenting the compiler in a throwaway
  `node_modules` patch, reverted and `shasum`-verified against a pre-patch copy.

- Keep architecture facts in
  `docs/architecture/modules/runtime-harness/collaboration.md`; keep execution
  progress here.
