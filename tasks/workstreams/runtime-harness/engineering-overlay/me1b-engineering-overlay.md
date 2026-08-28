# Workstream: ME-1B Engineering Overlay

> **Status**: completed
> **Capability ID**: `runtime-harness-engineering-overlay`
> **Functional Block**: `src/core/engineers/engineering-overlay.ts`
> **Matched Prefix**: `src/core/engineers/engineering-overlay.ts`
> **Architecture Domain**: `runtime-harness`
> **Architecture Capability**: `engineering-overlay`
> **Architecture Module**: `docs/architecture/modules/runtime-harness/engineering-overlay.md`
> **Source Plan**: plans/plan-20260825-2339-me1b-engineering-overlay.md
> **Current Slice**: completed-20260828-exact-subject-publication
> **Last Handoff**: `.ai/harness/handoff/current.md`
> **Architecture Request**: (none)

## Purpose

Track durable delivery of the read-only ME-1B organization projection without turning it into a second Fleet, scheduling or runtime authority.

## Stable Boundary

- Planning Graph, Fleet Board, Engineering Overlay and Organization Attention remain independent read models.
- Profile/Binding, ClaimActor, ME-1C message and ME-3A Provider-effect stores remain the observed authorities; the overlay owns only closed schemas, component fences and content-addressed projection.
- Registry enumeration uses the existing strict reader and exact authority digest. Unreadable authority fails closed or degrades the named component; it is never translated into healthy-empty state.
- Web UI, composite HumanControl state, mutation routes, delegation, memory, Provider actions and task lifecycle changes remain outside ME-1B.

## ME-1B Acceptance

- [x] Minimal CLI/JSON boundary and closed support states are approved.
- [x] Double-read consistency, semantic independence, failure states and ten-Engineer timing are implemented and focused tests pass.
- [x] ArchContext P1/P2 are proven and the Human-approved semantic delta is accepted.
- [x] Full repository verification passed; exact-subject AcceptanceReceipt `sha256:f439c8ee980bdafbf5117e82b019d7e389e0dc1e0c45a95c2fa59bbdf18c9766` against `fee22c4729d6e49d3f67e297842cc2e779d910af` and canonical mainline publication close the slice.

## Deferred Children

Local web presentation, a composite read response, delegation and memory fields require their own owning PRD and approval. ME-1B grants no mutation or caching authority to those later surfaces.
