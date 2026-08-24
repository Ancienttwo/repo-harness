> **Archived**: 2026-08-25 03:16
> **Related Plan**: plans/archive/plan-20260825-0029-me0b-engineer-principal-claim-actor.md
> **Outcome**: Completed
> **Lifecycle**: notes
> **Parent Run ID**: run-20260825-0316

# Implementation Notes: me0b-engineer-principal-claim-actor

> **Status**: Active
> **Plan**: plans/plan-20260825-0029-me0b-engineer-principal-claim-actor.md
> **Contract**: tasks/contracts/20260825-0029-me0b-engineer-principal-claim-actor.contract.md
> **Review**: tasks/reviews/20260825-0029-me0b-engineer-principal-claim-actor.review.md
> **Last Updated**: 2026-08-25 02:27
> **Lifecycle**: notes

## Design Decisions

- Carrier is restricted MCP OAuth `authorizationId`; Provider Thread and hook session values remain observations only.
- Engineer profile is OAuth-only and exposes an exact Engineer tool allowlist with no generic reader/writer/shell/Fleet mutation.
- Principal mapping selects a candidate Binding but every command revalidates the current Git-common-dir Binding, preventing dual authority.
- ClaimActorReceipt remains separate from Lease；engineer acquire wraps, rather than modifies, canonical Fleet acquire.
- The Engineer transport prohibition is evaluated from the effective profile, including user-level config fallback, so an omitted programmatic profile cannot open the OAuth-only surface over stdio.
- Principal mapping storage inherits the shared exclusive-directory lock's canonical-root and ancestor-identity fences; a symlinked `engineer-principals` ancestor is rejected before any mapping bytes are published.
- `acquireAsEngineer` is the single internal acquire execution boundary. This keeps the ArchContext selector exact and non-truncated while `callEngineerTool` remains the public MCP dispatcher; it adds no alternate mutation authority.
- The accepted ArchContext change set is `changeset.plan-20260825-0029-me0b-engineer-principal-claim-actor`, bound to `event.review-20260825-0029-me0b-engineer-principal-claim-actor-approval`; the fixed-point projection accepts `entrypoint-changed` plus `verified-flow-proof-changed` for `mcp-sidecar` and proves both authenticated principal resolution and MCP Engineer acquire flows.
- The canonical refresh projected the `mcp-sidecar` context block into root `AGENTS.md` / `CLAUDE.md`; its low-severity queue card was resolved against the generated module and archived under `docs/architecture/requests/archive/2026/`.

## Deviations From Plan Or Spec

- None recorded.

## Tradeoffs Considered

| Option | Decision | Reason |
|--------|----------|--------|
| Reuse coding MCP profile | Rejected | Arbitrary shell access would allow mutation of user-level principal state and collapse the authorization boundary. |
| Provider Thread/hook session as principal | Rejected | Current repo mutation request context cannot authenticate either value. |
| Extend Lease schema with Engineer fields | Rejected | Would change generic Fleet/task authority instead of recording orthogonal actor provenance. |

## Open Questions

- None.

## Evidence Links

- Checks: `.ai/harness/checks/latest.json`
- Run snapshots: `.ai/harness/runs/`
- Full repository suite: `3051 pass`, `2 skip`, `0 fail` across 244 files; the skips are Windows-only fixtures.
- Focused loopback HTTP/OAuth suite: `15 pass`, `0 fail`, including exact Engineer tool inventory and cross-authorization session refusal.

## Promotion Filter

Promote a candidate to `tasks/lessons.md`, `docs/researches/`, or harness asset files only when all three hold: hard to reverse, surprising without local context, and a real trade-off existed. If any one is missing, keep it in this notes file instead.

## Promotion Candidates

- Promote to `tasks/lessons.md` only after a repeated correction or failure pattern.
- Promote to `docs/researches/` only when it is durable repo knowledge with evidence.
- Promote to harness asset files only after verification across more than one task or fixture.
