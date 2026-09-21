# Implementation Notes: akn03-protected-replies

> **Status**: Active
> **Plan**: plans/plan-20260922-0204-akn03-protected-replies.md
> **Contract**: tasks/contracts/20260922-0204-akn03-protected-replies.contract.md
> **Review**: tasks/reviews/20260922-0204-akn03-protected-replies.review.md
> **Last Updated**: 2026-09-22 02:04
> **Lifecycle**: notes

## Design Decisions

- Use the original acquire WorkEnvelope plus sealed ClaimActor digest; no durable WorkEnvelope writer exists to reuse.
- Reuse Binding → Task → mapping → registry locks. OAuth remains a separate request authority and is synchronously rechecked at publication.
- Read budgets are explicit coverage limits and exclude initial authority validation. Resolve Git-common once per scan.

## Deviations From Plan Or Spec

- None recorded.

## Tradeoffs Considered

| Option | Decision | Reason |
|--------|----------|--------|
| Hold existing global mapping/registry locks through validation | Keep exact live fences | Throughput first contends on these locks; no new transaction framework |

## Open Questions

- Real H0/Campaign and notification reconciliation remain outside this slice.

## Evidence Links

- Checks: `.ai/harness/checks/latest.json`
- Run snapshots: `.ai/harness/runs/`

## Promotion Filter

Promote a candidate to `tasks/lessons.md`, `docs/researches/`, or harness asset files only when all three hold: hard to reverse, surprising without local context, and a real trade-off existed. If any one is missing, keep it in this notes file instead.

## Promotion Candidates

- Promote to `tasks/lessons.md` only after a repeated correction or failure pattern.
- Promote to `docs/researches/` only when it is durable repo knowledge with evidence.
- Promote to harness asset files only after verification across more than one task or fixture.
