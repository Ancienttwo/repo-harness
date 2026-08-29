# Architecture Module: runtime-harness/collaboration

> **Capability ID**: `runtime-harness-collaboration`
> **Functional Block**: `src/core/collaboration`
> **Matched Prefix**: `src/core/collaboration`
> **Domain**: `runtime-harness`
> **Capability**: `collaboration`
> **Status**: boundary accepted in C0; no source exists yet

Human-authored boundary record. It is not an ArchContext projection: the
`capability.runtime-harness.collaboration` node is registered in C1 together with
the first real `src/core/collaboration` source files, and ArchContext replaces the
machine sections of this document from that point on.

## Boundary

- Responsibility: an append-only publish/discover plane for collaboration
  observations, knowledge handoffs and their deterministic projections. It holds
  no delivery authority.
- Entrypoints: `src/core/collaboration` (schemas and projections),
  `src/effects/collaboration` (stores, admission bridge, contribution collector).
- Runtime path: `$(git rev-parse --git-common-dir)/repo-harness/collaboration/v1/`.
- Local contracts: `none`, `none` (they land with the prefix in C1).

## Dependency Rules

- May read: Work Graph / Engineer offers, Claim and Lease state, publication and
  acceptance projections, delegation records, `TaskFreezeReceiptV1`.
- May not write: Task, Lease, Publication, Acceptance. Zero bytes, no exceptions.
- May not bump: `DelegationEnvelopeV1` / `DELEGATION_PROTOCOL`. Collaboration
  provenance is carried by the additive `CollaborationRunContextBindingV1`.
- May not influence: Work Graph priority, dependency edges, Task state, Lease
  eligibility. Hotspot score orders discovery and context selection only.
- Must reuse: `src/core/messages/mechanics.ts` for exact-key validation, bounded
  UTF-8, canonical bytes and digests; `src/effects/locking/exclusive-directory-lock.ts`
  for per-thread and per-handoff locks; the `WorkerResultV1` `{ ref, sha256 }`
  evidence-ref validator for `ArtifactRefV1`.
- Adds no Operator Board write route. The task-message POST route stays the only
  one.

## Frozen Decisions

`docs/researches/20260829-c0-collaboration-two-plane-authority-freeze.md` holds
D1–D12: the two-plane boundary, `context_packet_sha256` semantics, the run-context
binding gate, the P0 actor support matrix, the delegation policy bridge design,
the admission decision table and its test vectors, the baseline negative proof,
the `ArtifactRef` reuse decision, store roots / locks / canonical JSON, feature
flags and degradation, the P0 multi-seat refusal, and the Review/Merge
zero-change rule.

## Verification

- `bun test tests/unit/collaboration-authority-baseline.test.ts --timeout 60000`
- Root required checks in `CLAUDE.md`.

## Active Workstreams

- `tasks/workstreams/runtime-harness/collaboration/20260829-collaboration.md`
