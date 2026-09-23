> **Archived**: 2026-09-23 14:09
> **Related Plan**: plans/archive/plan-20260922-0926-akn06-retirement.md
> **Outcome**: Superseded
> **Lifecycle**: notes
> **Parent Run ID**: run-20260923-1409
> **Archive Projection V1**: `plans/plan-20260922-0926-akn06-retirement.md` => `plans/archive/plan-20260922-0926-akn06-retirement.md`
> **Archive Projection V1**: `tasks/notes/20260922-0926-akn06-retirement.notes.md` => `tasks/archive/notes-20260923-1409-akn06-retirement.md`
> **Archive Projection V1**: `tasks/contracts/20260922-0926-akn06-retirement.contract.md` => `tasks/archive/contract-20260923-1409-akn06-retirement.md`
> **Archive Projection V1**: `tasks/reviews/20260922-0926-akn06-retirement.review.md` => `tasks/archive/review-20260923-1409-akn06-retirement.md`

# AKN-06b decisions

- Reuse the existing bounded Task read owner for context, activity and diff. Their aggregate capacity is the existing max_concurrency, eliminating a separate diff slot authority.
- Collaboration keeps subscription identity separate from retirement; a cancelled same-key reader refuses new subscriptions until actual completion.
- Shutdown cancels every owner before waiting and concurrent close callers share one completion Promise. An uncooperative injected reader stays visible as occupied capacity and pending close.
