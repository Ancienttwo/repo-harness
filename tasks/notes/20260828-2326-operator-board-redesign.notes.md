# Implementation Notes: operator-board-redesign

> **Status**: Active
> **Plan**: plans/plan-20260828-2326-operator-board-redesign.md
> **Contract**: tasks/contracts/20260828-2326-operator-board-redesign.contract.md
> **Review**: tasks/reviews/20260828-2326-operator-board-redesign.review.md
> **Last Updated**: 2026-08-28 23:26
> **Lifecycle**: notes

## Design Decisions

- WP-A: `BoardCardV1` already flattens the sprint row (`task`, `row_index`) with an empty
  string standing for "this card has no canonical row". The fleet collector restores that
  distinction (`'' -> null`) instead of forwarding an empty label, so `task_label: null` stays
  a snapshot fact rather than an unreadable-label placeholder. No intermediate layer had to
  change: `resolveBoard` -> `BoardCardV1` -> `cardInput` already carried both cells.
- `task_index` parses `row_index` only when it matches the backlog grammar's bare integer
  (`/^[0-9]+$/`), otherwise null. The grammar guarantees the match today; the guard keeps a
  future non-integer cell from arriving as `NaN` in the transport.
- `OPERATOR_FLEET_PAYLOAD_PROTOCOL` is a literal in `src/operator-web/types.ts` rather than an
  import of `FLEET_BOARD_PROTOCOL`, because `src/core/fleet/board.ts` imports Node `createHash`
  and must not enter the browser bundle. It is typed as `OperatorFleetSnapshotV1['protocol']`,
  so a drift from the core constant is a typecheck failure, not a runtime one.

## Deviations From Plan Or Spec

- WP-A touched one App.tsx literal (`protocol 1` -> `protocol 2`) even though UI work is WP-B.
  The footer states the payload protocol; leaving it at 1 after the bump would have shipped a
  false statement for the length of the branch. No layout, structure, or styling changed.
- `src/operator-web/fixture.ts` task ids moved from short slugs (`task-review`) to real 64-hex
  digests plus labels, per the WP-A instruction to give the fixture production shape. Claim and
  publication ids now derive from a short `slug` field so they stay readable. The two
  `tests/operator-web/*` suites now select rows through `fixtureTasks.<row>.task_id` instead of
  hardcoded slugs.
- `OPERATOR_SERVER_PROTOCOL` (the `/healthz` service surface) stays at 1. It versions the route
  contract, not the fleet payload; the payload's own version is `snapshot.protocol`, which the
  Fleet bump already carries. Bumping both would create a second authority for one fact.

## Tradeoffs Considered

| Option | Decision | Reason |
|--------|----------|--------|
| Assert "row null -> label null" through the real collector | Rejected | `collectBoardInputs` enumerates from canonical rows, so no repo fixture can produce a card without a row. The null case is asserted where it is decidable: the pure projection and the browser decoder. |
| Import `FLEET_BOARD_PROTOCOL` into the browser decoder | Rejected | Pulls Node `createHash` into the operator-web bundle. |
| Keep short fixture task ids and only add labels | Rejected | Short ids are exactly what hid the need for a label; WP-B would have designed the worklist against an id that fits on one line. |

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
