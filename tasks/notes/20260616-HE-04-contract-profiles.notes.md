# Notes: HE-04 Contract Profiles

> **Status**: Complete
> **Plan**: `plans/plan-20260616-HE-04-contract-profiles.md`
> **Contract**: `tasks/contracts/20260616-HE-04-contract-profiles.contract.md`
> **Review**: `tasks/reviews/20260616-HE-04-contract-profiles.review.md`

## Decisions

- New generated contracts default to `Task Profile: code-change`.
- `verify-contract` accepts legacy contracts with no profile as an advisory pass.
- `ledger-closeout`, `docs-only`, and `eval-only` get the first default path restrictions.

## Tradeoffs

- Profile rules are intentionally conservative and limited. They do not yet parse explicit scope-extension justifications.
- `migration` remains broad because this Sprint legitimately edits scripts/templates/assets/docs/tests.

## Open Questions

- HE-05 or strict-exit should decide whether review card `Change type` must equal contract `Task Profile`.
