> **Archived**: 2026-08-30 18:33
> **Related Plan**: plans/archive/plan-20260830-1344-c8-read-only-operator-collaboration-surface.md
> **Outcome**: Completed
> **Lifecycle**: notes
> **Parent Run ID**: run-20260830-1833

# Implementation Notes: c8-read-only-operator-collaboration-surface

> **Status**: Active
> **Plan**: plans/plan-20260830-1344-c8-read-only-operator-collaboration-surface.md
> **Contract**: tasks/contracts/20260830-1344-c8-read-only-operator-collaboration-surface.contract.md
> **Review**: tasks/reviews/20260830-1344-c8-read-only-operator-collaboration-surface.review.md
> **Last Updated**: 2026-08-30 13:45
> **Lifecycle**: notes

## Design Decisions

- **The projection is a sibling of `fleet-snapshot.ts`, not a new layer.** The
  repository already had the exact seam this row needs: a `src/core/operator/`
  module that takes a canonical read model and removes what must not cross HTTP,
  classifying nothing and recounting nothing. `collaboration-snapshot.ts` is that
  seam applied to C6's collection, so the row adds no third layer and gives the
  collaboration plane no browser concern.
- **`execution_offers` is excluded, not emptied.**
  `collectCollaborativeWorkExchange()` requires an offer reader precisely so that
  an empty list cannot be read as "there is nothing to pick up" when the fact is
  "nobody asked", and offer eligibility needs an `EngineerPrincipalV1` the board
  does not have. The effect therefore passes a reader returning no offers and the
  projection drops the field entirely; the empty list never reaches a reader. A
  reader that threw was rejected because it would mark the source `degraded` and
  claim the offers were unreadable, which is a different and false statement, and
  would put a permanent degraded banner on every board read.
- **`snapshot_sha256` out, `source_snapshot_sha256` in.** The former is the digest
  of a document containing that unasked-for offer list, so two callers reading
  identical store contents would disagree about it. The latter identifies the
  signal set every projection was derived from and is stable across callers. The
  Fleet transport view already publishes the source digest rather than a digest of
  the redacted document, for the same reason.
- **A handoff's `execution_context` is reduced to its discriminant.** C6 already
  applied verify-or-exclude, so a surviving `bound_task` branch is proven — but a
  proven branch still names a Claim id, a lease generation and a freeze receipt
  digest that a browser has no use for. `null` and `'none'` are kept apart in the
  payload and in the copy: `'none'` is a handoff that declared no context, `null`
  is a `bound_task` whose proof did not hold, and the snapshot's
  `unverified_execution_context_count` counts only the second.
- **A separate GET route, not an extension of the Fleet snapshot.** Collaboration
  state is per repository and lives in the Git common directory while the Fleet
  route is fleet-wide, so folding one into the other would double-read four stores
  per registered repository on every board refresh and would merge collaboration
  store health into the Fleet snapshot's own `snapshot_consistency` — the exact
  conflation the fail-loud rule exists to prevent.
- **The write inventory is a value, not an inference.** `OPERATOR_ROUTES` makes
  "the task message is the only write" structural. Probing a running server proves
  how the routes that exist behave; it cannot prove which routes exist, so a new
  route added without declaring it is caught by the same test that counts writes.
- **Capability is not re-derived.** An `engineer_id` encodes
  `capability.<domain>.<name>`, but parsing it in the operator plane would be a
  shadow parser for an id the engineers plane owns. The participant's
  `actor_lineage` already carries that identity verbatim and is surfaced as the
  opaque string it is.
- **Scope is the selected task's repository.** The collaboration store is per
  repository, so the read is driven by the selected card rather than by a default
  the board would have to invent, and `idle` is kept distinct from an empty
  snapshot: the first says nothing has been read, the second says the store was
  read and holds nothing.
