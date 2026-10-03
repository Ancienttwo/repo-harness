# Workstream: ME-4C Integration Product Acceptance

> **Status**: completed
> **Capability ID**: `runtime-harness-integration-acceptance`
> **Functional Block**: `src/core/integration/product-acceptance.ts`
> **Matched Prefix**: `src/core/integration/product-acceptance.ts`
> **Architecture Domain**: `runtime-harness`
> **Architecture Capability**: `integration-acceptance`
> **Architecture Module**: `docs/architecture/modules/runtime-harness/integration-acceptance.md`
> **Source Plan**: plans/plan-20260826-0115-me4c-integration-product-acceptance.md
> **Current Slice**: completed-20260826-me4c-integration-product-acceptance
> **Last Handoff**: `.ai/harness/handoff/current.md`
> **Architecture Request**: Human-approved ME-4C boundary

## Purpose

Track durable delivery of exact combined-candidate product acceptance without turning repo-harness into a merge builder or a second Acceptance authority.

## Stable Boundary

- Approved PRD/source-spec bytes, current reviewing lease pointers, immutable PublicationReceipts, Git commits/trees and protocol-2 AcceptanceReceipt remain the source authorities.
- ME-4C owns only closed content-addressed contracts, envelopes, matrices and product projections under the git common directory.
- A combined candidate is an already-existing exact Git commit; every selected publication head and the base must be ancestors of that head.
- Missing, stale, mutable or malformed authority fails closed. No compatibility translation, merge construction, Provider fallback, daemon or Human decision automation is permitted.

## ME-4C Acceptance

- [x] Existing-commit carrier and AcceptanceReceipt projection decisions are Human-approved.
- [x] Closed schemas, strict effect revalidation, immutable store and bounded local CLI are implemented.
- [x] Two-publication, stale-fence, matrix completeness, route-inventory and non-mutation fixtures pass.
- [ ] ArchContext P1/P2, full repository verification, exact-subject acceptance and canonical publication are complete.

## Deferred Children

Merge execution/order, automatic release, UI, ME-2C candidate/verifier checkpoints and any delegated-run adapter remain owned by their separate approved work packages.
