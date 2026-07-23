# Implementation Notes: state-concurrency-counter-barrier

> **Status**: Active
> **Plan**: plans/plan-20260724-0232-state-concurrency-counter-barrier.md
> **Contract**: tasks/contracts/20260724-0232-state-concurrency-counter-barrier.contract.md
> **Review**: tasks/reviews/20260724-0232-state-concurrency-counter-barrier.review.md
> **Last Updated**: 2026-07-24 02:32
> **Lifecycle**: notes

## Design Decisions

- Publish the existing `startedPath` marker only after the first `counterPath`
  write. The marker remains the single readiness authority; no polling retry,
  sleep, fallback read, or production resolver change is introduced.
- Apply the same ordering invariant to all three live fixtures found by the
  sibling sweep: two in `state-concurrency.test.ts` and the shared mutator in
  `effective-state-stability.test.ts`.

## Deviations From Plan Or Spec

- None recorded.

## Tradeoffs Considered

| Option | Decision | Reason |
|--------|----------|--------|
| Wait on `counterPath` directly | Rejected | Would leave `startedPath` as a second, misleading readiness marker. |
| Add read retry or `existsSync` fallback | Rejected | Masks the invalid synchronization contract and remains timing-dependent. |
| Publish `startedPath` after counter initialization | Chosen | Smallest change; one ready authority now implies every post-barrier input exists. |

## Open Questions

- None.

## Evidence Links

- Checks: `.ai/harness/checks/latest.json`
- Run snapshots: `.ai/harness/runs/`
- Deterministic pre-fix failure: `.ai/harness/runs/20260724-0232-state-concurrency-counter-barrier/pre-fix.log` (`ENOENT` at the original counter read, `PRE_FIX_EXIT=1`).
- Repeated targeted run: `.ai/harness/runs/20260724-0232-state-concurrency-counter-barrier/repeated-targeted.log` (`25/25_pass`).

## Promotion Filter

Promote a candidate to `tasks/lessons.md`, `docs/researches/`, or harness asset files only when all three hold: hard to reverse, surprising without local context, and a real trade-off existed. If any one is missing, keep it in this notes file instead.

## Promotion Candidates

- Promote to `tasks/lessons.md` only after a repeated correction or failure pattern.
- Promote to `docs/researches/` only when it is durable repo knowledge with evidence.
- Promote to harness asset files only after verification across more than one task or fixture.
