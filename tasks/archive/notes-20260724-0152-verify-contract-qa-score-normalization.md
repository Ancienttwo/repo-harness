> **Archived**: 2026-07-24 01:52
> **Related Plan**: plans/archive/plan-20260724-0129-verify-contract-qa-score-normalization.md
> **Outcome**: Completed
> **Lifecycle**: notes
> **Parent Run ID**: run-20260724-0152

# Implementation Notes: verify-contract-qa-score-normalization

> **Status**: Active
> **Plan**: plans/plan-20260724-0129-verify-contract-qa-score-normalization.md
> **Contract**: tasks/contracts/20260724-0129-verify-contract-qa-score-normalization.contract.md
> **Review**: tasks/reviews/20260724-0129-verify-contract-qa-score-normalization.review.md
> **Last Updated**: 2026-07-24 01:29
> **Lifecycle**: notes

## Design Decisions

- **P1 map:** `scripts/verify-contract.sh` is the source verifier; `assets/templates/helpers/verify-contract.sh` is its byte-identical packaged projection; `tests/helper-scripts.test.ts` exercises the packaged helper in a disposable workspace.
- **P2 trace:** `exit_criteria.qa_scores[].dimension` is parsed into `qa_dimensions`, passed to `review_score()`, compared with column two of the review Scorecard, and then checked against the configured minimum. Before the fix, `code_quality` reached the lookup but could not equal `Code quality`, so the verifier emitted `score missing < 8`.
- **P3 decision:** Canonicalize only the dimension comparison by lowercasing, converting underscores to spaces, and collapsing whitespace. Keep punctuation and all other label content significant; do not add aliases, fuzzy matching, or a second parser authority.
- Root cause confirmed by `.ai/harness/runs/20260724-0129-verify-contract-qa-score-normalization/pre-fix.log`: the focused regression guard failed on the unfixed helper with `PRE_FIX_EXIT=1`.
- Sibling sweep found exactly two live `review_score()` implementations: the source helper and packaged mirror. Both were fixed; no additional same-shape implementation remains.

## Deviations From Plan Or Spec

- The deferred-ledger wording described the mismatch as silently unenforced. Direct reproduction showed the verifier actually failed closed with a false `missing` score; the bug was a verification false negative, not a fail-open bypass. The implementation goal was narrowed to the observed behavior without changing scope.

## Tradeoffs Considered

| Option | Decision | Reason |
|--------|----------|--------|
| Convert underscores to spaces and collapse whitespace | Use | Produces one readable canonical label while preserving meaningful punctuation. |
| Remove all separators or add aliases | Reject | Would broaden equivalence beyond the observed contract and become compatibility behavior. |

## Open Questions

- None.

## Evidence Links

- Checks: `.ai/harness/checks/latest.json`
- Pre-fix failure: `.ai/harness/runs/20260724-0129-verify-contract-qa-score-normalization/pre-fix.log`
- Focused guard: `bun test tests/helper-scripts.test.ts -t "verify-contract should enforce snake_case QA dimensions against human-readable Scorecard labels"`
- Full helper suite: `bun test tests/helper-scripts.test.ts` — 122 pass, 0 fail.
- Typecheck: `bun run check:type` — pass after linking the primary worktree's ignored `node_modules` into the isolated worktree.

## Promotion Filter

Promote a candidate to `tasks/lessons.md`, `docs/researches/`, or harness asset files only when all three hold: hard to reverse, surprising without local context, and a real trade-off existed. If any one is missing, keep it in this notes file instead.

## Promotion Candidates

- Promote to `tasks/lessons.md` only after a repeated correction or failure pattern.
- Promote to `docs/researches/` only when it is durable repo knowledge with evidence.
- Promote to harness asset files only after verification across more than one task or fixture.
