# Implementation Notes: fleet-prd-closeout

> **Status**: Active
> **Plan**: plans/plan-20260823-1652-fleet-prd-closeout.md
> **Contract**: tasks/contracts/20260823-1652-fleet-prd-closeout.contract.md
> **Review**: tasks/reviews/20260823-1652-fleet-prd-closeout.review.md
> **Last Updated**: 2026-08-23 16:52
> **Lifecycle**: notes

## Design Decisions

- Keep the PRD `Approved`: repository policy defines PRD lifecycle as `Draft -> Approved -> Superseded`, with no `Complete` state.
- Reverify WP0-A/B/C separately because AcceptanceReceipt is a single exact contract/target authority and later workflows replaced the current receipt.
- Use `archive-workflow --outcome Completed` as the sole owner of status promotion, artifact moves, and current-status projection.

## Deviations From Plan Or Spec

- None recorded.

## Tradeoffs Considered

| Option | Decision | Reason |
|--------|----------|--------|
| Mark three plans complete by hand | Reject | Bypasses typed evidence and archive transaction gates. |
| Reuse historical review Markdown | Reject | Review Markdown is projection only and old receipts target stale revisions. |
| Reverify each contract then canonical archive | Use | Preserves exact authority and fails closed without touching product code. |

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
