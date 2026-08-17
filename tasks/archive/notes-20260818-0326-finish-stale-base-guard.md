> **Archived**: 2026-08-18 03:26
> **Related Plan**: plans/archive/plan-20260818-0233-finish-stale-base-guard.md
> **Outcome**: Completed
> **Lifecycle**: notes
> **Parent Run ID**: run-20260818-0326

# Implementation Notes: finish-stale-base-guard

> **Status**: Active
> **Plan**: plans/plan-20260818-0233-finish-stale-base-guard.md
> **Contract**: tasks/contracts/20260818-0233-finish-stale-base-guard.contract.md
> **Review**: tasks/reviews/20260818-0233-finish-stale-base-guard.review.md
> **Last Updated**: 2026-08-18 02:33
> **Lifecycle**: notes

## Design Decisions

- The second guard (pre-publication, adjacent to the freeze recheck) exits through `finish_transaction_abort` + `return 1`, not `exit 1`. The surrounding pre-publication checks use bare `exit 1`, but the journal/transaction is open at that point, so the plan's stated rollback path requires the abort call — matching `:1596-1604`, not the neighbouring dirty-target check.
- Both guards test ancestry against `$current_branch` rather than `HEAD`. At the pre-publication point the archive step has already advanced the branch, and the pre-publication freeze recheck at the same site already resolves `"$current_branch^{commit}"`, so the branch ref is the consistent subject.

## Deviations From Plan Or Spec

- The plan named `bun run check:type` as a direct exit criterion; the worktree had no `node_modules`, so `bun install` was run first (115 packages) before `tsc --noEmit` could execute. No dependency change.

## Tradeoffs Considered

| Option | Decision | Reason |
|--------|----------|--------|
| ... | ... | ... |

## Open Questions

- None.

## Evidence Links

- Checks: `.ai/harness/checks/latest.json`
- Run snapshots: `.ai/harness/runs/`

## Promotion Filter

Promote a candidate to `tasks/lessons.md`, `docs/researches/`, or harness asset files only when all three hold: hard to reverse, surprising without local context, and a real trade-off existed. If any one is missing, keep it in this notes file instead.

## Promotion Candidates

- Promote to `tasks/lessons.md` only after a repeated correction or failure pattern.
- Promote to `docs/researches/` only when it is durable repo knowledge with evidence.
- Promote to harness asset files only after verification across more than one task or fixture.
