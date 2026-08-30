> **Archived**: 2026-08-30 13:19
> **Related Plan**: plans/archive/plan-20260830-1031-c6-collaborative-work-exchange-context-packet.md
> **Outcome**: Completed
> **Lifecycle**: notes
> **Parent Run ID**: run-20260830-1319

# Implementation Notes: c6-collaborative-work-exchange-context-packet

> **Status**: Active
> **Plan**: plans/plan-20260830-1031-c6-collaborative-work-exchange-context-packet.md
> **Contract**: tasks/contracts/20260830-1031-c6-collaborative-work-exchange-context-packet.contract.md
> **Review**: tasks/reviews/20260830-1031-c6-collaborative-work-exchange-context-packet.review.md
> **Last Updated**: 2026-08-30 11:40
> **Lifecycle**: notes

## Design Decisions

- **The collector is the only honest source of `snapshot_consistency`.** C2's
  builder refuses to synthesize it, and this row is why. Each mutable source is
  read twice and the reads are compared on canonical bytes rather than on record
  counts -- two reads that both return three records and disagree about one of
  them changed just as much as two reads of different lengths.
- **Fail closed on the primary source, mark the additive ones.** Signals are what
  every projection is derived from, so an unreadable signal shard yields no
  snapshot at all. Handoffs, adoptions and offers degrade instead: their absence
  leaves counts at zero, which reads like "there are none", and `degraded` is the
  mark that stops that reading. Delivery refuses any non-`stable` collection, so
  a degraded read can never become a Worker's context.
- **Obligation 1: verify-or-exclude.** `resolveBoundTaskSuccession()` runs for
  every `bound_task` handoff before any projection can expose one. A branch that
  does not prove is withheld and counted. Flagging leaves an unproven Claim id
  and lease generation in the read model and delegates the check to every
  downstream reader, which is the shape the fail-closed rule exists to prevent.
- **Obligation 2: the adoption refusal stays, with corrected wording.** C6 makes
  the Host the adopting actor. A Worker-authored adoption receipt would be a
  public record with no commit reference, inverting C4's visibility boundary, and
  it would carry weaker provenance than the run-context binding, which is derived
  from the persisted intent and envelope rather than from the Worker's account of
  what it received.
- **Reversible goal composition, so the fence checks the real thing.** The
  rendering is a suffix in its own untrusted wrapper and the markers are refused
  in the base goal, so a composed goal splits back into exactly its two parts.
  Without the split the fence could only compare digests of text it never saw,
  and a binding naming a rendering unrelated to the dispatched goal would still
  agree with itself.
- **The fence is a pre-step, not an edit to `dispatchDelegatedRun()`.** Same
  shape as C4's admission bridge: the delegation plane keeps one dispatch
  semantics, and the collaboration requirement is removable by deleting a module
  rather than by unpicking an existing function. It reuses the delegation plane's
  exported readers, so there is no second destination resolver.
- **Execution offers arrive through a seam.** Offer eligibility needs an
  `EngineerPrincipalV1`, the registry and the Work Graph. Resolving that inside
  the collaboration plane would be a second copy of the scheduling plane's
  resolution, so the caller supplies a reader and the collector only double-reads
  what it returns.

## Round-2 Corrections And The Sibling-Exit Sweep

Codex round 1 rejected two P1s and one P2, all in
`src/effects/collaboration/work-exchange.ts`. All three were real.

- **Cross-source stability was overclaimed.** The collector read each source
  twice back to back, which proves that source stable inside its own window and
  says nothing about the collection: with per-source windows that never overlap,
  signals could change after their window closed while handoffs were still being
  read, and the returned pair — a combination that never coexisted — was marked
  `stable`, which is an assertion about the whole set. Restructured to two full
  passes over every source, classified per source afterwards. Source `i` is now
  observed over `[t_i, t_{N+i}]`, and for any `i < j` the windows overlap on
  `[t_j, t_{N+i}]`, non-empty because `j < N + i` always holds. That pairwise
  overlap is the property `stable` now claims. What it does not claim is
  atomicity: a write landing after a source's final read is still invisible, and
  no finite number of passes closes that without a cross-store lock. Saying so is
  the point — the original bug was a stronger claim than the mechanism supported,
  and replacing it with a slightly weaker overclaim would repeat it.
- **The raw handoff exit was real and is closed.** The collection returned
  `handoffs: WorkStateHandoffV1[]` verbatim beside a snapshot that correctly
  withheld unverified `bound_task` contexts, so the exclusion was decorative for
  any consumer that reached for the field. Nothing in `src/` or `tests/` consumed
  it (verified by search before removal), so it is removed rather than replaced:
  `snapshot.open_handoffs` is the verified-or-null projection and `handoff_facts`
  is derived from it. A regression test asserts the forged Claim id appears
  nowhere in the serialized collection and pins the exact key set.
- **`binding_goal_not_composed` was untested and unreachable honestly.** The
  composed-goal digest check fires first, so the branch needs a binding whose
  `composed_goal_sha256` is the digest of an uncomposed goal — a record no
  producer here writes. Tested against exactly that, driving the pure check
  directly, with a companion assertion showing the ordering that makes it
  unreachable. The workstream ledger's "all four refusal modes are tested"
  sentence was false and now enumerates which codes are honest-path, which is
  forged-state-only, and which are unreached because the recorder refuses before
  persisting.

