# Notes: HE-01 Harness Research Baseline

> **Status**: Complete
> **Plan**: `plans/plan-20260616-HE-01-harness-research-baseline.md`
> **Contract**: `tasks/contracts/20260616-HE-01-harness-research-baseline.contract.md`
> **Review**: `tasks/reviews/20260616-HE-01-harness-research-baseline.review.md`

## Decisions

- Used the user-provided Plan to Closeout report and Sprint as the source of truth, then verified the linked public sources before writing the baseline.
- Kept HE-01 as docs-only because it creates decision evidence; later rows are responsible for enforcement.
- Excluded `src/` and root `tests/` from this contract's allowed paths to dogfood the profile narrowing principle before HE-04 implements it globally.

## Tradeoffs

- The research doc cites URLs rather than embedding long excerpts. This keeps the artifact compact and avoids turning a Sprint baseline into a literature review dump.
- External acceptance is recorded as `not_required` because the slice has no runtime side effect and will be covered by the final Sprint review.

## Open Questions

- HE-03/HE-04 should decide whether `not_required` becomes a first-class external acceptance enum or remains review-card text until the typed schema row lands.
