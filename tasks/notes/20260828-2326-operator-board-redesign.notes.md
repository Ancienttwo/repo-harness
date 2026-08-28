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

- WP-B: group assignment order is deliberately not the display order. Display is
  `needs you -> ready to merge -> unreadable repos -> unclassified -> agent working -> external -> done`,
  but assignment claims `unclassified` before `external`, so a card Fleet could not classify can never
  land in a group the board collapses by default. `groupForCard` in `src/operator-web/App.tsx` is the
  single place that decides this.
- WP-B: the worklist row reads `merge_readiness.blockers` (per-blocker `code` + `attention_owner`),
  never the flat `blocker_codes`. The flat list carries no owner, and the owner is what decides whether
  a row belongs to the human. `blocker_codes` stays in the decoded transport (it is WP-A's contract and
  still fails closed on an unknown code); the rendered board no longer reads it, including the pane's
  blocker count, which comes from `merge_readiness.blockers`.
- WP-B: `feedback.no_progress` is a boolean with no duration anywhere in the contract, so the copy says
  the task is not progressing and explicitly states the snapshot does not carry how long. `repair_actions`
  render as sentences, not buttons: this surface has no write path in this work package.
- WP-B: selection identity is `repository_id:task_id`. The revision at selection time is kept beside it
  only to detect a definition change, which renders a notice at the top of the pane instead of dropping
  the operator's place on the board.
- WP-B: `src/operator-web/i18n.ts` types `zh` as `Record<keyof typeof en, string>`, so a missing
  translation is a typecheck failure. There is no runtime fallback to English and no partial dictionary.

- WP-C: the browser sends `{ message_id, scope, body }` and nothing else. `task_revision`,
  `target_claim_id`, and `target_generation` are re-resolved server-side in
  `src/effects/fleet/task-message-request.ts`, so a fence the browser rendered minutes ago can
  never become the fence a message is written against. The claim is read twice — once to name
  the recipient, once inside `sendTaskMessage`'s task lock — so a lease that moves between them
  fails closed with `claim_mismatch` instead of addressing a session that is gone.
- WP-C: the HTTP layer keeps only the typed code from a failed write and substitutes a fixed
  public sentence (`TASK_MESSAGE_FAILURES` in `src/effects/operator/server.ts`). The effect's own
  message names repository roots and sprint paths, and a snapshot document already refuses to
  carry those; the write path holds the same line.
- WP-C: composer scope is derived (`lease_state === 'bound' && claim_id !== null` -> claim, else
  task), never offered as a control. A scope picker would let the operator address a claim the
  board can see is not current, which the server would then reject — a choice whose only outcome
  is a typed error is not a choice.
- WP-C: the composer keeps no local record of what it sent. The transient "waiting for the next
  snapshot" line is derived from `snapshot.sequence`, so it disappears the moment authority
  answers; `inbox.unread_count` is the delivery feedback loop.

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

- WP-B: the frozen cause priority names four tiers (user blocker, no progress, external blocker, unread).
  An agent-owned blocker fits none of them, and a card whose only signal is one would have rendered an
  empty cause. `primaryCause` inserts agent-owned blockers between external and unread. The pane still
  lists every blocker regardless of owner.
- WP-B: `src/operator-web/fixture.ts` gained one card (`fixtureTasks.blocked`, a user-owned
  `base_moved_since_verification` plus an external `checks_pending`) and set `no_progress` on the
  repo-console card. Without them the default render reaches no blocker cause at all: every card that
  carried one sat in a group the board collapses by default, so the cause line would have shipped
  untested. `counts.in_review` moved 1 -> 2 with the added card.
- WP-B: the detail pane is resident on wide layouts only. At <= 900px it appears as a modal overlay when
  a task is selected and is absent otherwise, which is the responsive clause in the frozen decisions;
  a resident pane under a single-column stack would push the worklist off the first screen.
- WP-B: `--text-faint` (#74879B) was removed rather than kept unused. It sits at 3.6:1 on the page
  background, so every remaining text token now clears 4.5:1 by construction instead of by review.
- WP-B: the brand mark was recolored from carrot to ink. The accent is reserved for human-write
  affordances and this board has none yet; a decorative accent mark would have spent the signal early.
  A stylesheet test asserts the accent tokens appear only in the `:root` declaration block.

- WP-C: `POST` requires an `Origin` header and `GET` does not. A read may legitimately come from
  `curl`; a write may not, and a browser always sends `Origin` on `POST`, so a missing header is
  never the board itself. The Host pinning is unchanged for both.
- WP-C: the transport caps the raw request at four times the protocol body limit and then judges
  the 413 on the decoded `body` field. JSON escaping expands the payload, so a single cap would
  either reject a legal 8 KiB message or accept an illegal one; the envelope cap only bounds how
  much is read before the authoritative check runs.
- WP-C: `canonicalTaskContext` in `src/effects/fleet/task-message-request.ts` duplicates the
  resolution `canonicalInboxContext` performs in `src/cli/commands/fleet.ts`. CLI commands are out
  of this contract's scope, so extracting the shared helper would have edited a file the contract
  excludes; the duplicate is deliberate and both call sites resolve the same three authorities in
  the same order.
- WP-C: `react-dom` resolves whether the host supports the `input` event at import time, and this
  test process has no DOM then, so it uses its keyboard-driven change detection. `typeMessage` in
  `tests/operator-web/operator-interactions.test.tsx` therefore focuses the field and ends on a
  key event. React's own value tracker still decides whether the value changed, so the assertion
  is about the component, not about the simulation.

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
- Brand and mascot art source (external reference), all from `Ancienttwo/repo-harness-page@ffe3ff1`:
  - `src/components/ui/CarrotMark.astro` — pixel-carrot `PX` array, viewBox `0 0 9 12`, `shape-rendering="crispEdges"`.
  - `src/components/ui/DunkieMark.astro` — Dunkie the donkey, `GRID` + `PAL`/`PAL2` (Codex-blue and Claude-orange saddlebags, `W=#FFFFFF`).
  - `src/components/ui/HookMark.astro` — Hook the hard-hat crane-hook robot, `GRID` + `PAL`.
  - `public/favicon.svg` — 16x16 rounded `#14202E` plate carrying the same carrot pixel grid.
  Ported verbatim into `src/operator-web/marks.tsx` as React inline SVG, and copied to `src/operator-web/favicon.svg`. Brand colours (`#43A047`/`#2E7D33` greens, `#E8742C`/`#F2954A`/`#C2571A` oranges, mascot palettes) stay literal and are exempt from the accent discipline, which governs UI affordances only. All marks are decorative (`aria-hidden`), so no accessible-name or contrast contract is attached to them.

## Promotion Filter

Promote a candidate to `tasks/lessons.md`, `docs/researches/`, or harness asset files only when all three hold: hard to reverse, surprising without local context, and a real trade-off existed. If any one is missing, keep it in this notes file instead.

## Promotion Candidates

- Promote to `tasks/lessons.md` only after a repeated correction or failure pattern.
- Promote to `docs/researches/` only when it is durable repo knowledge with evidence.
- Promote to harness asset files only after verification across more than one task or fixture.
