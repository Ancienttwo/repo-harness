> **Archived**: 2026-09-23 14:09
> **Related Plan**: plans/archive/plan-20260922-1022-akn06-history-ui.md
> **Outcome**: Superseded
> **Lifecycle**: notes
> **Parent Run ID**: run-20260923-1409
> **Archive Projection V1**: `plans/plan-20260922-1022-akn06-history-ui.md` => `plans/archive/plan-20260922-1022-akn06-history-ui.md`
> **Archive Projection V1**: `tasks/notes/20260922-1022-akn06-history-ui.notes.md` => `tasks/archive/notes-20260923-1409-akn06-history-ui.md`
> **Archive Projection V1**: `tasks/contracts/20260922-1022-akn06-history-ui.contract.md` => `tasks/archive/contract-20260923-1409-akn06-history-ui.md`
> **Archive Projection V1**: `tasks/reviews/20260922-1022-akn06-history-ui.review.md` => `tasks/archive/review-20260923-1409-akn06-history-ui.md`

# AKN-06e decisions

- URL is a selector, never authority. Current links contain Task ID; explicit historical links may pin a Task revision.
- Disappearing current cards preserve selection identity but switch to historical-only source display; no card is synthesized.
- History uses the existing context GET and shared Task reader retirement budget through a separate typed worker entrypoint.

- Canonical revision computation remains server-owned. The browser decoder validates shape and request binding; importing the Node identity implementation breaks the production browser bundle.
