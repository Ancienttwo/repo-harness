# Workstream: Local merge gate enforcement

> **Status**: active
> **Capability ID**: `workflow-engine-contract-assets`
> **Functional Block**: `scripts/merge-gate.ts`
> **Matched Prefix**: `scripts/merge-gate.ts`
> **Architecture Domain**: `workflow-engine`
> **Architecture Capability**: `contract-assets`
> **Architecture Module**: `docs/architecture/modules/workflow-engine/contract-assets.md`
> **Source Plan**: `plans/plan-20260714-1713-merge-gate-enforcement.md`
> **Current Slice**: verified-awaiting-clean-main-merge

## Purpose

Track the one-work-package cutover from advisory gatekeeper review to a local, fail-closed ship receipt.

## TODOs

- [x] Define the host-scoped `merge-gate` skill and strict decision schema.
- [x] Bind host-state receipts to repository, base SHA, head SHA, diff, host config, and installed helper fingerprints.
- [x] Gate contract-worktree merge and ship-worktrees push.
- [x] Restore active workflow state after FAIL/BLOCKED and push/merge only the verified SHA.
- [x] Complete repository verification and external review.
- [ ] Archive the workflow after this isolated branch lands on a clean `main`.

## Boundary

- Claude is the only local gatekeeper host in this slice.
- The agent is read-only; the orchestrator owns receipt writes and ship effects.
- GitHub check runs and provider fallback are outside this work-package.
