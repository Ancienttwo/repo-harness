# Workstream: External Source Intake P0

> **Status**: active
> **Capability ID**: `runtime-harness-external-source-intake`
> **Functional Block**: `src/effects/external-sources/refresh.ts`
> **Matched Prefix**: `src/effects/external-sources/refresh.ts`
> **Architecture Domain**: `runtime-harness`
> **Architecture Capability**: `external-source-intake`
> **Architecture Module**: `docs/architecture/modules/runtime-harness/external-source-intake.md`
> **Source Plan**: `plans/plan-20260901-0205-external-source-binding-wp2.md`
> **Current Slice**: external-source-binding-wp2

## Purpose

Keep the P0 external evidence plane auditable and isolated from canonical planning and execution authorities.

## Frozen Boundary

- GitHub observations and receipts remain immutable provider-neutral evidence.
- The only P0 refresh is explicit, manual, bounded, and policy-gated.
- No external record binds or mutates a TaskOffer, Claim, Lease, WorkEnvelope, collaboration signal, or Agent Runtime effect.

## Progress

- [x] Architecture capability and immutable evidence component registered.
- [x] Protocol, strict policy, Git common-dir store, bounded GitHub adapter, projection and CLI implemented.
- [x] Focused and repository acceptance evidence complete for P0.
- [x] WP2 append-only source-to-canonical-task binding, drift projection, untrusted context, and CLI bridge implemented.
- [ ] WP2 acceptance and PR merge complete.
