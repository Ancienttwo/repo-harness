> **Archived**: 2026-09-05 03:33
> **Related Plan**: plans/archive/plan-20260905-0312-workflow-artifact-cleanup.md
> **Outcome**: Completed
> **Lifecycle**: notes
> **Parent Run ID**: run-20260905-0333
> **Archive Projection V1**: `plans/plan-20260905-0312-workflow-artifact-cleanup.md` => `plans/archive/plan-20260905-0312-workflow-artifact-cleanup.md`
> **Archive Projection V1**: `tasks/notes/20260905-0312-workflow-artifact-cleanup.notes.md` => `tasks/archive/notes-20260905-0333-workflow-artifact-cleanup.md`
> **Archive Projection V1**: `tasks/contracts/20260905-0312-workflow-artifact-cleanup.contract.md` => `tasks/archive/contract-20260905-0333-workflow-artifact-cleanup.md`
> **Archive Projection V1**: `tasks/reviews/20260905-0312-workflow-artifact-cleanup.review.md` => `tasks/archive/review-20260905-0333-workflow-artifact-cleanup.md`

# Implementation Notes: workflow-artifact-cleanup

> **Status**: Active
> **Plan**: plans/archive/plan-20260905-0312-workflow-artifact-cleanup.md
> **Contract**: tasks/archive/contract-20260905-0333-workflow-artifact-cleanup.md
> **Review**: tasks/archive/review-20260905-0333-workflow-artifact-cleanup.md
> **Last Updated**: 2026-09-05 03:12
> **Lifecycle**: notes

## Design Decisions

- Pre-cleanup classifier returned 13 `HOLD` rows. It was used as a safety
  boundary, not overridden as evidence for `Completed`.
- Retained three live families:
  `20260721-1743-sprint-strict-queue-enforcement` (Draft and unimplemented),
  `20260902-2101-issue-283-immutable-task-id` (Contract Partial with an explicit
  residual), and `20260904-0517-acceptance-redaction-idempotence` (one approved
  post-merge task remains).
- Archived release 0.17.0 as `Completed` only after read-only contract
  verification passed and the sealed-terminal classifier returned `AUTO`.
- Archived nine landed but unsealed historical families as `Superseded`.
  Their code or release result exists on main, but their original workflow
  families cannot truthfully claim `Completed` because current acceptance
  evidence is missing or incomplete.
- Rewrote the obsolete composite Sprint-schema Todo: immutable IDs (#283),
  dependency authority (#284), and acquire-next ordering (#280) have landed;
  only explicit parallel-safety authority remains deferred.

## Deviations From Plan Or Spec

- The parallel BRC4 process was allowed to advance independently. Verification
  therefore checks that this cleanup branch changes only `plans/` and `tasks/`,
  rather than comparing a moving external worktree byte-for-byte.

## Tradeoffs Considered

| Option | Decision | Reason |
|--------|----------|--------|
| Reconstruct missing reviews or AcceptanceReceipts | Reject | Would invent historical acceptance authority. |
| Mark every landed implementation Completed | Reject | Landed code does not satisfy the archive helper's evidence gate. |
| Use `Superseded` for landed but unsealed families | Use | Preserves history while stating that the old workflow is no longer execution authority. |
| Add BRC4 items to Todo | Reject | The current Sprint already owns BRC4 through BRC15. |

## Open Questions

- None.

## Evidence Links

- Checks: `.ai/harness/checks/latest.json`
- Run snapshots: `.ai/harness/runs/`
- Classifier: `repo-harness run classify-historical-plans -- --repo . --format tsv`
- External issue state: GitHub issues #280 through #284 are closed; this was
  used only to show that their old Plan families are no longer live authority.

## Promotion Filter

Promote a candidate to `tasks/lessons.md`, `docs/researches/`, or harness asset files only when all three hold: hard to reverse, surprising without local context, and a real trade-off existed. If any one is missing, keep it in this notes file instead.

## Promotion Candidates

- None. The durable lifecycle rules already live in `AGENTS.md` and the archive
  helper; this slice only applies them to stale artifacts.
