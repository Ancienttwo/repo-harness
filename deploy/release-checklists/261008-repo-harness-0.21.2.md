# repo-harness 0.21.2 preparation

## Scope and authority

- Remote base: `e7c86c553f229a0068dba7bef727192c8a93220c` (#600).
- Include #599 at `84c225c1ebfe9ce34f4e6268662714241ca0b33b` and
  #601 at `f5ee55b1dd69f5fc51cf20f78c4d6b995b69cfcd`.
- Kanban runtime status comes from #606 on main at
  `5f6065b47443f1183166ec9999f71698eb1b9eb1`.
  Parent: `98c30ab6228b94f5e46c8cc3290de281eb0e4a99`.
  #606 supersedes the earlier Kanban commit `9afef1ee`. The main sync merge
  takes the #606 content for every file that `9afef1ee` changed.
- Set package, skill, template and README versions to `0.21.2`.
- Keep strategy default-off, export-only and human-owned. No automatic memory
  edits or dispatch. Proposals keep `executionAuthorized: false`.
- Kanban status is a read-only projection from native sources or optional
  Herdr. Runtime status grants no task completion authority. Python 3.9 or
  later is needed only for Claude and Pi capture.
- No merge, tag, npm publish or installed user runtime update is authorized here.
  Parent review and publication coordination must follow final acceptance.

## Integration decisions

P1 map: strategy CLI reads canonical context through bounded observation.
Managed worktree operations own topology, markers and exact cleanup. Kanban
projects runtime observation into the operator board. None replaces task state.

P2 trace: `strategy pilot` selects the fixed pilot document, creates one bounded
reader, reads current and pinned evidence, observes canonical state and repeats
source confirmations. Validation binds the current digest and reality constraints.
`resolveGitCommonDirectory` uses the observation wrapper inside this scope and
the normal configured Git binary and timeout outside it.

P3 decision: merge both source histories. Retain observation helper projection
and worktree-location projection. Retain configured Git and timeout. Preserve
atomic outcome publication, start markers and all sweep regressions. Refresh
pilot provenance after the final README and plan contents are committed. Keep
128 KiB file / 4 MiB request / 5 second pilot bounds, and global 64 KiB / 1 MiB.
At greater repository size the reader fails closed; do not raise limits here.

## Acceptance procedure

Run on the frozen candidate with Bun 1.4.2, Node 24 and locked dependencies.
Use temporary HOME and mutable tool roots. Preserve platform proxy and CA.
Clear provider credentials and inherited Herdr endpoint variables. Real Herdr
fixtures use fake provider executables, private HOME and random owned sessions.
Only fixture-owned processes and paths may be stopped or removed.

1. Typecheck and affected tests selected against the exact remote base.
2. Full `bun run check:release`, including governance, complete test files and
   the shared package/install smoke. Record failures and omitted coverage.
3. Real explicit strategy pilot with `--load strategy-boundaries`, proposal
   validation, byte counts and before/after no-write evidence.
4. Kanban UI regressions, native capture tests and real isolated Herdr
   structured-status fixtures.
5. Read-only review of integration and test assertions. Parent reviews results.

## Rollback evidence

- #600 merge: `e7c86c553f229a0068dba7bef727192c8a93220c`.
  Parent: `3ea2f7b71c4eef95e158788b8564179034eef9a2`.
  `git revert --no-edit e7c86c553f229a0068dba7bef727192c8a93220c`.
  Let active sweeps finish pending trash first. Removed worktrees cannot be
  restored by reverting code. Old location can be set in downstream policy.
- Strategy integration merge: `b2bd276c03bba0f85ddbdcf9620fd28edfe28dd9`.
  First parent: `e7c86c553f229a0068dba7bef727192c8a93220c`.
  Second parent: `f5ee55b1dd69f5fc51cf20f78c4d6b995b69cfcd`.
  Local rollback: `git revert --no-edit -m 1 b2bd276c03bba0f85ddbdcf9620fd28edfe28dd9`.
- The integration PR has no main merge SHA until parent publication. Record
  that exact SHA and parent before publication. Do not substitute a candidate
  SHA for a future squash merge. No rollback command here undoes npm publication.
- Remove an explicitly installed strategy Skill with `strategy uninstall-skill`
  before package rollback. Project memory was not written by this feature.

## Acceptance status

Preparation only. Final-tree release acceptance has not run. Historical checks
from source PRs do not prove this integration candidate.
