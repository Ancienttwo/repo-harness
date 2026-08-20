> **Archived**: 2026-08-20 23:32
> **Related Plan**: plans/archive/plan-20260820-2054-mcp-workspace-cleanup-target-binding.md
> **Outcome**: Completed
> **Lifecycle**: notes
> **Parent Run ID**: run-20260820-2332

# Implementation Notes: mcp-workspace-cleanup-target-binding

> **Status**: Active
> **Plan**: plans/plan-20260820-2054-mcp-workspace-cleanup-target-binding.md
> **Contract**: tasks/contracts/20260820-2054-mcp-workspace-cleanup-target-binding.contract.md
> **Review**: tasks/reviews/20260820-2054-mcp-workspace-cleanup-target-binding.review.md
> **Last Updated**: 2026-08-20 22:04
> **Lifecycle**: notes

## Design Decisions

- `baseRef/baseSha` remain creation-base data. Cleanup authority is the separately persisted canonical `integrationTargetRef`; the default binds creation-time symbolic `HEAD` to a full local branch ref.
- Cleanup consumes the packaged `scripts/worktree-merge-lib.sh` batch entrypoint so direct ancestry and squash absorption keep one typed authority. An unavailable Bash/helper path fails closed as `MERGE_CHECK_UNAVAILABLE`; native Windows portability remains the separately tracked platform-contract issue.
- A bound target cannot be overridden. `--target` is accepted only to clean legacy rows with no target (or literal floating `HEAD`); malformed, unresolvable, or mismatching bound targets remain blocked.
- The merge authority receives immutable branch/target commit snapshots. After worktree removal, one `git update-ref --stdin` transaction verifies that the target still names its classified commit and deletes the branch only at its classified commit. Concurrent target or branch movement therefore retains the branch and state row instead of widening `git branch -D` into a time-of-check/time-of-use deletion gap.
- Checkout-mode workspaces remain unmanaged and expose `integration_target_ref: null`; only managed worktrees resolve or require the cleanup target, so detached checkout behavior is unchanged.

## Deviations From Plan Or Spec

- None recorded.

## Tradeoffs Considered

| Option | Decision | Reason |
|--------|----------|--------|
| Re-implement `merge-base` plus `merge-tree` in TypeScript | Rejected | It recreates the exact dual-authority drift fixed by issue #196. |
| Treat `baseRef` as the cleanup target | Rejected | A creation base may be a commit/tag and does not name the branch that must eventually contain the work. |
| Infer a target for every legacy row | Rejected | There is no authoritative historical integration target; explicit `--target` is the bounded operator migration path. |

## Open Questions

- None.

## Evidence Links

- Checks: `.ai/harness/checks/latest.json`
- Run snapshots: `.ai/harness/runs/`
- Pre-fix regression: `.ai/harness/runs/mcp-workspace-cleanup-target-binding/pre-fix-regression.txt` (`PRE_FIX_EXIT=1`; old cleanup deleted against incidental `HEAD`).

## Promotion Filter

Promote a candidate to `tasks/lessons.md`, `docs/researches/`, or harness asset files only when all three hold: hard to reverse, surprising without local context, and a real trade-off existed. If any one is missing, keep it in this notes file instead.

## Promotion Candidates

- Promote to `tasks/lessons.md` only after a repeated correction or failure pattern.
- Promote to `docs/researches/` only when it is durable repo knowledge with evidence.
- Promote to harness asset files only after verification across more than one task or fixture.
