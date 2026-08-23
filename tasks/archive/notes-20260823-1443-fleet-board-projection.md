> **Archived**: 2026-08-23 14:43
> **Related Plan**: plans/archive/plan-20260823-1049-fleet-board-projection.md
> **Outcome**: Completed
> **Lifecycle**: notes
> **Parent Run ID**: run-20260823-1443

# Implementation Notes: fleet-board-projection

> **Status**: Active
> **Plan**: plans/plan-20260823-1049-fleet-board-projection.md
> **Contract**: tasks/contracts/20260823-1049-fleet-board-projection.contract.md
> **Review**: tasks/reviews/20260823-1049-fleet-board-projection.review.md
> **Last Updated**: 2026-08-23 13:19
> **Lifecycle**: notes

## Design Decisions

- WP4 baseline is `71a7a877`, where both Provider Feedback and Task Inbox are published and accepted.
- Task Inbox V1 has no priority datum. The board summary exposes only unread count, current-claim addressing, and snapshot consistency; it never infers priority.
- The board reads every registry-authorized repository with `adoptedOnly: false`. Malformed registry authority is fatal through a new strict reader owned by `repo-registry.ts`; existing consumers keep their current behavior.
- Board/watch require zero filesystem mutation, so the inbox summary cannot reuse `listTaskInbox()`'s task-lock wrapper. It uses validated lock-free A/B observation and never returns bodies.
- Provider timeout/abort stays inside the readiness authority. Sync and async callers must share provider parsing and validation rather than maintain parallel semantics.

## Deviations From Plan Or Spec

- None recorded.

## Tradeoffs Considered

| Option | Decision | Reason |
|--------|----------|--------|
| Add `priority_counts` locally | Reject | Task Inbox V1 has no priority authority; inference would create new semantics. |
| Parse registry again in fleet board | Reject | It would create a shadow authority and drift from registry ownership. |
| Call `gh` directly from fleet board | Reject | Readiness already owns provider identity and blocker projection. |
| Lock every task while projecting | Reject | Observation needs honest consistency, not exclusion or filesystem mutation. |

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
