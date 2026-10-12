# repo-harness 0.21.2 publication record

## Scope and authority

- Remote base: `daa49e202b49068418ead6a78e399d851ddf3d73` (#615), after the
  fifth main sync merge. The fourth main sync used `80e773fa1b91c075ddef0a0cc47203920a57e23e` (#616).
  The third main sync used `bd1b971f93d062ac654acdc6ef93c0a92d5d9cb9` (#608). The second main sync used `461e054ee5538bc4038fee8b5c3c5011435fbbf8` (#607).
  The first main sync used `5f6065b47443f1183166ec9999f71698eb1b9eb1` (#606).
  The original fork point was `e7c86c553f229a0068dba7bef727192c8a93220c` (#600).
- Include #599 at `84c225c1ebfe9ce34f4e6268662714241ca0b33b` and
  #601 at `f5ee55b1dd69f5fc51cf20f78c4d6b995b69cfcd`.
- Kanban runtime status comes from #606 on main at
  `5f6065b47443f1183166ec9999f71698eb1b9eb1`.
  Parent: `98c30ab6228b94f5e46c8cc3290de281eb0e4a99`.
  #606 supersedes the earlier Kanban commit `9afef1ee`. The main sync merge
  takes the #606 content for every file that `9afef1ee` changed.
- Native Pi 1.1.0 host support comes from #607 on main at
  `461e054ee5538bc4038fee8b5c3c5011435fbbf8`.
  Parent: `5f6065b47443f1183166ec9999f71698eb1b9eb1`.
  It includes the OAR 0.45.1 upgrade. This release pins the Pi peer
  dependency to exactly `1.1.0` and records Pi telemetry host `pi`.
- The pinned Herdr install for macOS native CI comes from #612 on main at
  `94face4506806d4b7f376d2e9761d5d26e70b5c6`.
  Parent: `461e054ee5538bc4038fee8b5c3c5011435fbbf8`. CI only.
- PM Bot operations and the Hermes adapter come from #608 on main at
  `bd1b971f93d062ac654acdc6ef93c0a92d5d9cb9`.
  Parent: `94face4506806d4b7f376d2e9761d5d26e70b5c6`. The package adds
  `dist/oar-coding-host.js` and two PM references. Live Hermes configuration
  and a real coding-provider task are not verified. Only macOS Codex workers
  are conditionally supported.
- CI pins Bun 1.4.3 from #616 on main at
  `80e773fa1b91c075ddef0a0cc47203920a57e23e`.
  Parent: `bd1b971f93d062ac654acdc6ef93c0a92d5d9cb9`. CI only.
- The scoped PM MCP adapter comes from #615 on main at
  `daa49e202b49068418ead6a78e399d851ddf3d73`.
  Parent: `80e773fa1b91c075ddef0a0cc47203920a57e23e`. It adds no shell tool,
  ledger, approval identity or credentials. Dot, live-provider and event wake
  are not verified.
- Set package, skill, template and README versions to `0.21.2`.
- Keep strategy default-off, export-only and human-owned. No automatic memory
  edits or dispatch. Proposals keep `executionAuthorized: false`.
- Kanban status is a read-only projection from native sources or optional
  Herdr. Runtime status grants no task completion authority. Python 3.9 or
  later is needed only for Claude and Pi capture.
- The preparation phase did not authorize merge, tag, npm publication or
  an installed user runtime update. The later owner approval below superseded
  that preparation limit for the final 0.21.2 publication only.

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
- #607 squash merge: `461e054ee5538bc4038fee8b5c3c5011435fbbf8`.
  Parent: `5f6065b47443f1183166ec9999f71698eb1b9eb1`.
  `git revert --no-edit 461e054ee5538bc4038fee8b5c3c5011435fbbf8`.
  A revert does not remove a Pi package that a user installed with `pi install`.
- #612 squash merge: `94face4506806d4b7f376d2e9761d5d26e70b5c6`.
  Parent: `461e054ee5538bc4038fee8b5c3c5011435fbbf8`.
  `git revert --no-edit 94face4506806d4b7f376d2e9761d5d26e70b5c6`.
- #608 squash merge: `bd1b971f93d062ac654acdc6ef93c0a92d5d9cb9`.
  Parent: `94face4506806d4b7f376d2e9761d5d26e70b5c6`.
  `git revert --no-edit bd1b971f93d062ac654acdc6ef93c0a92d5d9cb9`.
  Operator Hermes configuration is a separate activation step; a revert does
  not change a Hermes profile that an operator set up.
- #616 squash merge: `80e773fa1b91c075ddef0a0cc47203920a57e23e`.
  Parent: `bd1b971f93d062ac654acdc6ef93c0a92d5d9cb9`.
  `git revert --no-edit 80e773fa1b91c075ddef0a0cc47203920a57e23e`.
- #615 squash merge: `daa49e202b49068418ead6a78e399d851ddf3d73`.
  Parent: `80e773fa1b91c075ddef0a0cc47203920a57e23e`.
  `git revert --no-edit daa49e202b49068418ead6a78e399d851ddf3d73`.
- #604 release squash: `942f3fca4195facb298ffc48dc5c7f3c804de8ce`.
  Parent: `62ad418b8640c71d15e3b0f207c70e523fe8d4cf`.
  `git revert --no-edit 942f3fca4195facb298ffc48dc5c7f3c804de8ce`.
  No rollback command here undoes npm publication.
- Remove an explicitly installed strategy Skill with `strategy uninstall-skill`
  before package rollback. Project memory was not written by this feature.

## Acceptance status

- Full `bun run check:release` ran at `b358387e553a02200a91e5ef1064f299d3444428`.
  417 test files ran. 416 passed. `tests/contract-worktree-closeout-journal.test.ts`
  failed because the caller set `REPO_HARNESS_BUN_BIN`, which leaked into a
  fixture subprocess. #618 fixed that test isolation. A rerun of that file
  without the variable passed 26/26. The shared tarball smoke did not run in
  that gate, so it ran alone at the same commit and returned 0.
- Delta checks after the #615 and #616 syncs at
  `13f18136`: typecheck, hook and helper projections, 8 affected test files
  (289 tests, 0 failures) and the tarball smoke passed.
- The Codex review finding on impossible expiry dates was fixed in
  `aad32b8e` with a regression case. PR CI passed on the final head
  `db80d59d29af5c41468f047c159bd1a8eb3bfb92`.
- Strategy pilot at the source release commit with
  `--load strategy-boundaries`: exit 0, `executionAuthorized: false`,
  `truncated: false`, 10,849 output bytes, one 7,576-byte memory body. Git
  status, including ignored files, was identical before and after. The packet
  reports two unknowns: README evidence is unverified at this revision, and
  one goal fact is unsupported. There is no business-success verdict.

## Owner approval

On 2026-10-12 (Asia/Singapore), the owner confirmed in the issue and PR
closeout session that prior approval covered the final #604 merge, the
`v0.21.2` tag, npm and GitHub publication, and the local runtime update.
The owner authorized this confirmation to be added to this record.
This records the earlier approval. It grants no new release authority.

## Publication status

- Status: npm and GitHub publication verified on 2026-10-11.
- Source release commit: `942f3fca4195facb298ffc48dc5c7f3c804de8ce` (#604
  squash merge). Parent: `62ad418b8640c71d15e3b0f207c70e523fe8d4cf` (#618).
  Its tree equals the CI-verified head `db80d59d` plus the #618 test change.
  #617 and later main commits are not in 0.21.2.
- Annotated tag `v0.21.2`: object `00f3e874c773eeba381f0607123f29ea9b139350`,
  pointing to the source release commit.
- Tarball: `npm pack` in a clean checkout of the source release commit.
  856 entries. SHA256
  `42fe73c50e7ca0729639d8573310d6b12eb3237874dacc42b71acc2a64e03b3a`.
- npm: the owner published that tarball after browser authentication.
  Registry integrity and shasum equal the local tarball
  (`a4c88737c4f02ed540983d3a2dc4e31daa5d2594`). The `latest` dist-tag is
  0.21.2. `bun run check:release-published` returned 0; runtime evidence
  receipt `sha256:d843c25f8322a7e25f778ed4811e6a7197fb1516dc6bf1370f222d2cb6c5f4ad`.
  `/Volumes/D` was not mounted, so this check and the local update used a
  temporary npm cache that was deleted afterwards.
- GitHub Release: https://github.com/Ancienttwo/repo-harness/releases/tag/v0.21.2.
  The downloaded asset SHA256 equals the tarball above.
- Local runtime: `repo-harness update --version 0.21.2` installed the CLI,
  then failed in the same process with `retirement inventory requires a valid
  skill catalog`. The running 0.21.1 code does not know host `pi`, which the
  new manifest declares. A second run on 0.21.2 code returned 0. The setup
  check reports 32 ok, 1 warn (optional skills CLI), 0 fail.
- Known issue: on macOS the pipeline ledger accepts only `statfs` types 17
  and 26. These numbers are not stable, so some local HFS+ or APFS volumes are
  refused with `store_location`. 0.21.1 has the same behavior. A fix is planned
  for the next release.
- Release rollback: `git revert --no-edit 942f3fca4195facb298ffc48dc5c7f3c804de8ce`.
  The integration rollback commands above retain their separate scope.
  A Git revert does not undo an npm publication.
