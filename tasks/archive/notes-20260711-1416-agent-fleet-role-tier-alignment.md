> **Archived**: 2026-07-11 14:16
> **Related Plan**: plans/archive/plan-20260711-1402-agent-fleet-role-tier-alignment.md
> **Outcome**: Completed
> **Lifecycle**: notes
> **Parent Run ID**: run-20260711-1416

# Implementation Notes: agent-fleet-role-tier-alignment

> **Status**: Complete
> **Plan**: plans/plan-20260711-1402-agent-fleet-role-tier-alignment.md
> **Contract**: tasks/contracts/20260711-1402-agent-fleet-role-tier-alignment.contract.md
> **Review**: tasks/reviews/20260711-1402-agent-fleet-role-tier-alignment.review.md
> **Last Updated**: 2026-07-11 14:16 +0800
> **Lifecycle**: notes

## Design Decisions

- Treat the generator mapping as desired installed-artifact authority, not proof of native V2 runtime selection.
- Keep the upstream Claude `sonnet/max` source unchanged and change only its deterministic Codex projection.
- Do not add explorer to the Fable-managed list; the local standalone explorer remains an independent user-level custom agent and force install does not delete unmanaged files.

## Verified Platform Boundary

- OpenAI's current subagent documentation supports model/effort in custom agent files.
- Local Codex 0.144.0 MultiAgentV2 canary evidence still shows role-less inherited children on this surface.
- Codex 0.144.1 release notes contain installer/code-mode fixes only, so the blocked runtime contract remains open.

## Open Questions

- None for this artifact-generation slice.

## Verification Notes

- Focused fleet/bootstrap tests passed 25/25.
- The first full-suite attempt found the isolated worktree had no `node_modules`; `bun install --frozen-lockfile` restored the already-locked `archctx-contracts@0.2.2`, after which the full suite passed.
- The local force install produced Sol/high/workspace-write `fast-worker`; the unmanaged Terra/medium/read-only `explorer` remained present.
- The first strict workflow pass caught the unsupported draft profile `refactor`, a terminal active-plan marker, and the expected Brain mirror drift after editing a registered doc. Closeout changed the profile to `code-change`, cleared the ignored markers, and synchronized the registered mirror before rerunning the gate.
- The contract explicitly authorizes the standard archive helper's `plans/archive/`, `tasks/archive/`, and deferred-ledger snapshot surfaces so completed workflow artifacts can leave the root active catalog.
