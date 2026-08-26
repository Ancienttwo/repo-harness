# Workstream: ME-2C Verified Evidence Context

> **Status**: completed
> **Capability ID**: `runtime-harness-verified-context`
> **Functional Block**: `src/core/engineers/verified-context.ts`
> **Matched Prefix**: `src/core/engineers/verified-context.ts`
> **Architecture Domain**: `runtime-harness`
> **Architecture Capability**: `verified-context`
> **Architecture Module**: `docs/architecture/modules/runtime-harness/verified-context.md`
> **Source Plan**: plans/plan-20260826-0707-me2c-verified-evidence-context.md
> **Current Slice**: completed-20260826-me2c-verified-evidence-context
> **Last Handoff**: `.ai/harness/handoff/current.md`
> **Architecture Request**: (none)

## Purpose

Track the delivered candidate/verifier/decision checkpoint projection without turning ME-2C into a Provider loop or an authority-transition runtime.

## Stable Boundary

- The exact tracked task Contract owns semantic constraint IDs; `SemanticContractProjectionV1` binds its commit, blob and bytes.
- Worker results remain untrusted. Only one complete, continuous, candidate-bound assertion chain with byte-valid evidence enters trusted context.
- DecisionRequest uses immutable events plus revision-fenced current state. Human is the only answer actor; an open decision blocks the next projection.
- Task, Lease, Publication, Acceptance, Provider dispatch, delegated-run mutation, prompt assembly and per-turn history remain outside this capability.

## ME-2C Acceptance

- [x] Human-approved Architecture Acceptance is bound to `changeset.docs-projection-90539fd46a3eccb5` / `event.user-approval-20260826-me2c-architecture`.
- [x] Closed schemas, exact Contract projection, immutable evidence validation and crash-safe DecisionRequest state are implemented.
- [x] Fork, gap, stale evidence, subject drift, open decision and every supported crash boundary fail closed.
- [x] Focused tests, the full repository suite, architecture projection, workflow gates and exact-subject acceptance close the slice.

## Deferred Children

Provider turns, automatic semantic inner loops, writable delegation, task/publication/acceptance transitions and Human transport authentication require their own approved boundaries. ME-2C grants none of those authorities.
