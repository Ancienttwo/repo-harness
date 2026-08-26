# Implementation Notes: me4b-interface-change-request

## Authority decisions

- Engineer mutation is exposed only by the authenticated MCP tools. The MCP server resolves the existing OAuth authorization carrier to a principal, then the ME-4B store revalidates the exact current Binding and capability before mutation. Authorization IDs never enter request/event bytes or CLI arguments.
- Human CLI owns only `accept`, `reject`, `cancel`, and `integrated`; Engineer MCP owns only `propose`, `submit`, `cancel`, `materialize`, and `implemented`. The overlap on `cancel` is deliberate and actor-checked by the transition matrix.
- Acceptance persists an immutable `InterfaceWorkPackageProjectionV1` and does not edit Sprint or Work Graph bytes. `materialize` proves a separate planning transaction by reading one exact Git commit and reusing ME-1A `projectWorkGraph` plus the canonical Work Package revision.
- `WorkPackageDefinitionV1` remains byte-compatible. Reverse lookup scans accepted projections as a deterministic derived view; at 10x request volume this scan is the first expected pressure point and may later become a rebuildable index without changing semantic authority.
- Store review tightened three authority boundaries before acceptance: actor legality is validated before any immutable write; Engineer transitions revalidate Binding while holding the existing Binding lock through request CAS; reverse lookup exposes only a canonical, chain-validated materialized Work Package reference, never a merely accepted projection.

## Projection checkpoint

- Local CodeGraph indexing removed the pre-index false `verified-flow-proof-changed` classification and proved the required interface-change P1/P2 path with selectors `3/3`. Human accepted the resulting exact semantic delta as `changeset.docs-projection-ec265ab39ad694a4` / `event.user-approval-20260827-me4b-architecture-codefacts`: `entrypoint-changed`, `node-added`, and `relation-changed` over only `engineer-bindings`, `engineer-scheduling`, `interface-change`, and `mcp-sidecar`.
- ArchContext applied receipt `sha256:b274c31facdb8bfe1cc1804fdb40b67ff899867517942fffd5a024893e23c1c3`; the first response was `applied-reconcile-required` after the durable ChangeSet commit, and an idempotent replay delivered the same receipt plus the original refresh signal without a second apply. The generated module is now at a proven fixed point; the MCP drift card emitted by the refresh consumer was resolved against the updated `mcp-sidecar` module.

> **Status**: Active
> **Plan**: plans/plan-20260826-1617-me4b-interface-change-request.md
> **Contract**: tasks/contracts/20260826-1617-me4b-interface-change-request.contract.md
> **Review**: tasks/reviews/20260826-1617-me4b-interface-change-request.review.md
> **Last Updated**: 2026-08-27 02:16
> **Lifecycle**: notes

## Design Decisions

- ...

## Deviations From Plan Or Spec

- None recorded.

## Tradeoffs Considered

| Option | Decision | Reason |
|--------|----------|--------|
| ... | ... | ... |

## Open Questions

- None.

## Evidence Links

- Checks: `.ai/harness/checks/latest.json`
- Run snapshots: `.ai/harness/runs/`

## Promotion Filter

Promote a candidate to `tasks/lessons.md`, `docs/researches/`, or harness asset files only when all three hold: hard to reverse, surprising without local context, and a real trade-off existed. If any one is missing, keep it in this notes file instead.

## Promotion Candidates

- Promote to `tasks/lessons.md` only after a repeated correction or failure pattern.
- Promote to `docs/researches/` only when it is durable repo knowledge with evidence.
- Promote to harness asset files only after verification across more than one task or fixture.
