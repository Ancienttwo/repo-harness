# Engineer Bindings Workstream

> **Capability**: `runtime-harness-engineer-bindings`
> **Status**: completed
> **Source Plan**: `plans/plan-20260824-2126-me0a-engineer-profile-binding.md`
> **Current Slice**: completed-20260824-me0a-profile-binding

## Stable Boundary

- Tracked `agents/engineers/` Profile/SOP artifacts reference ArchContext capability IDs and never duplicate capability paths, entrypoints, interfaces, or checks.
- `<git-common-dir>/repo-harness/engineers/v1/` is the only mutable Engineer binding authority shared by linked worktrees.
- `current.json` is the current-state authority; immutable events are audit and idempotent-recovery evidence only.
- ME-0A mutations are local Human-operator CLI actions. Bootstrap output is read-only context and carries no Engineer principal, credential, or task authority.

## ME-0A Acceptance

- [x] Approved Profile/Binding schemas and transitive contract revision implemented.
- [x] Two capability-backed canary Profile/SOP pairs validate through the canonical parser.
- [x] Lock/CAS store covers genesis, race, idempotency, crash recovery, retire/rebind, linked worktrees, and Lease non-mutation.
- [x] Operator CLI and bounded bootstrap projection implemented with no Session mutation route.
- [x] Final repository verification and AcceptanceReceipt recorded.

## Deferred Children

EngineerPrincipal, claims, handoff, delegation, messaging, Worker Host, Provider lifecycle, Human Board, and remote access remain governed by their Draft child PRDs. ME-0A grants none of those authorities.
