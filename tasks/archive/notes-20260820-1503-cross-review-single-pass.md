> **Archived**: 2026-08-20 15:03
> **Related Plan**: plans/archive/plan-20260820-1436-cross-review-single-pass.md
> **Outcome**: Completed
> **Lifecycle**: notes
> **Parent Run ID**: run-20260820-1503

# Implementation Notes: cross-review-single-pass

> **Status**: Active
> **Plan**: plans/plan-20260820-1436-cross-review-single-pass.md
> **Contract**: tasks/contracts/20260820-1436-cross-review-single-pass.contract.md
> **Review**: tasks/reviews/20260820-1436-cross-review-single-pass.review.md
> **Last Updated**: 2026-08-20 14:37
> **Lifecycle**: notes

## Design Decisions

- P1 map: `.ai/harness/policy.json` and its three generation sources declare the limit; `runCrossReviewCommand` resolves active plan/contract authority; the runner owns the last boundary before provider spawn; the existing circuit state owns serialized attempt persistence; the pure review module owns severity parsing.
- P2 trace: active-plan marker -> active-worktree ownership -> plan `Task Contract` header -> configured limit -> `semantic-review` circuit keyed by the stable contract path -> runner admission callback -> provider. A changed diff never changes the contract key, so a second call returns `review_budget_exhausted` before process execution.
- P3 decision: Keep provider-internal retry (`MAX_ATTEMPTS=2`) separate from semantic review admission (`1` per work-package). Reuse the existing lock/state protocol, add no reset or override, preserve standalone review behavior when no active plan exists, and fail closed when active authority or policy is malformed.
- Finding parsing accepts only the existing finding grammar plus Markdown emphasis around the whole line or severity marker. It does not scan prose or infer severity heuristically.

## Deviations From Plan Or Spec

- None recorded.

## Tradeoffs Considered

| Option | Decision | Reason |
|--------|----------|--------|
| Key the budget by changing review-subject hash | Rejected | A correction changes the hash and recreates the infinite loop. |
| Key the budget by active contract path | Selected | The contract is the stable work-package acceptance identity across corrections. |
| Add a re-review/reset switch | Rejected | It defeats the requested terminal boundary. |
| Create a separate receipt store | Rejected | The existing circuit state already provides locking, validation, and atomic persistence. |

## Open Questions

- None.

## Evidence Links

- Checks: `.ai/harness/checks/latest.json`
- Run snapshots: `.ai/harness/runs/`
- Pre-fix failures: `tasks/notes/20260820-1436-cross-review-single-pass.pre-fix.log`
- Focused verification: 76 tests passed across cross-review, circuit-breaker, and policy seeding suites.
- Full verification: `env -u CODEX_SESSION_ID bun test` — 2712 passed, 1 skipped, 0 failed.
- Required checks: typecheck, deploy SQL order, architecture sync, task sync, strict workflow, project-state inspection, and init dry-run all passed.

## Promotion Filter

Promote a candidate to `tasks/lessons.md`, `docs/researches/`, or harness asset files only when all three hold: hard to reverse, surprising without local context, and a real trade-off existed. If any one is missing, keep it in this notes file instead.

## Promotion Candidates

- None. The reusable invariant is now enforced directly by policy, code, generated policy seeds, and regression tests.
