# Engineer Principal and Claim Actor Workstream

> **Capability**: `runtime-harness-engineer-bindings`
> **Status**: completed
> **Source Plan**: `plans/plan-20260825-0029-me0b-engineer-principal-claim-actor.md`
> **Current Slice**: completed-20260825-me0b-principal-claim-actor

## Stable Boundary

- The restricted `engineer` MCP profile is OAuth-only and exposes exactly `engineer_status` and `engineer_acquire`; it owns no shell, generic Fleet mutation, Binding mutation, Publication, or Acceptance authority.
- The verified OAuth `authorizationId` selects a user-level principal mapping candidate. The current ME-0A Binding remains the repository-scoped authority and is revalidated on every Engineer command.
- Generic Fleet acquisition remains the Task/Lease/WorkEnvelope authority. `ClaimActorReceiptV1` is a separate immutable provenance record joined to the live Lease and complete canonical WorkEnvelope.
- Receipt persistence failure compensates only the exact returned live Claim. A replaced Claim is never released, and a provisioned worktree remains recoverable.

## ME-0B Acceptance

- [x] Restricted profile, distinct OAuth scope, refresh-stable authorization identity, and cross-authorization session fence implemented.
- [x] Canonical principal mapping, current-Binding resolution, revoke/replay fences, and 0600 user-state publication implemented.
- [x] Immutable receipt publication, live Lease readback, canonical WorkEnvelope binding, and own-Claim compensation implemented.
- [x] Focused schema/store/acquire/CLI/MCP HTTP tests pass.
- [x] Accepted architecture projection, full repository verification, and AcceptanceReceipt close the slice.

## Deferred Children

Provider adapters, Session lifecycle, Worker Host, Work Package Graph, delegation, messaging, writer grants, handoff, interface requests, and Human Board remain outside ME-0B. This slice grants none of those authorities.
