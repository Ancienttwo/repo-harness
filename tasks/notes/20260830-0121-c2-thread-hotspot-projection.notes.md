# Implementation Notes: c2-thread-hotspot-projection

> **Status**: Active
> **Plan**: plans/plan-20260830-0121-c2-thread-hotspot-projection.md
> **Contract**: tasks/contracts/20260830-0121-c2-thread-hotspot-projection.contract.md
> **Review**: tasks/reviews/20260830-0121-c2-thread-hotspot-projection.review.md
> **Last Updated**: 2026-08-30 02:05
> **Lifecycle**: notes

## Design Decisions

- **The epoch is the source set's own latest event.** `projectCollaborationThreads()`
  derives `epoch_at` as the maximum `created_at` over the signals handed to it and
  measures every recency term as an integer bucket of `epoch_ms - latest_ms`. The
  packet has no `built_at` field at all rather than a field excluded from the
  digest, so there is no wall-clock input anywhere to forget to exclude.
- **The latest timestamp is chosen by string, not by scan order.** Two records can
  carry the same instant in different spellings (`…:05Z` and `…:05.000Z`).
  `latestTimestamp()` takes the smallest spelling among the records at the maximum
  instant, so the projection does not depend on the order the caller happened to
  pass its array. This is what makes the reversed-array determinism test pass.
- **Scoring is integer-only with per-dimension caps.** A float weight would put a
  platform-dependent decimal expansion inside `thread_sha256`. The caps make
  `COLLABORATION_HOTSPOT_SCORE_MAX` a real bound, which is what lets the packet
  quota promise that the hottest lane cannot buy the whole window.
- **Cross-lane edges count for both endpoints and only when resolvable.** Being
  cited from another lane is as much a reason to look as citing one. A reference
  the snapshot cannot resolve is not evidence of a link between two lanes it can
  see, so it is skipped rather than counted as a phantom edge.
- **`exploration_slot` is the residue by construction.** A lane that triggers no
  structural opportunity reason is exactly the lane heat would never surface, so
  it becomes the exploration pool. Every lane therefore carries at least one
  opportunity, which is a checkable invariant instead of a threshold to tune.
- **Retrieval matches on scope identity and discloses the observed revision.**
  Requiring an exact revision match would hide every earlier observation about the
  same subject, which is the context a newcomer most needs; equating revisions
  silently would be worse. `matched_refs` carries the signal's own ref, revision
  included, so the reader sees which revision each observation was made at.
- **Reserved lanes sort first inside the exploration pool.** Pooling alone did not
  deliver Child PRD A's fixed slot for low-coverage lanes and unadopted handoffs:
  a busy lane that merely fell outside the hot top-K lands in the same pool and,
  being evidence-dense, outranks the quiet lane the reservation exists for. The
  `reserved` sort key is the fix; every reserved candidate is in the exploration
  pool by construction, so the key reorders nothing on the exploitation side.
- **The budget is charged per rendered line, and pools do not spill.** Per-signal
  costs are additive and `sum(ceil(x/4)) >= ceil(sum(x)/4)`, so charging the
  envelope once and each accepted line separately is conservative: the whole
  rendered text is provably inside the declared budget. Exploration never lends to
  exploitation, which is what makes the quota real rather than advisory.

## Deviations From Plan Or Spec

- **`CollaborationThreadSnapshotV1` carries two fields the PRD sketch does not
  list**: `artifact_ref_count` and `recency_rank`. Both are counts a reader could
  make by hand from the committed records, which is the PRD's own admission rule
  for this snapshot, and both are needed by named C2 tasks — artifact density is a
  declared hotspot input and the source of `artifact_rich_thread`, and the rank is
  the epoch-relative recency the acceptance line asks to be visible.
- **The plan's allowed surface named archcontext capability entrypoints for the
  three new modules; those were not declared.** Adding entrypoints and
  responsibilities to `capability.runtime-harness.collaboration.yaml` makes
  `repo-harness architecture-projection check` return
  `human-action-required` / `unresolved-major-change` (reason codes
  `entrypoint-changed`, `responsibility-changed`) and pulls eight files including
  the global diagrams into an adoption round. Declaring an entrypoint is an
  architecture-model decision, not read-model execution, so this row keeps to the
  auto-appliable surface: the capability's `extensions.verification` list gains
  the three new test files, and the projection re-render is applied and committed.
  Declaring the C2 entrypoints stays available as a separate architecture slice.
