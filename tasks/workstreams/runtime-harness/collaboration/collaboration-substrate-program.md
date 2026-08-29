# Workstream: Collaboration substrate program (C0-C9)

> **Status**: active
> **Capability ID**: `runtime-harness-collaboration`
> **Functional Block**: `src/core/collaboration`
> **Matched Prefix**: `src/core/collaboration`
> **Architecture Domain**: `runtime-harness`
> **Architecture Capability**: `collaboration`
> **Architecture Module**: `docs/architecture/modules/runtime-harness/collaboration.md`
> **Source Plan**: plans/plan-20260829-2137-c1-coordination-signal-store.md
> **Current Slice**: todo-01
> **Last Handoff**: `.ai/harness/handoff/current.md`
> **Architecture Request**: docs/architecture/requests/archive/2026/runtime-harness-collaboration.md

## Purpose

Durable C0-C9 progress for the collaborative work exchange program
(`plans/sprints/20260828-2321-collaborative-work-exchange-agent-succession.sprint.md`,
Child PRD A `plans/prds/20260828-2321-collaboration-substrate.prd.md`).

C0 carried this ledger inside its freeze record because the capability registry
refuses a workstream directory that no declared capability owns, and a
capability node needs source prefixes that exist. C1 creates
`src/core/collaboration/` and registers the node, so the ledger moves here and
the freeze record keeps only a pointer.

## TODOs

- [x] C0: two-plane authority freeze -- architecture request accepted, D1-D12 frozen, baseline authority-enumeration contract test in place, zero `src/` change.
- [x] C1: `CoordinationSignalV1` schema, `src/core/collaboration/common.ts`, append-only store; capability node registered, architecture module projected, this ledger moved out of the freeze record, `collaboration.mode` wired to `off`, and the deferred closed inclusion scan landed.
- [ ] C2: signal threads, discovery and hotspot projection.
- [ ] C3: `WorkStateHandoffV1` and adoption receipts.
- [ ] C4: delegated Worker contribution adapter and the real admission-bridge canary against D6.
- [ ] C5: TaskFreeze / explicit takeover succession integration.
- [ ] C6: collaboration-centric Work Exchange and ContextPacket, with the D3 binding gate.
- [ ] C7: CLI/MCP and bounded context injection.
- [ ] C8: read-only Operator collaboration surface.
- [ ] C9: real multi-agent canary and multi-seat decision.

## Notes

- Frozen decisions D1-D12 stay in
  `docs/researches/20260829-c0-collaboration-two-plane-authority-freeze.md`.
  Later rows read them; they do not re-derive them, and a revision supersedes
  that record rather than editing it silently.
- `src/core/collaboration/common.ts` is frozen after C1. C2-C9 consume the actor
  union, scope refs, artifact refs, record identity and recorded time without
  editing them; two writers in `src/core/collaboration/` at once is forbidden by
  the sprint's parallelism rules.
- `collaboration.mode` is `off` in `.ai/harness/policy.json`. Promotion is
  `off -> shadow -> active` with no skipped state, and Gate 1 in the sprint says
  what shadow requires.
- Keep architecture facts in
  `docs/architecture/modules/runtime-harness/collaboration.md`; keep execution
  progress here.
