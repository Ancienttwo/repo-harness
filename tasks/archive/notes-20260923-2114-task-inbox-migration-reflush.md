> **Archived**: 2026-09-23 21:14
> **Related Plan**: plans/archive/plan-20260923-1153-task-inbox-migration-reflush.md
> **Outcome**: Completed
> **Lifecycle**: notes
> **Parent Run ID**: run-20260923-2114
> **Archive Projection V1**: `plans/plan-20260923-1153-task-inbox-migration-reflush.md` => `plans/archive/plan-20260923-1153-task-inbox-migration-reflush.md`
> **Archive Projection V1**: `tasks/notes/20260923-1153-task-inbox-migration-reflush.notes.md` => `tasks/archive/notes-20260923-2114-task-inbox-migration-reflush.md`
> **Archive Projection V1**: `tasks/contracts/20260923-1153-task-inbox-migration-reflush.contract.md` => `tasks/archive/contract-20260923-2114-task-inbox-migration-reflush.md`
> **Archive Projection V1**: `tasks/reviews/20260923-1153-task-inbox-migration-reflush.review.md` => `tasks/archive/review-20260923-2114-task-inbox-migration-reflush.md`

# Implementation Notes: task-inbox-migration-reflush

> **Status**: Active
> **Plan**: plans/archive/plan-20260923-1153-task-inbox-migration-reflush.md
> **Contract**: tasks/archive/contract-20260923-2114-task-inbox-migration-reflush.md
> **Review**: tasks/archive/review-20260923-2114-task-inbox-migration-reflush.md
> **Last Updated**: 2026-09-23 11:53
> **Lifecycle**: notes

## Design Decisions

- A complete write with failed file fsync is only readable evidence, not a durability receipt. After a failed writeback Linux can mark the pages clean and report the error once, so a later fsync of the same inode proves nothing. Every recovered transaction-owned file (staged file, `.pending` metadata, retirement marker) is verified as this transaction's single-link inode holding the exact bytes or a prefix, then unlinked and recreated through `createFileExclusiveDurably` plus a directory sync.
- Published metadata (journal, rollback journal, receipt, rollback receipt, migration history) is rewritten by atomically renaming a fresh `.pending` inode over the verified published path, so the authority never disappears during the rewrite. Any residue from an interrupted rewrite is a complete owned `.pending` that the next pass consumes.
- A published v2 tree without a receipt is never trusted in place: finishForward renames it back to the stage path and replays staging, which rewrites every file and the marker onto fresh inodes before the tree is published again. The journal keeps the runtime closed throughout. A present receipt is only published after a run rewrote or freshly created the whole tree, so the tree beside it is not retracted again.

## Deviations From Plan Or Spec

- None recorded.

## Tradeoffs Considered

| Option | Decision | Reason |
|--------|----------|--------|
| Re-fsync the matching owned inode | Rejected | A second fsync on a new descriptor can succeed after the failed writeback was consumed, while the byte compare reads only page cache. |
| Recreate a matching complete file on a fresh inode | Chosen | Ownership checks (single link, same inode across lstat/open/re-lstat, exact bytes or prefix) run first; the fresh inode's own fsync is the durability proof. |
| Fail closed on a receiptless published tree | Rejected | A crash between publication and receipt is a normal resumable boundary; retracting and replaying staging is a real rewrite, so fail-closed is not needed. |

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

## PR base verification binding

The digest above binds the accepted slice. After merging `origin/main` at `4271eba604fc759c114cb3ee122d8856acc09504`, hosted CI verifies the full PR against that base; the merge conflicted only in the generated projection manifest, which was retained from `origin/main` and restamped by `repo-harness architecture-projection apply` with no human actions. This range binding records that exact full-PR diff without changing accepted contract or goal authority.

> **Substantive Change SHA256**: `sha256:d9ee61971e66faee21e1b75778f05295642c031a5e158c1eedea4c987f748076`

## Fresh-inode rewrite binding

The independent gate rejected same-inode re-fsync as durability evidence. Recovered transaction files are now rewritten on fresh inodes, published metadata is replaced through a fresh pending inode, and a receiptless published tree is retracted and restaged. Fault-injected tests cover the staged file, retirement marker, prepared receipt, receiptless published tree, existing published journal, and hard-link or replaced-inode ownership changes. Each guard was checked by a local mutation that makes its test fail. This binding records the full PR diff against `origin/main` at `4271eba604fc759c114cb3ee122d8856acc09504`.

> **Substantive Change SHA256**: `sha256:58e25833c1e594db51cccf7b92547d1bd1d25827b3766911a6fb72387ea6aa68`
