> **Archived**: 2026-08-20 14:48
> **Related Plan**: plans/archive/plan-20260820-1245-finish-abort-recovery.md
> **Outcome**: Completed
> **Lifecycle**: notes
> **Parent Run ID**: run-20260820-1448

# Implementation Notes: finish-abort-recovery

> **Status**: Active
> **Plan**: plans/plan-20260820-1245-finish-abort-recovery.md
> **Contract**: tasks/contracts/20260820-1245-finish-abort-recovery.contract.md
> **Review**: tasks/reviews/20260820-1245-finish-abort-recovery.review.md
> **Last Updated**: 2026-08-20 14:23
> **Lifecycle**: notes

## Design Decisions

- Keep publication proof in `contract-worktree.sh`; the CLI independently requires the original claim, bound worktree, recorded target ref, and canonical pending row.
- Write `completing -> bound` before marking the closeout journal `aborted`. The transition admits the already-restored `bound`/null-key shape so a crash between those two durable writes is safely replayable.
- Record `target_ref` in the pre-journal closeout ownership claim. A fresh `recover abort` process otherwise cannot recover a non-default `finish --target` without guessing authority.

## Deviations From Plan Or Spec

- None recorded.

## Tradeoffs Considered

| Option | Decision | Reason |
|--------|----------|--------|
| Put abort logic only in the shell | Rejected | Would bypass the existing per-task lock and duplicate fencing checks. |
| Let the CLI infer publication outcome | Rejected | Git publication and journal evidence belong to the closeout transaction owner, not the lease state machine. |
| Mark journal aborted before restoring lease | Rejected | A crash would erase the only recovery instruction while leaving cross-agent takeover blocked. |

## Open Questions

- None.

## Evidence Links

- Checks: `.ai/harness/checks/latest.json`
- Run snapshots: `.ai/harness/runs/`
- Pre-fix falsifier: `.ai/harness/runs/finish-abort-recovery.pre-fix.log` failed because `recover abort` left the lease `completing`.
- Focused regression suite: 97 pass, 0 fail across coordination identity/store, whole-loop SIGKILL continuation, and closeout journal tests.
- Full suite: 2708 pass, 1 platform skip, 0 fail across 199 files when run with real process/HOME/socket permissions and blank ambient Codex session identifiers.
- Shipped runtime: tarball install smoke passed; local CLI help exposes `sprint abort-completion`; 55 helper projections and the source/template mirror are exact.
- Root gates: TypeScript, deploy SQL order, architecture sync/projection, task sync, strict workflow, project-state inspection, and self-host init dry-run all passed.

## Promotion Filter

Promote a candidate to `tasks/lessons.md`, `docs/researches/`, or harness asset files only when all three hold: hard to reverse, surprising without local context, and a real trade-off existed. If any one is missing, keep it in this notes file instead.

## Promotion Candidates

- Promote to `tasks/lessons.md` only after a repeated correction or failure pattern.
- Promote to `docs/researches/` only when it is durable repo knowledge with evidence.
- Promote to harness asset files only after verification across more than one task or fixture.