- **The HTTP response is pinned as an egress shape.** C7's final review established
  that safety follows serialized field sets rather than read/write operation names.
  C8 therefore pins the exact top-level snapshot keys and the exact handoff keys on
  the real HTTP route, then proves that every value in a structurally valid but
  unverifiable `bound_task` branch is absent from the serialized response. This
  keeps the Operator boundary aligned with verify-or-exclude even if a future
  source record grows new fields.

## Deviations From Plan Or Spec

- **The sprint row's "当前 writer" is not rendered in the collaboration panel.**
  The collaboration snapshot carries no writer concept; the delivery-plane writer
  is the Lease owner, which the Fleet worklist and task detail already show from
  their own authority. Deriving a writer from participants or offers would be the
  client-side semantic inference the row's acceptance line forbids. What the panel
  does show is each participant's participation form (`module engineer` /
  `delegated worker`), which is the collaboration plane's own answer to "who is
  here". The row's machine acceptance names lanes, discoveries, handoffs, hotspots
  and contributors, all of which are rendered.
- **Contract scope was widened during execution, and recorded.** The new core
  module exports a `*_PROTOCOL`, which C1's closed inclusion scan requires to be
  adjudicated; `tests/unit/collaboration-authority-baseline.test.ts` and the C0
  research section it names were added to `allowed_paths` with the reason inline.

## Tradeoffs Considered

| Option | Decision | Reason |
|--------|----------|--------|
| Empty offer list vs dropping the field | Drop | An empty list rendered as "no work available" is the board answering a question it never asked on any Engineer's behalf |
| Offer reader that throws vs one returning nothing | Returns nothing | A throw marks the source `degraded`, which claims the offers were unreadable rather than unrequested, and poisons every read with a false banner |
| Proven `bound_task` branch verbatim vs its discriminant | Discriminant | The proof makes the branch true, not useful; the Claim id and freeze digest have no browser consumer and the count already reports the withheld ones |
| New GET route vs extending the Fleet snapshot | New route | Per-repository cost and a separate consistency axis; merging them would hide collaboration store health inside the Fleet snapshot's mark |
| New `_PROTOCOL` value vs carrying `COLLABORATION_PROTOCOL` | Carry the source | The document is a redaction, not a second wire identity; the literal is restated for the browser bundle and typed against the source so a bump fails typecheck |
| Panel above the worklist vs inside the detail pane | Detail pane, below the task's own facts | Attention-first ordering is the board's whole shape; collaboration is context for a decision the worklist already surfaced |

## Open Questions

- The panel is scoped by the selected task's repository, so a fleet-wide view of
  which repositories have active lanes does not exist. Whether that is wanted is a
  question for the C9 canary, which is the first run that will have real lanes in
  more than one repository.

## Evidence Links

- Checks: `.ai/harness/checks/latest.json`
- Run snapshots: `.ai/harness/runs/`
- Architecture: no acceptance event was needed.
  `repo-harness architecture-projection check --json` planned only
  `docs/architecture/.projection-manifest.json` with `affectedNodeIds: []` and
  `humanActions: []`, so `event.orchestrator-approval-20260830-c8-collaboration-architecture`
  was not recorded. `src/core/operator/**` and `src/effects/operator/**` belong to
  no capability node, exactly as the whole operator board has since C0, and this
  row claimed no new ownership boundary. The first `apply` returned
  `expected snapshot mismatch after projection: worktreeDigest` because the apply
  writes the manifest it is being measured against; the second converged and
  `check --json` then returned `noop` at exit 0.

## Promotion Filter

Promote a candidate to `tasks/lessons.md`, `docs/researches/`, or harness asset files only when all three hold: hard to reverse, surprising without local context, and a real trade-off existed. If any one is missing, keep it in this notes file instead.

## Promotion Candidates

- Promote to `tasks/lessons.md` only after a repeated correction or failure pattern.
- Promote to `docs/researches/` only when it is durable repo knowledge with evidence.
- Promote to harness asset files only after verification across more than one task or fixture.
