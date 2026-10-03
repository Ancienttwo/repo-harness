# Review: Persistent Module Engineer ME-0A Focused Approval

> **Status**: Approved
> **Reviewed At**: 2026-08-24T20:50:06+0800
> **Reviewer**: ChatGPT Pro through GitHub Connector
> **Repository**: `Ancienttwo/repo-harness`
> **Branch**: `codex/persistent-module-engineer-prd-review`
> **Subject Commit**: `b54a43d88cbae5e8c71db1de1ee5605b2ec1403e`
> **Compared Range**: `d29ecce2cf064d65116fa999e642b99ea20014aa..b54a43d88cbae5e8c71db1de1ee5605b2ec1403e`
> **Source Chat**: `https://chatgpt.com/c/6a88a65f-c454-83e8-b633-9449596d418a`

## Verdict

```text
Overall: APPROVE
Umbrella: APPROVED
ME-0A: APPROVED by focused external review
Implementation: MAY START after mechanical status promotion
All other children: REMAIN DRAFT
```

The focused external review found no remaining blocker to ME-0A authority safety, crash consistency or independent implementability. ME-0A is the only implementation-ready child. This review authorizes only the mechanical promotion of ME-0A and the implementation surface frozen by that PRD; it does not promote any other child.

## Accepted Closure

The review explicitly accepted the following ME-0A protocol boundaries:

- generation 0 unbound genesis is distinguishable from events plus missing/corrupt current, which fails closed;
- `engineer_contract_revision` binds canonical Profile bytes, SOP bytes and canonical capability revision;
- `EngineerBindingEventV1` and `EngineerBindingCurrentV1` form a closed exact-key schema;
- caller-stable `idempotency_key` derives deterministic `transition_id`, while `operation_fingerprint` fences same-key/different-payload conflicts;
- immutable event create-if-absent, event fsync, exact current CAS, directory fsync and response ordering are fixed;
- crash before event, after event/before current and after current/before response each have one retry result;
- `next_current_payload_sha256` prevents event/current digest cycles;
- dangling events are diagnostic evidence only and may be resumed only by the same key and operation fingerprint;
- per-engineer lock, expected current digest/generation and one current pointer preserve monotonic generation and active binding cardinality of zero or one;
- the current binding facts are sufficient prerequisites for ME-0B without granting ME-0B implementation authority.

## Scope of Approval

Approved ME-0A implementation order:

```text
closed schemas and canonical bytes
→ git-common-dir paths
→ per-engineer lock/CAS store
→ operator CLI and read projection
→ canary Profile/SOP
```

Explicitly excluded from this approval:

- Session-originated engineer mutation;
- authenticated `EngineerPrincipal` or `ClaimActorReceipt`;
- delegation, messaging, Worker Host or Human Board;
- active bound-task handoff;
- any promotion of ME-0B through ME-4C.

## Authority Decision

This review is external gate evidence bound to subject commit `b54a43d8`. The maintainer mechanically records the result by changing ME-0A from Draft to Approved and updating the umbrella/research reading surfaces. The older `Request Changes` review remains immutable evidence for subject `d29ecce2`; it is not rewritten or treated as current approval authority.
