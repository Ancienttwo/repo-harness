> **Archived**: 2026-09-05 02:36
> **Related Plan**: plans/archive/plan-20260905-0201-task-sync-archived-evidence.md
> **Outcome**: Completed
> **Lifecycle**: notes
> **Parent Run ID**: run-20260905-0236
> **Archive Projection V1**: `plans/plan-20260905-0201-task-sync-archived-evidence.md` => `plans/archive/plan-20260905-0201-task-sync-archived-evidence.md`
> **Archive Projection V1**: `tasks/notes/20260905-0201-task-sync-archived-evidence.notes.md` => `tasks/archive/notes-20260905-0236-task-sync-archived-evidence.md`
> **Archive Projection V1**: `tasks/contracts/20260905-0201-task-sync-archived-evidence.contract.md` => `tasks/archive/contract-20260905-0236-task-sync-archived-evidence.md`
> **Archive Projection V1**: `tasks/reviews/20260905-0201-task-sync-archived-evidence.review.md` => `tasks/archive/review-20260905-0236-task-sync-archived-evidence.md`

# Implementation Notes: task-sync-archived-evidence

> **Status**: Active
> **Plan**: plans/archive/plan-20260905-0201-task-sync-archived-evidence.md
> **Contract**: tasks/archive/contract-20260905-0236-task-sync-archived-evidence.md
> **Review**: tasks/archive/review-20260905-0236-task-sync-archived-evidence.md
> **Last Updated**: 2026-09-05 02:01
> **Lifecycle**: notes

## Design Decisions

- Treat only archive artifacts added during the effective-base-to-final-tree publication as evidence. A pre-existing archive remains historical and cannot be edited to satisfy a new substantive digest.
- Limit archive evidence to the same canonical lifecycle families accepted before closeout: plan, contract, review, and notes. Todo archives remain non-evidence.
- Reuse Git's add classification with rename detection disabled, so destination-path admission is independent of user Git config, and retain the existing exact digest line; do not introduce a second parser for archive envelopes.

> **Substantive Change SHA256**: `sha256:c8a1e8b05f4d9a628102a2d480975b371e3e1039c872883c98d5337067962bbe`

## Deviations From Plan Or Spec

- None recorded.

## Tradeoffs Considered

| Option | Decision | Reason |
|--------|----------|--------|
| Accept every changed archive | Reject | It would let a historical archive be edited to launder an unrelated digest. |
| Parse `Archive Projection V1` again | Reject | Archive structure already has an owner; task-sync only needs range membership plus the existing exact digest binding. |
| Accept newly added canonical archive artifacts | Use | It models the single-publication closeout while preserving fail-closed behavior for historical files. |

## Open Questions

- None.

## Evidence Links

- Checks: `.ai/harness/checks/latest.json`
- Run snapshots: `.ai/harness/runs/`
- Pre-fix regression: `.ai/harness/runs/task-sync-archived-evidence/pre-fix.log` (`PRE_FIX_EXIT=1`)
- Focused suite: `bun test tests/check-task-sync.test.ts --timeout 60000` — 25 pass, 0 fail.
- Full suite: `bun test --timeout 60000` — 4148 pass, 4 skip, 0 fail, 53959 assertions.

## Promotion Filter

Promote a candidate to `tasks/lessons.md`, `docs/researches/`, or harness asset files only when all three hold: hard to reverse, surprising without local context, and a real trade-off existed. If any one is missing, keep it in this notes file instead.

## Promotion Candidates

- None. The invariant is enforced directly by the helper and regression tests.