**Sibling-exit sweep.** This was the third occurrence of "guarded main path,
unguarded sibling exit" in the program (C3 receipt filter key, C4 destination
sibling API, C6 raw handoffs), so every C6 return surface was enumerated rather
than only the one reported.

| Surface | Verdict |
|---|---|
| `collection.handoffs` | **Fixed** — removed; it re-exported the contexts the snapshot excludes |
| `collection.signals` | Keep. Signals carry no `execution_context`, so no verify-or-exclude rule applies, and the cross-repository check runs inside `buildCollaborativeWorkExchangeSnapshot()` and throws — a collection that returns has already passed it. Required by the packet build |
| `collection.handoff_facts` | Keep. Derived from `snapshot.open_handoffs`, so it inherits both guards (superseded excluded, unproven context withheld) and carries no context of its own |
| adoption receipts | Never exposed; only their per-handoff counts reach the snapshot |
| `delivery.packet` / `rendered_context` / `composed_goal` | Keep. These are the guarded artifacts themselves; the packet's `handoff` field is an id plus digest, never handoff content |
| `deliverCollaborationContext` dropping C2's `build.projection` | Keep. Thread counts only, and it is not returned at all |
| `readCollaborationContextPacket`, `readCollaborationRunContextBinding`, `listCollaborationRunContextBindings` | Keep. Host-written records with no actor content and no execution context |
| `validateCollaborativeWorkExchangeSnapshot` | **Docstring fixed, behaviour unchanged.** It claimed every nested projection was re-validated "through C1 and C3"; only `execution_offers` actually is. It cannot re-run the proof — that resolves a `TaskFreezeReceiptV1` from an effect and this module is pure. The producer is the only guard point, and the comment now says that instead of implying a check that does not happen. A false claim about verification was the more dangerous half of this one |

The pattern behind all three occurrences: a guard is applied where the value is
*produced*, and a second accessor hands out the pre-guard value because it was
convenient at the time. The check that generalises is not "look for raw records"
but "for each guard, enumerate every path by which a caller can obtain the thing
the guard protects."

## Deviations From Plan Or Spec

- None recorded.

## Tradeoffs Considered

| Option | Decision | Reason |
|--------|----------|--------|
| `execution_context` verify-or-flag vs verify-or-exclude | Exclude | A flag keeps the unproven value readable and makes every consumer responsible for checking it; the repository's rule for an authoritative value that will not verify is to surface the failure, not to pass it along with a caveat |
| Worker-authored adoption receipt vs Host adoption | Host | The adoption store has no destination, so a Worker receipt would be public with no commit reference; the binding already proves delivery with stronger provenance |
| Degraded snapshot throws vs carries the mark | Additive sources carry the mark; the signal source throws | A degraded snapshot is still the honest Operator read for C8, but a snapshot over an unreadable signal set has no source identity to digest |
| Fence inside `dispatchDelegatedRun()` vs a collaboration pre-step | Pre-step | Keeps one dispatch semantics in the delegation plane and makes the collaboration requirement removable as a unit |
| One acceptance event for C6 vs a second for C5's deferred entrypoints | One | C6 was already paying for an `unresolved-major-change`; declaring `entrypoint.collaboration.succession` in the same round costs no extra approval |

## Open Questions

- The 100 Work Packages / 10 Engineers benchmark named in the sprint row's task
  list is not in this contract's acceptance set and was not run. Determinism is
  proven by byte identity rather than by scale.

## Evidence Links

- Checks: `.ai/harness/checks/latest.json`
- Run snapshots: `.ai/harness/runs/`
- Architecture acceptance: `event.orchestrator-approval-20260830-c6-collaboration-architecture`,
  `changeset.docs-projection-a0450291963ba16c`, reason codes `entrypoint-changed`,
  `relation-changed`, `responsibility-changed`, `verified-flow-proof-changed`,
  affected `capability.runtime-harness.bound-task-freezes` and
  `capability.runtime-harness.collaboration`. Applied through the internal-API
  route C1/C3/C4 recorded as tool debt (`ProjectionRequestV1.acceptedChange` has
  no production caller), returning `applied-reconcile-required` with
  `humanActions: []`; the ordinary apply then converged the manifest and
  `check --json` returns `noop` at exit 0. The module doc reports `Proof: proven`.

## Promotion Filter

Promote a candidate to `tasks/lessons.md`, `docs/researches/`, or harness asset files only when all three hold: hard to reverse, surprising without local context, and a real trade-off existed. If any one is missing, keep it in this notes file instead.

## Promotion Candidates

- Promote to `tasks/lessons.md` only after a repeated correction or failure pattern.
- Promote to `docs/researches/` only when it is durable repo knowledge with evidence.
- Promote to harness asset files only after verification across more than one task or fixture.
- Promoted to `tasks/lessons.md`: an intra-capability archcontext flow step
  written as `from: <capability> to: <same capability>` silently discards a valid
  architecture acceptance. Hard to reverse (a wasted approval event), surprising
  without local context (the refusal names no diagnostic), and the trade-off is
  real (the component participant exists precisely for these steps).
