# Notes: HE-03 Human Review Card

> **Status**: Complete
> **Plan**: `plans/plan-20260616-HE-03-human-review-card.md`
> **Contract**: `tasks/contracts/20260616-HE-03-human-review-card.contract.md`
> **Review**: `tasks/reviews/20260616-HE-03-human-review-card.review.md`

## Decisions

- Required `Verdict: pass` in the Human Review Card in addition to `Recommendation: pass`.
- Surfaced card values in `.ai/harness/checks/latest.json` under `review.card`.
- Allowed card external acceptance to fill `not_required`, `pass`, or `manual_override` when the older External Acceptance Advice parser has no usable status.

## Tradeoffs

- Existing historical review files without cards will fail new `verify-sprint` if used as active closeout evidence. That is intentional for new closeouts; old archives remain historical.
- External acceptance remains duplicated between the card and the legacy section until HE-05/closeout schema work structures it.

## Open Questions

- HE-04 should decide whether card `Change type` and contract `Task Profile` must match in `verify-contract`, `verify-sprint`, or a later strict-exit gate.
