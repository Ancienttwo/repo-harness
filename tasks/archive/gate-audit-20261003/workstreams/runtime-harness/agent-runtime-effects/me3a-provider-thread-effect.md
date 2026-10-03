# Workstream: ME-3A Provider Thread Effect Adapter

> **Status**: completed
> **Capability ID**: `runtime-harness-provider-thread-effects`
> **Functional Block**: `src/effects/engineers/provider-thread-effect-store.ts`
> **Matched Prefix**: `src/effects/engineers/provider-thread-effect-store.ts`
> **Architecture Domain**: `runtime-harness`
> **Architecture Capability**: `provider-thread-effects`
> **Architecture Module**: `docs/architecture/modules/runtime-harness/provider-thread-effects.md`
> **Source Plan**: plans/plan-20260825-2120-me3a-provider-thread-effect.md
> **Current Slice**: completed-20260825-me3a-provider-thread-effect
> **Last Handoff**: `.ai/harness/handoff/current.md`
> **Architecture Request**: (none)

## Purpose

Track durable multi-session progress for `runtime-harness-provider-thread-effects` without inflating local agent instructions.

## Stable Boundary

- ME-1C remains the durable message and delivery authority; ME-3A consumes one exact persisted event and current Binding fence.
- The host owns the Codex Thread action. ME-3A owns only immutable intent, at-most-once action admission, typed observation, and reconcile-only lost-ACK recovery.
- Task, Lease, Fleet, Acceptance, Provider history, query loops, daemon lifecycle, generic Worker Host, fallback, ME-3B, and ME-2B remain outside this capability.

## ME-3A Acceptance

- [x] Runtime Admission Canary correlation and Human-approved architecture change are bound into the accepted projection.
- [x] Persist-first intent, one host action, restart repair, Binding rotation fence, and lost-ACK reconciliation are implemented.
- [x] Focused and full repository verification pass with zero duplicate Provider turns and byte-identical Task/Lease/Fleet/Acceptance authorities.
- [x] The fulfilled contract, passing review, AcceptanceReceipt, and mainline merge close the slice.

## Deferred Children

Automatic Thread creation/archive, second-Provider conformance, daemon operation, delegated-run ME-3B, Human Board automation, and generic runtime ownership require separate approved slices. ME-3A grants none of those authorities.
