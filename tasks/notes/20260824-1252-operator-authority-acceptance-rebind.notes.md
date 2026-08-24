# Implementation Notes: operator-authority-acceptance-rebind

> **Status**: Active
> **Plan**: plans/plan-20260824-1252-operator-authority-acceptance-rebind.md
> **Contract**: tasks/contracts/20260824-1252-operator-authority-acceptance-rebind.contract.md
> **Review**: tasks/reviews/20260824-1252-operator-authority-acceptance-rebind.review.md
> **Last Updated**: 2026-08-24 12:52
> **Lifecycle**: notes

## Design Decisions

- Derive accepted authority from the configured loopback address and the actual
  socket port, not the requested URL or an alias list.
- Run authority validation before all routes and before Fleet collection so a
  rejected browser authority has no expensive or sensitive downstream effect.
- Treat the post-review semantic change as invalidating the old receipt; create
  a fresh work-package acceptance boundary instead of editing or bypassing the
  stale host authority.

## Deviations From Plan Or Spec

- None recorded.

## Tradeoffs Considered

| Option | Decision | Reason |
|--------|----------|--------|
| Accept `localhost` and IP aliases | Reject | Multiple authorities widen DNS-rebinding surface and create compatibility semantics outside the contract. |
| Check only Origin | Reject | Browser navigation may omit Origin; Host is the required request authority. |
| Reuse the old AcceptanceReceipt | Reject | The normalized final subject changed and the gate correctly fails closed. |

## Open Questions

- None.

## Evidence Links

- Checks: `.ai/harness/checks/latest.json`
- Run snapshots: `.ai/harness/runs/`

## Promotion Filter

Promote a candidate to `tasks/lessons.md`, `docs/researches/`, or harness asset files only when all three hold: hard to reverse, surprising without local context, and a real trade-off existed. If any one is missing, keep it in this notes file instead.

## Promotion Candidates

- The loopback HTTP authority lesson was promoted to `tasks/lessons.md` because
  it is a reusable security invariant and the pre-fix behavior was verified.
- Promote to `docs/researches/` only when it is durable repo knowledge with evidence.
- Promote to harness asset files only after verification across more than one task or fixture.
