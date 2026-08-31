# Workstream: R1 Provider-Neutral Agent Runtime

> **Status**: completed
> **Capability ID**: `runtime-harness-agent-runtime-effects`
> **Functional Block**: `src/core/engineers/agent-runtime-effect.ts`
> **Matched Prefix**: `src/core/engineers/agent-runtime-effect.ts`
> **Architecture Domain**: `runtime-harness`
> **Architecture Capability**: `agent-runtime-effects`
> **Architecture Module**: `docs/architecture/modules/runtime-harness/agent-runtime-effects.md`
> **Source Plan**: plans/plan-20260830-1903-r1-provider-neutral-agent-runtime.md
> **Current Slice**: completed-20260831-r1 (PR #230, squash 4f7cb37e)
> **Last Handoff**: `.ai/harness/handoff/current.md`
> **Architecture Request**: `docs/architecture/requests/archive/2026/runtime-harness-provider-thread-effects.md`

## Purpose

Track R1 under the accepted Agent Runtime Effects boundary. The product/protocol
rename and terminal-only V1 retirement are implemented without an alias or dual
runtime authority; the remaining slice is the authorized real Codex Host canary
and semantic acceptance closeout.

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
- [x] Plan activated through `plan-to-todo` in an isolated contract worktree.
- [x] V2 protocol/store, closed adapters, feature policy and V1 retirement implemented.
- [x] CLI/MCP/Engineering Overlay and Fleet/operator read models migrated to Agent Runtime terminology and protocol 3.
- [x] Real local tmux canary passed with one bounded control reference and no message body.
- [x] Architecture projection reached fixed point with zero pending human actions.
- [x] Real Codex App Thread Host-control canary complete (2026-08-31, rerun after receipt-correlation hardening; thread `01a0544f-3a0a-7352-b3ad-e44dec748eab`).
- [ ] Semantic acceptance receipt recorded on the final frozen subject.
