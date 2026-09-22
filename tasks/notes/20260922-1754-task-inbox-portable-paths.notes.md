# Implementation Notes: task-inbox-portable-paths

> **Status**: Active
> **Plan**: plans/plan-20260922-1754-task-inbox-portable-paths.md
> **Contract**: tasks/contracts/20260922-1754-task-inbox-portable-paths.contract.md
> **Review**: tasks/reviews/20260922-1754-task-inbox-portable-paths.review.md
> **Last Updated**: 2026-09-22 18:01
> **Lifecycle**: notes

## Design Decisions

- The journal is an immutable source/target manifest, published from a durable prepared file. Filesystem state plus exact inventory determines recovery; no phase counter can falsely admit a partial cutover. A separate immutable rollback journal preserves reversal intent across crashes.
- Source approval includes the resolved common-directory path and device/inode identity. A matching history copied into another repository cannot reuse approval.
- Existing canonical record validators remain the only record authority. Runtime reads v2 only; legacy parsing is confined to the explicit migration.

## Deviations From Plan Or Spec

- A task-lock migration transaction cannot prove that every legacy binary has stopped. The explicit offline release contract remains mandatory. Windows file flushes do not imply POSIX directory-fsync power-loss guarantees.

## Tradeoffs Considered

| Option | Decision | Reason |
|--------|----------|--------|
| Mutable phase journal | Rejected | Rewriting a phase adds a second state to reconcile; immutable manifest plus validated directory transitions suffices. |
| Case-only v1 fixture pair on default macOS | Rejected | The old layout already overwrites the first identity. Native fresh-v2 tests prove separate Alice/alice delivery and ACK; migration refuses mismatched historical paths. |

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
