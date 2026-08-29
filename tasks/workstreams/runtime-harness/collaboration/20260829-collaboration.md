# Workstream: Collaboration substrate (C0–C9)

> **Status**: active
> **Capability ID**: `runtime-harness-collaboration`
> **Functional Block**: `src/core/collaboration`
> **Matched Prefix**: `src/core/collaboration`
> **Architecture Domain**: `runtime-harness`
> **Architecture Capability**: `collaboration`
> **Architecture Module**: `docs/architecture/modules/runtime-harness/collaboration.md` (projected in C1)
> **Source Plan**: plans/plan-20260829-1853-c0-two-plane-authority-freeze.md
> **Current Slice**: C1
> **Last Handoff**: `.ai/harness/handoff/current.md`
> **Architecture Request**: docs/architecture/requests/archive/2026/runtime-harness-collaboration.md
> **Frozen Decisions**: `docs/researches/20260829-c0-collaboration-two-plane-authority-freeze.md`

## Purpose

Track durable multi-session progress for `runtime-harness-collaboration` across
sprint rows C0–C9 of
`plans/sprints/20260828-2321-collaborative-work-exchange-agent-succession.sprint.md`
without inflating local agent instructions.

## Ledger

Created by hand in C0. `repo-harness run workstream-sync ensure` cannot run yet:
it requires `--block` to be an existing prefix that matches a declared capability
in the archcontext authority, and `capability.runtime-harness.collaboration` is
registered in C1 together with its first real source files. From C1 onward this
ledger is maintained through the helper.

## TODOs

- [x] C0: two-plane authority freeze — architecture request accepted, frozen decisions D1–D12 recorded, baseline authority-enumeration contract test in place, zero `src/` change.
- [ ] C1: `CoordinationSignalV1` schema, `src/core/collaboration/common.ts`, append-only store; register the archcontext capability node and let ArchContext project the architecture module.
- [ ] C2: signal threads, discovery and hotspot projection.
- [ ] C3: `WorkStateHandoffV1` and adoption receipts.
- [ ] C4: delegated Worker contribution adapter and the real admission-bridge canary.
- [ ] C5: TaskFreeze / explicit takeover succession integration.
- [ ] C6: collaboration-centric Work Exchange and ContextPacket.
- [ ] C7: CLI/MCP and bounded context injection.
- [ ] C8: read-only Operator collaboration surface.
- [ ] C9: real multi-agent canary and multi-seat decision.

## Notes

- Frozen decisions live in
  `docs/researches/20260829-c0-collaboration-two-plane-authority-freeze.md`.
  Rows read them; rows do not re-derive them. Change them by supersede, not by
  silent edit.
- D6's admission decision table is the acceptance source for C4's runtime canary.
- D7's negative proof is why C4 adds a new bridge file instead of editing
  `admitReadOnlyDelegation()`.
- Keep architecture facts in the architecture module once it exists; keep
  execution progress here.
