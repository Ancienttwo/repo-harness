# Workstream: R1 Provider-Neutral Agent Runtime

> **Status**: planned
> **Capability ID**: `runtime-harness-agent-runtime-effects`
> **Functional Block**: `src/core/engineers/provider-thread-effect.ts` (transitional V1 selector)
> **Matched Prefix**: `src/core/engineers/provider-thread-effect.ts`
> **Architecture Domain**: `runtime-harness`
> **Architecture Capability**: `agent-runtime-effects`
> **Architecture Module**: `docs/architecture/modules/runtime-harness/agent-runtime-effects.md`
> **Source Plan**: plans/plan-20260830-1903-r1-provider-neutral-agent-runtime.md
> **Current Slice**: architecture-accepted-awaiting-activation
> **Last Handoff**: `.ai/harness/handoff/current.md`
> **Architecture Request**: `docs/architecture/requests/archive/2026/runtime-harness-provider-thread-effects.md`

## Purpose

Track R1 under the accepted Agent Runtime Effects boundary. The architecture
node continues to select the current V1 source files until the approved work
package performs the one-shot product/protocol rename; that transition is
explicit and must not become an alias or dual authority.

## Frozen Boundary

- Task and Module Inbox remain message and delivery authorities.
- Engineer Binding remains the only runtime endpoint authority; a Task path must
  derive that endpoint through the exact ClaimActorReceipt.
- `tmux-cli-agent` is an optional closed adapter. It receives only a bounded
  inbox-control reference and never a message body, generic shell command or
  transcript-derived acknowledgement.
- Positive delivery requires an exact persisted inbox receipt. Process success
  alone reaches only `effect_started`; ambiguity becomes
  `reconciliation_required` with no retry or fallback.
- V1 retirement is terminal-only and one-shot; normal V2 readers never inspect
  the V1 archive.

## Progress

- [x] Child PRD D approved.
- [x] R1 added to the program Sprint DAG before C8/C9.
- [x] Decision-complete work-package plan captured as Approved but not activated.
- [x] Agent Runtime capability/component identity and dependency direction accepted.
- [x] Durable P1/P2/P3 snapshot records the transition and non-implementation boundary.
- [ ] Plan activated through an explicit later `plan-to-todo` invocation.
- [ ] V2 implementation, canary and architecture fixed-point closeout complete.

