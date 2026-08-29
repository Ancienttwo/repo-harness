# Workstream: Collaboration substrate program (C0-C9)

> **Status**: active
> **Capability ID**: `runtime-harness-collaboration`
> **Functional Block**: `src/core/collaboration`
> **Matched Prefix**: `src/core/collaboration`
> **Architecture Domain**: `runtime-harness`
> **Architecture Capability**: `collaboration`
> **Architecture Module**: `docs/architecture/modules/runtime-harness/collaboration.md`
> **Source Plan**: plans/plan-20260830-0121-c2-thread-hotspot-projection.md
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
- [x] C2: signal threads, discovery and hotspot projection -- deterministic thread aggregation on exact opaque keys, the capped integer hotspot function, the closed structural opportunity set, `RelevantSignalV1` retrieval with the 60/40 exploitation/exploration quota, and `CollaborationContextPacketV1` inside the 1,500 estimated-token budget. Pure read model: no store, no cache, no clock, no new protocol. `snapshot_consistency` is reserved on the packet and injected by the future store reader (C6); a pure projection over an already-assembled signal array cannot observe a torn or partial read, so deriving it is deferred with the collector.
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
- The C1 architecture acceptance is recorded, not implied. `capability.runtime-harness.collaboration`
  is a `node-added` major change, accepted 2026-08-29 with changeSetId
  `changeset.docs-projection-eb1d7ac0475d1b2b`, eventId
  `event.user-approval-20260829-c1-collaboration-architecture` and reason codes
  `node-added` / `relation-changed`. `repo-harness architecture-projection` has
  no acceptance verb, so the delta was applied through the internal
  `runArchitectureProjection` API; that tool debt is in `tasks/todos.md` and the
  full invocation evidence is in
  `tasks/notes/20260829-2137-c1-coordination-signal-store.notes.md`. C2-C9 add no
  capability, so the next row to need this path is the first one outside this
  program.
- C2 declared no new archcontext entrypoint. Adding one to
  `capability.runtime-harness.collaboration.yaml` classifies as
  `unresolved-major-change` (`entrypoint-changed`, `responsibility-changed`) and
  would need the same acceptance path C1 recorded as tool debt above. C2 changed
  only `extensions.verification` and let the source size bucket move
  (`2-5 files / 1000-2000 lines` -> `5-10 files / 2000-5000 lines`), which the
  projection applies automatically. Declaring the C2 entrypoints is available as
  a separate architecture slice whenever that acceptance verb lands.
- The C3 seam is `CollaborationHandoffFactV1` in
  `src/core/collaboration/thread-projection.ts`: `{thread_key, handoff_id,
  adoption_count}`, injected as a collection that defaults to empty. C3 fills it
  from real handoff and adoption records without changing C2.

- Keep architecture facts in
  `docs/architecture/modules/runtime-harness/collaboration.md`; keep execution
  progress here.
