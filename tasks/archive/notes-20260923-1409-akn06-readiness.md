> **Archived**: 2026-09-23 14:09
> **Related Plan**: plans/archive/plan-20260922-1049-akn06-readiness.md
> **Outcome**: Superseded
> **Lifecycle**: notes
> **Parent Run ID**: run-20260923-1409
> **Archive Projection V1**: `plans/plan-20260922-1049-akn06-readiness.md` => `plans/archive/plan-20260922-1049-akn06-readiness.md`
> **Archive Projection V1**: `tasks/notes/20260922-1049-akn06-readiness.notes.md` => `tasks/archive/notes-20260923-1409-akn06-readiness.md`
> **Archive Projection V1**: `tasks/contracts/20260922-1049-akn06-readiness.contract.md` => `tasks/archive/contract-20260923-1409-akn06-readiness.md`
> **Archive Projection V1**: `tasks/reviews/20260922-1049-akn06-readiness.review.md` => `tasks/archive/review-20260923-1409-akn06-readiness.md`

# AKN-06f decisions

- Publication consumes canonical AcceptanceVerificationObservation and the existing sealed receipt digest. Global effective-state stays a separate workflow projection.
- No policy rerun, observation writer, fallback or new fingerprint is permitted on GET.

- Internal authority_home is an effect test seam, matching existing checks/seal seams. Browser routes never expose it. The real user authority store is not used by fixtures; Bun homedir does not follow a process.env.HOME mutation after startup.
