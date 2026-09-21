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
- The one semantic review identified missing recovery bytes and MCP body trimming. Fixed within this slice, with a child-only body recovery oracle; final acceptance requires the named owner rather than a repeated provider review.

## Evidence Links

- Checks: `.ai/harness/checks/latest.json`
- Run snapshots: `.ai/harness/runs/`

## Promotion Filter

Promote a candidate to `tasks/lessons.md`, `docs/researches/`, or harness asset files only when all three hold: hard to reverse, surprising without local context, and a real trade-off existed. If any one is missing, keep it in this notes file instead.

## Promotion Candidates

- Promote to `tasks/lessons.md` only after a repeated correction or failure pattern.
- Promote to `docs/researches/` only when it is durable repo knowledge with evidence.
- Promote to harness asset files only after verification across more than one task or fixture.

## Cumulative dependency review correction

- Root cause: `revalidateClaimAuthority` applied the acquisition OID fence to ongoing communication; `observeTaskSteers` withheld all entries after whole-directory scan exhaustion.
- Repro: `bun test tests/effects/task-reply.test.ts --test-name-pattern 'review recovery'`.
- Regression guard: `tests/effects/task-reply.test.ts`; pre-fix artifact `.ai/harness/runs/review-recovery-before.log` contains three failures and `PRE_FIX_EXIT=1`.
- P3: share existing Task/Plan authority checks, preserving strict acquisition semantics. Use an exact-parent selector requiring the persisted intent and current original fence; fixed record count bounds recovery independent of history. At 10x history the list still reaches an explicit coverage ceiling; known-operation recovery does not scan that history. New-parent discovery at that scale remains AKN-06, not falsely solved by this correction.
- The AKN-04a independent rejection is retained in its own review. The old owner-acceptance request for 75036305 is superseded; neither stage receives another independent review.
