> **Archived**: 2026-08-23 12:20
> **Related Plan**: plans/archive/plan-20260823-0626-provider-feedback.md
> **Outcome**: Completed
> **Lifecycle**: notes
> **Parent Run ID**: run-20260823-1220

# Implementation Notes: provider-feedback

> **Status**: Active
> **Plan**: plans/plan-20260823-0626-provider-feedback.md
> **Contract**: tasks/contracts/20260823-0626-provider-feedback.contract.md
> **Review**: tasks/reviews/20260823-0626-provider-feedback.review.md
> **Last Updated**: 2026-08-23 06:27
> **Lifecycle**: notes

## Design Decisions

- Provider observations use stable GitHub object IDs and reject GraphQL errors, unknown enums, incomplete or cyclic pagination, and torn local/provider snapshots before any write.
- Delivery receipts remain publication-event notification evidence. They do not carry claim identity and are never accepted as repair completion proof.
- A repair dispatch transaction is added as evidence-only crash recovery state. Completion requires its real lifecycle successor plus the existing ship journal's `complete` proof; caller-supplied attempt IDs, tokens, and ship claims are not accepted as proof.
- The no-progress breaker follows the PRD v3 token formula exactly: publication/head, failing check IDs plus conclusions, unresolved thread IDs, and mergeability. Changes-requested review IDs remain immutable event facts in `feedback_revision` but do not reset the breaker by themselves.

## Deviations From Plan Or Spec

- The initial plan described an explicit completion boundary but did not freeze a durable proof tying it to dispatch and ship. Independent gate review demonstrated that this allowed two standalone `repair complete` calls to fabricate `no_progress`. The plan and contract were tightened before implementation to add `RepairDispatchProofV1` and deterministic completion identity without changing lease/task authority.

## Tradeoffs Considered

| Option | Decision | Reason |
|--------|----------|--------|
| Delivery receipt as execution proof | Rejected | It is mutable notification evidence and manual acknowledgement cannot prove lifecycle or ship completion. |
| Caller-supplied attempt ID | Rejected | It cannot prove causality or prevent duplicate completions. |
| Dispatch proof + existing complete ship journal | Selected | It is the smallest crash-recoverable join over source feedback, real lifecycle successor, and final publication evidence. |

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
