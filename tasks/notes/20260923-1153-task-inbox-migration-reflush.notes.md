# Implementation Notes: task-inbox-migration-reflush

> **Status**: Active
> **Plan**: plans/plan-20260923-1153-task-inbox-migration-reflush.md
> **Contract**: tasks/contracts/20260923-1153-task-inbox-migration-reflush.contract.md
> **Review**: tasks/reviews/20260923-1153-task-inbox-migration-reflush.review.md
> **Last Updated**: 2026-09-23 11:53
> **Lifecycle**: notes

## Design Decisions

- A complete write with failed file fsync is only readable evidence, not a durability receipt. Reuse of transaction-owned bytes must reopen and flush that same single-link inode before any migration receipt publication.

## Deviations From Plan Or Spec

- None recorded.

## Tradeoffs Considered

| Option | Decision | Reason |
|--------|----------|--------|
| Recreate a matching complete file | Rejected | A rename/unlink introduces an avoidable identity and directory mutation; flushing the exact owned inode preserves the one-shot transaction. |

## Open Questions

- Already completed migration receipts from earlier code cannot be retroactively proven durable by this repair; this slice guards future explicit recovery and retains historical receipts unchanged.

## Evidence Links

- Checks: `.ai/harness/checks/latest.json`
- Run snapshots: `.ai/harness/runs/`

## Promotion Filter

Promote a candidate to `tasks/lessons.md`, `docs/researches/`, or harness asset files only when all three hold: hard to reverse, surprising without local context, and a real trade-off existed. If any one is missing, keep it in this notes file instead.

## Promotion Candidates

- Promote to `tasks/lessons.md` only after a repeated correction or failure pattern.
- Promote to `docs/researches/` only when it is durable repo knowledge with evidence.
- Promote to harness asset files only after verification across more than one task or fixture.

## Confirmed regression

`tests/effects/task-inbox-layout-migration.test.ts` failed before the source edit: 44 pass, 1 fail, `PRE_FIX_EXIT=1`; the failing resume returned committed while the staged file had no successful flush. With the source edit, 46 migration tests and typecheck passed. The second test verifies complete prepared receipt recovery. Architecture plan/apply changed only the generated manifest after the owner approved this worktree's local CodeGraph index.

> **Substantive Change SHA256**: `sha256:a9f593f96025b88f9d630c92ea4e2f9c282a834022f7d94c08158d255a3568f3`
