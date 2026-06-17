# Notes: HE-02 Filing and Terminology Normalization

> **Status**: Complete
> **Plan**: `plans/plan-20260616-HE-02-filing-terminology-normalization.md`
> **Contract**: `tasks/contracts/20260616-HE-02-filing-terminology-normalization.contract.md`
> **Review**: `tasks/reviews/20260616-HE-02-filing-terminology-normalization.review.md`

## Decisions

- Normalized generated artifact wording to `Task Contract` and `Task Review`.
- Preserved parser fallback for legacy `Sprint Contract` metadata to avoid breaking old active plans.
- Kept `verify-sprint.sh` and `new-sprint.sh` filenames unchanged as compatibility API.
- Scoped the new strict scan to generation surfaces so migration scripts can still name legacy paths while detecting them.

## Tradeoffs

- The repo will temporarily contain legacy terminology inside checker fallback/test fixtures. That is intentional compatibility, not generated output.
- Full repo-wide grep for `tasks/todo.md` or `tasks/sprints/` still finds migration code. HE-02 treats those as required legacy detection paths rather than active artifact drift.

## Open Questions

- HE-03 should decide whether `Human Review Card` becomes mandatory in all review fixtures immediately or through a staged compatibility warning.
