> **Archived**: 2026-08-03 23:57
> **Related Plan**: plans/archive/plan-20260803-2235-long-run-conformance-closure.md
> **Outcome**: Completed
> **Lifecycle**: notes
> **Parent Run ID**: run-20260803-2357

# Implementation Notes: long-run-conformance-closure

> **Status**: Active
> **Plan**: plans/plan-20260803-2235-long-run-conformance-closure.md
> **Contract**: tasks/contracts/20260803-2235-long-run-conformance-closure.contract.md
> **Review**: tasks/reviews/20260803-2235-long-run-conformance-closure.review.md
> **Last Updated**: 2026-08-03 22:35
> **Lifecycle**: notes

## Design Decisions

- The ownership key is the canonical worktree path plus operation (`finish` or
  `ship`) under the Git common directory. Atomic `mkdir` is the election point,
  so no journal temp file or closeout side effect can precede ownership.
- A normal owner writes its PID and journal key into `owner.json`. SIGKILL leaves
  that claim as recovery evidence; mutating recovery refuses a live PID and
  must atomically take a nested `recovery.lock` before abort or reconcile.
- A dead owner interrupted before `prepared` is an explicit pre-journal orphan.
  Only `recover abort` may clear it; there is no timer, TTL, or automatic reclaim.
- Host conformance distinguishes public logical commands from fixture-local
  implementations. The driver log binds their exact order, while the research
  wording explicitly avoids claiming every command uses the globally installed
  binary inside the disposable fixture.
- A receipt is formed from an opening and closing envelope; a third,
  post-receipt envelope is required because that is the first read that can
  observe the receipt and apply the no-progress breaker.

## Deviations From Plan Or Spec

- No scope deviation. The pre-fix concurrency fixture's barrier was broadened
  from the old snapshot boundary to the new ownership boundary after the red
  proof was captured, preserving the same adversarial two-process schedule.

## Tradeoffs Considered

| Option | Decision | Reason |
|--------|----------|--------|
| Reuse `CloseoutJournalV1` key as the lock | Rejected | The journal key depends on mutable closeout inputs and is not available before every potentially racing read; the stable worktree/operation claim must exist first. |
| PID-only explicit takeover | Accepted, fail-closed | PID reuse can conservatively delay recovery by treating an unrelated reused PID as live, but cannot authorize an unsafe takeover; adding leases or automatic expiry would create a second authority. |
| One shared shell library for both helpers | Rejected for this slice | The product ships two standalone helper files and tracked template mirrors; introducing another runtime include would expand packaging and failure boundaries. Projection checks keep the deliberate duplicate blocks byte-aligned with their mirrors. |
| Call the global CLI from every fixture step | Rejected for the conformance fixture | It would couple source tests to user-level installation state. The fixture executes the public logical command contract through local implementations and the delivery gate separately smoke-tests the installed CLI. |

## Open Questions

- None.

## Evidence Links

- Checks: `.ai/harness/checks/latest.json`
- Pre-fix red proof: `.ai/harness/runs/20260803-2235-long-run-conformance-closure/pre-fix-concurrent-closeout.log`
- Run snapshots: `.ai/harness/runs/`

## Promotion Filter

Promote a candidate to `tasks/lessons.md`, `docs/researches/`, or harness asset files only when all three hold: hard to reverse, surprising without local context, and a real trade-off existed. If any one is missing, keep it in this notes file instead.

## Promotion Candidates

- The durable protocol and recovery invariants were promoted directly into
  `docs/reference-configs/long-run-continuation.md` and the LoopX research
  addendum. No new lesson is warranted from a single correction cycle.
