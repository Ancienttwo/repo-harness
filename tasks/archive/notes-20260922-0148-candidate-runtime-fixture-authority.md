> **Archived**: 2026-09-22 01:48
> **Related Plan**: plans/archive/plan-20260922-0132-candidate-runtime-fixture-authority.md
> **Outcome**: Completed
> **Lifecycle**: notes
> **Parent Run ID**: run-20260922-0148
> **Archive Projection V1**: `plans/plan-20260922-0132-candidate-runtime-fixture-authority.md` => `plans/archive/plan-20260922-0132-candidate-runtime-fixture-authority.md`
> **Archive Projection V1**: `tasks/notes/20260922-0132-candidate-runtime-fixture-authority.notes.md` => `tasks/archive/notes-20260922-0148-candidate-runtime-fixture-authority.md`
> **Archive Projection V1**: `tasks/contracts/20260922-0132-candidate-runtime-fixture-authority.contract.md` => `tasks/archive/contract-20260922-0148-candidate-runtime-fixture-authority.md`
> **Archive Projection V1**: `tasks/reviews/20260922-0132-candidate-runtime-fixture-authority.review.md` => `tasks/archive/review-20260922-0148-candidate-runtime-fixture-authority.md`

# Candidate runtime fixture repair

The old and candidate versions are copied runtime fixtures. Modifying the current timeout constant in the old copy preserves the actual behavior difference used by the existing real CLI assertions; editing an installer expression that no longer owns the value cannot do so. This repair uses the single directly blocking out-of-scope allowance of the Agent-first roadmap goal.

The branch-aware task-sync check is pinned to main 0d4371c3, matching hosted PR comparison. Its digest must be recorded before archive and retained in canonical workflow evidence. Working-tree-only task-sync success is not PR diff evidence.
