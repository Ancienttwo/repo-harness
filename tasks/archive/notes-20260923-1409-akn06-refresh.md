> **Archived**: 2026-09-23 14:09
> **Related Plan**: plans/archive/plan-20260922-0905-akn06-refresh.md
> **Outcome**: Superseded
> **Lifecycle**: notes
> **Parent Run ID**: run-20260923-1409
> **Archive Projection V1**: `plans/plan-20260922-0905-akn06-refresh.md` => `plans/archive/plan-20260922-0905-akn06-refresh.md`
> **Archive Projection V1**: `tasks/notes/20260922-0905-akn06-refresh.notes.md` => `tasks/archive/notes-20260923-1409-akn06-refresh.md`
> **Archive Projection V1**: `tasks/contracts/20260922-0905-akn06-refresh.contract.md` => `tasks/archive/contract-20260923-1409-akn06-refresh.md`
> **Archive Projection V1**: `tasks/reviews/20260922-0905-akn06-refresh.review.md` => `tasks/archive/review-20260923-1409-akn06-refresh.md`

# AKN-06a decisions

- One lifecycle hook owns only browser timers/cancellation/one queued request, with source data and typed error display retained by existing readers.
- Each mounted source schedules from its own completion; slow source reads do not become a barrier for other observations.
- Hidden active reads are aborted; an uncooperative aborted promise must settle before that same lifecycle starts its queued visible request. Scope replacement creates a different lifecycle with aborted-result guards.
