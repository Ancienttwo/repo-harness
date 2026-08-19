# Implementation Notes: finish-auto-cleanup

> **Status**: Active
> **Plan**: plans/plan-20260819-2155-finish-auto-cleanup.md
> **Contract**: tasks/contracts/20260819-2155-finish-auto-cleanup.contract.md
> **Review**: tasks/reviews/20260819-2155-finish-auto-cleanup.review.md
> **Last Updated**: 2026-08-19 21:55
> **Lifecycle**: notes

## Design Decisions

- The cleanup attempt is placed strictly after `finish_transaction_commit`, so
  the publication transaction's EXIT trap is already disarmed. A cleanup
  refusal therefore cannot reach `finish_transaction_abort` and unwind a
  publication that already landed.
- Cleanup runs as a subprocess, not inline. `cleanup_worktree` is fail-closed
  and must run from the target primary worktree; the child receives both
  `cd "$target_worktree"` and `REPO_HARNESS_TARGET_REPO_ROOT="$target_worktree"`
  because the parent exported that variable pointing at the linked worktree and
  the child would otherwise resolve back into the worktree it is deleting.
- Nothing runs after the cleanup block, which is what makes deleting this
  process's own cwd safe. An inline comment records that constraint so a future
  edit does not append work below it.
- The refusal path degrades to a stderr hint and never changes finish's exit
  code. Automatic cleanup is a convenience at the tail of a completed
  publication, not a gate on it.
- The refusal hint uses `repo-harness run contract-worktree cleanup ...`. The
  repo-local `bash scripts/contract-worktree.sh ...` form only resolves in this
  self-hosting repo; downstream installs execute helpers from the package via
  `src/cli/runtime/helper-runner.ts` `PACKAGE_HELPERS_ROOT` and have no
  `scripts/` copy.
- The hint is two lines, not three. A third line pointing at
  `ship-worktrees --cleanup-merged --discard-scaffold-only` duplicated what
  `cleanup_worktree` already prints on the dirty branch, and the subprocess's
  stderr passes through to the operator unchanged.

## Deviations From Plan Or Spec

- The plan named no policy knob and none was added, as planned. The one
  addition beyond the captured plan is the hint-wording constraint above, which
  came out of gatekeeper review rather than the original planning output.

## Tradeoffs Considered

| Option | Decision | Reason |
|--------|----------|--------|
| Inline cleanup inside `finish_worktree` | Rejected | `cleanup_worktree` is fail-closed on repo root and cwd; running it inline in the linked worktree's process would refuse |
| Fail `finish --merge` when cleanup refuses | Rejected | The publication already landed; a non-zero exit would misreport a successful merge and invite a retry that cannot help |
| Policy knob to opt out of auto-cleanup | Rejected | No observed consumer needs the old behavior, and the refusal path already leaves the worktree intact |

## Open Questions

- None.

## Evidence Links

- Checks: `.ai/harness/checks/latest.json`
- Run snapshots: `.ai/harness/runs/`

## Promotion Filter

Promote a candidate to `tasks/lessons.md`, `docs/researches/`, or harness asset files only when all three hold: hard to reverse, surprising without local context, and a real trade-off existed. If any one is missing, keep it in this notes file instead.

## Promotion Candidates

- Candidate for `tasks/lessons.md` only if the hint-path class of bug recurs:
  user-facing command hints inside `scripts/*.sh` helpers must use the
  `repo-harness run <helper> ...` form, because downstream repos execute the
  package copy and have no `scripts/` directory. Held here pending a second
  occurrence.
