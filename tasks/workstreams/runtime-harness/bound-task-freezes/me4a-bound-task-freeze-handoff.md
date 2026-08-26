# Workstream: ME-4A Bound Task Freeze and Handoff

> **Status**: active
> **Capability ID**: `runtime-harness-bound-task-freezes`
> **Functional Block**: `src/core/engineers/task-freeze.ts`
> **Matched Prefix**: `src/core/engineers/task-freeze.ts`
> **Architecture Domain**: `runtime-harness`
> **Architecture Capability**: `bound-task-freezes`
> **Architecture Module**: `docs/architecture/modules/runtime-harness/bound-task-freezes.md`
> **Source Plan**: plans/plan-20260826-1247-me4a-bound-task-freeze-handoff.md
> **Current Slice**: todo-01
> **Last Handoff**: `.ai/harness/handoff/current.md`
> **Architecture Request**: (none)

## Purpose

Track the ME-4A inspect/freeze/refusal slice without implying dirty-state transport, successor election or execution takeover.

## Stable Boundary

- Lease, ClaimActorReceipt, EngineerBinding and exact persisted WorkEnvelope remain the existing execution/identity authorities.
- TaskFreezeReceipt records exact double-read observations and has no current pointer or mutation transition.
- Binding rotation rejects every live Claim until the explicit Lease release path completes.
- Untracked inventory hashes pathname bytes plus closed filesystem types only and is never a content carrier.
- Writer-grant current remains owned by future ME-2B; ME-4A creates no shadow authority.

## ME-4A Progress

- [x] Closed canonical receipt/inspection schema implemented.
- [x] Exact double-read, immutable persistence and stale verification implemented.
- [x] Binding/acquisition serialization closes the active-Claim rotation race.
- [x] Focused schema/store/guard/acquisition tests pass.
- [x] Human Architecture Acceptance for `changeset.docs-projection-f46a5e9fd9412be0` / `event.user-approval-20260826-me4a-architecture`.
- [x] Generated architecture projection with P1/P2 proven and required selectors `5/5`.
- [ ] Full gates and exact-subject acceptance.
