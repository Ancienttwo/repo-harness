> **Archived**: 2026-07-12 05:46
> **Related Plan**: plans/archive/plan-20260711-2105-adoption-apply-cutover-v1.md
> **Outcome**: Completed
> **Lifecycle**: notes
> **Parent Run ID**: run-20260712-0546

# Implementation Notes: adoption-apply-cutover-v1

> **Status**: Active
> **Plan**: plans/plan-20260711-2105-adoption-apply-cutover-v1.md
> **Contract**: tasks/contracts/20260711-2105-adoption-apply-cutover-v1.contract.md
> **Review**: tasks/reviews/20260711-2105-adoption-apply-cutover-v1.review.md
> **Last Updated**: 2026-07-12 03:54
> **Lifecycle**: notes

## Design Decisions

- The transaction treats `_ops/` and repo-local host adapter configuration as
  user-owned. The old shell route moved some `_ops` children, but that cannot be
  made ownership-safe from path or content heuristics, so standard adoption now
  preserves them rather than exporting private state to `deploy/`.
- Known-generated cleanup requires byte-identical canonical asset content. A
  textual marker is insufficient ownership proof.
- `--reclaim-runtime` and `--compact` fail before adoption writes until their
  mutations can be represented in the same transaction and rollback manifest.

## Deviations From Plan Or Spec

- The captured plan inherited shell-era `_ops` migration and project-adapter
  retirement. They conflict with its own preservation invariant, so this slice
  fails closed and leaves those user-owned surfaces untouched.

## Tradeoffs Considered

| Option | Decision | Reason |
|--------|----------|--------|
| Preserve `_ops` and adapter files | Do not infer generated ownership | Private state and custom hooks cannot be distinguished safely from their paths alone |
| Reclaim/compact | Reject in `adopt` | Their legacy executor is outside the canonical transaction and cannot share its preflight/rollback evidence |

## Open Questions

- None.

## Evidence Links

- Checks: `.ai/harness/checks/latest.json`
- Run snapshots: `.ai/harness/runs/`
- Focused cutover suite: 2026-07-12, 36 pass / 0 fail across adoption,
  init, migration, hook, helper, and reclaim coverage.
- Full suite: 2026-07-12, 1100 pass / 1 skipped / 0 fail across 97 files.
- Package install smoke: `bash scripts/check-tarball-install-smoke.sh` passed.
- Deep security and architecture re-reviews each returned 0 remaining blockers
  after the added symlink, ownership, archive-collision, mode, Git-index, and
  CLI-boundary regressions.
- Contract verification uses `bun src/cli/index.ts run check-task-workflow --strict`
  in this source worktree. The globally installed `repo-harness` resolved an
  older package during validation, while tarball smoke separately proves the
  packaged CLI path.
- The contract runs the full suite with `bun test --max-concurrency 4`, matching
  `scripts/check-ci.sh`. An unconstrained Bun run races architecture-queue
  fixtures that intentionally share generated helper state; the bounded command
  preserves full-suite coverage while making the verifier result deterministic.

## Promotion Filter

Promote a candidate to `tasks/lessons.md`, `docs/researches/`, or harness asset files only when all three hold: hard to reverse, surprising without local context, and a real trade-off existed. If any one is missing, keep it in this notes file instead.

## Promotion Candidates

- Promote to `tasks/lessons.md` only after a repeated correction or failure pattern.
- Promote to `docs/researches/` only when it is durable repo knowledge with evidence.
- Promote to harness asset files only after verification across more than one task or fixture.
