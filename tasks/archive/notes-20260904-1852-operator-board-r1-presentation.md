> **Archived**: 2026-09-04 18:52
> **Related Plan**: plans/archive/plan-20260831-1239-operator-board-r1-presentation.md
> **Outcome**: Completed
> **Lifecycle**: notes
> **Parent Run ID**: run-20260904-1852
> **Archive Projection V1**: `plans/plan-20260831-1239-operator-board-r1-presentation.md` => `plans/archive/plan-20260831-1239-operator-board-r1-presentation.md`
> **Archive Projection V1**: `tasks/notes/20260831-1239-operator-board-r1-presentation.notes.md` => `tasks/archive/notes-20260904-1852-operator-board-r1-presentation.md`
> **Archive Projection V1**: `tasks/contracts/20260831-1239-operator-board-r1-presentation.contract.md` => `tasks/archive/contract-20260904-1852-operator-board-r1-presentation.md`
> **Archive Projection V1**: `tasks/reviews/20260831-1239-operator-board-r1-presentation.review.md` => `tasks/archive/review-20260904-1852-operator-board-r1-presentation.md`

# Implementation Notes: operator-board-r1-presentation

## P1 Architecture Map

- `src/core/operator/fleet-snapshot.ts` owns the browser-safe Operator Fleet DTO; the browser must consume it without recomputing Task semantics.
- `src/effects/operator/server.ts` owns the loopback HTTP projection and packaged asset boundary.
- `src/operator-web/` owns rendering, localized utility copy, responsive layout, and the single bounded task-message affordance.
- Fleet Task column authority remains outside the browser; R1 runtime reachability and delivery evidence are additive inbox projection fields.

## P2 Concrete Trace

`GET /api/v1/fleet/snapshot` returns protocol 3 → `decodeOperatorFleetSnapshot()` already validates that exact closed DTO → the Worklist groups cards from authoritative `column`/attention facts → selecting a card opens Task Drawer → the message form resolves current claimant versus next claimant and POSTs only through the existing bounded message route. The observed protocol failure came from an old ignored `dist/operator-ui` build; source still had a separate hard-coded protocol-2 footer. The package-owned `build:operator-web` step refreshes the sole asset output, so no runtime compatibility path is needed.

## P3 Decision

Consume protocol 3 literally, reject other protocols, render the snapshot protocol rather than a UI constant, and render runtime/delivery as secondary evidence plus exception-only badges. Preserve the existing worklist/five-column semantics and visual system. No compatibility adapter or inferred status is permitted.

> **Status**: Active
> **Plan**: plans/archive/plan-20260831-1239-operator-board-r1-presentation.md
> **Contract**: tasks/archive/contract-20260904-1852-operator-board-r1-presentation.md
> **Review**: tasks/archive/review-20260904-1852-operator-board-r1-presentation.md
> **Last Updated**: 2026-08-31 13:11
> **Lifecycle**: notes

## Design Decisions

- Runtime evidence is rendered from the four accepted inbox fields only. It can add an exception badge or drawer evidence, but `groupForCard()` remains independent of those fields.
- Default collapse derives from the ordered group projection: only the first non-empty group opens, so an empty high-priority group cannot consume the first viewport.
- The mobile modal locks document scrolling and uses an explicit opaque paper surface; desktop keeps the persistent complementary pane.

## Deviations From Plan Or Spec

- None recorded.

## Tradeoffs Considered

| Option | Decision | Reason |
|--------|----------|--------|
| Add a protocol-2 compatibility parser | Reject | It would create a second semantic authority and mask stale packaged assets. |
| Move cards from runtime state | Reject | Fleet column and attention remain the only routing authority. |
| Add a new runtime dashboard panel | Reject | The evidence belongs to the selected task and exceptional card state, not a parallel dashboard. |

## Open Questions

- None.

## Evidence Links

- Checks: `.ai/harness/checks/latest.json`
- Run snapshots: `.ai/harness/runs/`
- Focused regression suite: 56 passed, 0 failed across the Fleet snapshot, browser UI, browser interactions, and CLI serve surfaces.
- Full repository suite: 3,584 passed, 2 skipped, 0 failed across 286 files.
- Live source-path smoke: `repo-harness operator serve --port 4319` returned protocol 3 and served rebuilt assets containing the R1 evidence and recipient-mode copy.
- Required Checks: SQL ordering, architecture sync (`changed_capabilities=2`, `blocking=0`), task sync, strict workflow, project-state inspection, and init dry-run all passed.

## Promotion Filter

Promote a candidate to `tasks/lessons.md`, `docs/researches/`, or harness asset files only when all three hold: hard to reverse, surprising without local context, and a real trade-off existed. If any one is missing, keep it in this notes file instead.

## Promotion Candidates

- Promote to `tasks/lessons.md` only after a repeated correction or failure pattern.
- Promote to `docs/researches/` only when it is durable repo knowledge with evidence.
- Promote to harness asset files only after verification across more than one task or fixture.
