> **Archived**: 2026-08-28 13:06
> **Related Plan**: plans/archive/plan-20260826-1617-me4b-interface-change-request.md
> **Outcome**: Completed
> **Lifecycle**: notes
> **Parent Run ID**: run-20260828-1306

# Implementation Notes: me4b-interface-change-request

## Authority decisions

- Engineer mutation is exposed only by the authenticated MCP tools. The MCP server resolves the existing OAuth authorization carrier to a principal, then the ME-4B store revalidates the exact current Binding and capability before mutation. Authorization IDs never enter request/event bytes or CLI arguments.
- Human CLI owns only `accept`, `reject`, `cancel`, and `integrated`; Engineer MCP owns only `propose`, `submit`, `cancel`, `materialize`, and `implemented`. The overlap on `cancel` is deliberate and actor-checked by the transition matrix.
- Acceptance persists an immutable `InterfaceWorkPackageProjectionV1` and does not edit Sprint or Work Graph bytes. `materialize` proves a separate planning transaction only after its exact commit equals the current canonical target and the shared ME-1A effect projection validates Sprint/carrier identity, referenced-authority digests, capability resolution and canonical Work Package revision.
- `WorkPackageDefinitionV1` remains byte-compatible. Reverse lookup scans accepted projections as a deterministic derived view; at 10x request volume this scan is the first expected pressure point and may later become a rebuildable index without changing semantic authority.
- Store review tightened three authority boundaries before acceptance: actor legality is validated before any immutable write; Engineer transitions revalidate Binding while holding the existing Binding lock through request CAS; reverse lookup exposes only a canonical, chain-validated materialized Work Package reference, never a merely accepted projection.

## Projection checkpoint

- Local CodeGraph indexing removed the pre-index false `verified-flow-proof-changed` classification and proved the required interface-change P1/P2 path with selectors `3/3`. Human accepted the resulting exact semantic delta as `changeset.docs-projection-ec265ab39ad694a4` / `event.user-approval-20260827-me4b-architecture-codefacts`: `entrypoint-changed`, `node-added`, and `relation-changed` over only `engineer-bindings`, `engineer-scheduling`, `interface-change`, and `mcp-sidecar`.
- ArchContext applied receipt `sha256:b274c31facdb8bfe1cc1804fdb40b67ff899867517942fffd5a024893e23c1c3`; the first response was `applied-reconcile-required` after the durable ChangeSet commit, and an idempotent replay delivered the same receipt plus the original refresh signal without a second apply. The generated module is now at a proven fixed point; the MCP drift card emitted by the refresh consumer was resolved against the updated `mcp-sidecar` module.
- The final deep review found one CLI error-taxonomy regression before subject freeze: malformed/missing Human input was being labelled `interface_change_invalid`, the same misleading catch-all pattern already identified in the ME-0A follow-up. ME-4B now preserves domain error codes, emits `cli_argument_invalid` for its own closed input parser, and reserves `internal_error` for unexpected failures; a CLI regression test locks both malformed and missing input cases.
- After rebasing onto local `main@acb8fdd4`, CodeGraph was rebuilt (`727` files, `14,887` nodes, `63,292` edges) and the deterministic final restamp applied with no affected nodes or Human action. Restamp receipt: `sha256:efa66573dfb5d5cd782ea7d7fbb2b08d204d7c4ad4ffa5c7e867fb1c09c08130`.
- The first full-suite pass completed with `3,173 pass / 2 skip / 2 timeout failures` across 262 files. The ME-2A timeout passed `9/9` in a 17-second isolated rerun. HRD-09 still timed out in isolation at its own 120-second fixture boundary and is owned by the separate upstream `hrd09-fixture-home-isolation` work package; ME-4B does not alter that runtime and will rebase onto the upstream repair before subject freeze.
- ME-4B rebased cleanly onto `main@7c8aa24e`, which contains and archives the independent HRD-09 fixture-home repair. Post-rebase verification is green for the focused ME-4B/MCP suite (`27/27`), typecheck, and the corrected HRD-09 isolated test (`1/1`, 234 expectations, 7.2 seconds). The ME-4B diff contains no HRD-09 implementation or workflow bytes.
- Human approved the exact post-rebase Architecture signal `sha256:7c52cca5ad3750139ec66d3ceaade5ad164ca1dcfbb6fe484d7d26ea923426f9`. ArchContext recorded `changeset.docs-projection-7c52cca5ad375013` / `event.user-approval-20260827-me4b-post-rebase-architecture` for the unchanged four-node, three-reason semantic delta; apply completed with no Human actions and receipt `sha256:01458ca92f7ef20e49774c861b68ae4e2ec351f19b9b87af1b08ca4a3ec669ef`.
- The first strict post-rebase contract run passed 19 of 21 criteria. Its full suite reached `3,174 pass / 2 skip / 1 fail`; the sole failure was the unrelated fleet-board real collector crossing its 1-second round deadline under host load. The exact failed case immediately passed in isolation (`1/1`, 4 expectations). The other failed criterion was a contract-only invalid grep regex for the Approved PRD header; it is corrected to an anchored escaped pattern before the final subject rerun.
- Final Change Assessment routes the new ME-4B abstraction-shaped paths to one explicit `deterministic_test` oracle backed by the already-executed core/CLI test surfaces. The declaration covers only the seven selected implementation/test paths and adds no runtime oracle, reviewer fallback or product authority.
- The official Codex plugin reviewed frozen subject `sha256:ca4a810f878838e05ff0374eba5cf96e11c27c17e8a6ec23f8ecaf4d54c38f89` and correctly found that ME-4B had locally reimplemented only part of ME-1A projection. The correction extracts one shared tracked projection used by both scheduler and ME-4B, requires the materialization commit to equal the current canonical target, and adds non-canonical/stale referenced-authority refusal tests. This consumes the single semantic-review budget; the corrected subject must close through Human owner acceptance rather than a second provider review.
- The corrected architecture selector now terminates at `readTrackedWorkGraphProjectionAt`, the shared ME-1A effect authority actually invoked by `projectedGraphAt`; CodeGraph proves that direct edge and the downstream `projectWorkGraph` call. Human accepted the resulting exact signal as `changeset.docs-projection-6cd2b7682023a2b6` / `event.user-approval-20260828-me4b-codex-review-fix-architecture`, limited to `entrypoint-changed,node-added,relation-changed` over `engineer-bindings`, `engineer-scheduling`, `interface-change`, and `mcp-sidecar`. Apply receipt is `sha256:1c587389fc7227dc2369b38dbc9761a772bc8d5db99c73ac6b828476e50e7627`; final source-only fixed point is `sha256:e0a4869379f4ff639a58ecb35b08177978fb94214338386d79ff1a01105e534c`.
- After ME-1C and then ME-2B closeout commits entered `origin/main` during final verification, the target-authority guard correctly rejected the otherwise green runs. The final branch base is `origin/main@8afee4cf`; Human accepted the exact combined projection signal `sha256:3863b6ccc32291675e2084cebb2ec751001f241c874f4444441121671639185d` as `changeset.docs-projection-3863b6ccc3229167` / `event.user-approval-20260828-me4b-post-me2b-rebase-architecture`. ArchContext changed only the projection manifest and issued receipt `sha256:73222c9656c628d804998c02937c8f658363f3a859cb05e95e7f3785c5bfd691`; the ME-4B model digest and four-node, three-reason boundary remained unchanged.

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
