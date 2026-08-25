# Engineer Scheduling Workstream

> **Capability**: `runtime-harness-engineer-scheduling`
> **Status**: active
> **Source Plan**: `plans/plan-20260825-1149-me1a-engineer-scheduling-schema.md`
> **Current Slice**: verifying-20260825-me1a-scheduling-schema

## Stable Boundary

- Canonical Sprint rows retain Task identity; an explicit same-commit Work Package graph owns only Module Engineer scheduling metadata and revisions.
- Missing carriers are `unclassified`, `generic-v1` is an explicit zero-node lane, and only exact full-coverage `engineering-v2` graphs participate in module routing.
- `EngineerOfferV1` is a deterministic, non-authorizing projection over exact graph, Task, Profile, Binding, Fleet, dependency, concurrency, and authorization observations.
- Repository concurrency is elected under one Git-common-dir lock; the winner delegates to the existing ME-0B/Fleet acquire path and creates no second Claim, Lease, or assignment record.
- Unsupported dependency proof authorities fail closed as `authority_unavailable`.

## ME-1A Acceptance

- [x] Closed Work Graph and Engineer Offer protocols, topology validation, full-row projection, and deterministic revisions implemented.
- [x] Same-commit carrier/reference reads and Profile/Binding/Fleet/Claim/dependency/concurrency joins implemented.
- [x] Repository-key lock, under-lock offer revalidation, and exact ME-0B delegation implemented.
- [x] Restricted MCP inventory expanded to exact status/offers/acquire tools; local CLI remains read-only for scheduling.
- [x] ArchContext model, proven acquire flow, generated module, and Human Architecture Acceptance projected.
- [x] Full repository verification passed; final-subject AcceptanceReceipt remains the closeout boundary.

## Deferred Children

Provider Thread identity, Session lifecycle, Worker Host, delegation, messaging, writable grants, handoff, interface requests, Human Board, product Acceptance authorities, multi-capability qualification, and fleet-global scheduling remain outside ME-1A.