- **The plan capture dropped sprint row 3's last task, `snapshot_consistency`.**
  The sprint asks C2 to mark a source set that changed during collection
  (`changed_during_read`) or whose shard was unreadable (`degraded`); the captured
  plan carried no task for it and the first implementation shipped without the
  field. Resolved by injection rather than derivation: `buildCollaborationContextPacket`
  takes a required `snapshot_consistency`, validated against the closed
  three-value set and carried into `PACKET_FIELDS` and the `packet_sha256`
  preimage. It is required rather than defaulted because `stable` is a positive
  assertion — nothing moved under the collector, no shard was unreadable — that
  the builder cannot observe; defaulting to it would fabricate an authority and
  seal the fabricated claim into the digest, and would leave the field with two
  semantics, since the parse path already fails closed on a missing key. A pure
  projection over an already-assembled array of
  committed signals cannot observe how that array was read, so the value comes
  from the store reader (C6) through the same seam `handoff_facts` uses. The shape
  is reserved now because the packet digests its own key set: adding the key after
  C6 persists packets would invalidate every stored digest, which is a protocol
  migration. Deriving the value stays C6's task; the marker's scope is the packet,
  matching the sprint wording — `CollaborationThreadSnapshotV1` has no such field
  in Child PRD A and the thread projection is untouched.
- **`tasks/lessons.md` was declared in `allowed_paths` after the fact.** The
  NUL-bytes-defeat-grep lesson came out of this slice's own gate findings, not
  from the planned surface, so the contract did not list the file and the ship
  gate's `allowed_paths` preflight rejected the first commit. Declared under the
  contract's own Scope gate ("update this contract before widening scope") rather
  than by dropping the lesson.
- **Sprint row 3 was not marked complete and the sprint file was not touched.** A
  sibling worker is landing C3 in parallel and the sprint backlog is a shared
  file; row completion belongs to the closeout that merges, not to either worker.

## Tradeoffs Considered

| Option | Decision | Reason |
|--------|----------|--------|
| Export a `CONTEXT_PACKET_PROTOCOL` / `THREAD_PROTOCOL` constant | Rejected | The three modules import `COLLABORATION_PROTOCOL` from the frozen `common.ts`, exactly as `signal.ts` does. No new protocol-owning module appears, so the closed `src/core/**` scan needs no new adjudication row and `FROZEN_INVENTORY_SHA256` does not move. Were they to own one they would be excluded anyway: a derived read model sits on no delivery plane (C-1) and a thread snapshot, a hotspot score and a context packet decide nothing for another agent about ownership, publication or acceptance (C-2). |
| Cache the thread projection under `threads/<digest>/current.json` | Rejected for P0 | Child PRD A rules it out unless the cache is rebuildable and bound to the source-set digest. With no measured pressure, a cache would only add a second, staler answer that could disagree with the records. |
| Accept `publication` and `free_topic` subject refs and match nothing | Rejected | The closed retrieval reason set has no code for them. A caller that asked for publication-scoped context and silently got a packet built as if it had asked for nothing would have no way to tell, so the builder refuses. Supporting them means extending the closed set, which is a protocol change. |
| Require an exact revision match for subject retrieval | Rejected | It would hide every earlier observation about the same subject. Matching on identity and disclosing the observed revision in `matched_refs` keeps the context useful without equating two revisions. |
| Stop filling a pool at the first candidate that does not fit | Rejected | Skipping and continuing packs the budget better and is equally deterministic under a total order. The consequence is that a lane can be starved by cost rather than by ordering, so the round-one test asserts per-pool spend against the quota instead of a per-lane slot count. |
| Reserve the fixed slot by pool membership alone | Rejected | It did not hold: twelve evidence-dense lanes outside the hot top-K shared the exploration pool with the single-voice lane and outranked it. The `reserved` sort key is what actually funds the reservation. |

## Open Questions

- Hotspot weights are a first cut. Child PRD A flags long-run hotspot stability as
  `[UNVERIFIED]` and defers re-weighting to the C9 canary; the caps and the
  integer shape are what this row commits to, not the specific numbers.
- `COLLABORATION_HOTSPOT_SELECTION_TOP_K = 3` decides which lanes earn the
  `hotspot` retrieval reason and therefore which land in the exploitation pool.
  Nothing yet measures whether three is the right number under real traffic.

## Evidence Links

- Checks: `.ai/harness/checks/latest.json`
- Run snapshots: `.ai/harness/runs/`
- Capability verification: `bun test tests/unit/collaboration-hotspot.test.ts tests/unit/collaboration-thread-projection.test.ts tests/unit/collaboration-context-packet.test.ts --timeout 60000`

## Promotion Filter

Promote a candidate to `tasks/lessons.md`, `docs/researches/`, or harness asset files only when all three hold: hard to reverse, surprising without local context, and a real trade-off existed. If any one is missing, keep it in this notes file instead.

## Promotion Candidates

- The archcontext entrypoint finding is a repeat-prone trap: adding an entrypoint
  or a responsibility to a capability node is a major architecture change that
  needs adoption, while an `extensions.verification` addition and a source size
  change re-render automatically. Promote to `tasks/lessons.md` if a second slice
  hits it.
