# repo-harness 0.21.1 preparation

## Scope

- Base commit: `f0518178865be80e92844270107ee69009b53354`.
- Dependency commit: `3ac62dd588e01a5e247995b98e5e39f7913e9c28` (#586).
- Pin `archctx` and `archctx-contracts` to exact version `0.6.3`.
- Set package, skill, template, and README versions to `0.21.1`.
- Add the dependency change to the 0.21.1 changelog.
- Add #587, #589 and #590 to the 0.21.1 changelog. They merged to main
  before this preparation. #588 adds only an offline experiment and its
  tests, so the changelog does not list it.
- Add #593 and #594 to the 0.21.1 changelog. #592 changes only a test
  fixture, so the changelog does not list it.
- Add the OAR `0.33.1` upgrade (#595) to the 0.21.1 changelog.
- Upgrade OAR to `0.37.0` (#598) and update the OAR changelog entry. Add the
  #596 prompt hook boundary text change.
- Keep published release history unchanged.

## Verification

- `bun scripts/check-skill-version.ts`: exit 0.
- `bun run check:type`: exit 0.
- `bun run test:files tests/skill-version.test.ts --timeout 60000 --max-concurrency 1`:
  exit 0; 14 passed; 0 failed.
- Dependency readback: exit 0. Package dependencies and lockfile entries are
  `archctx@0.6.3` and `archctx-contracts@0.6.3`.
- `git diff --check`: exit 0.

## Release gate

- Command: `bun run check:release`. Exit 0. Output ends with
  `[release] OK: npm package gate passed.`
- Tree: `f52c63ea` on branch `chore/oar-0.37.0` (#598). It is main
  `659818c3` plus the OAR `0.37.0` pin and this changelog update.
- Result: 409 test files ran with 0 failures. The shared tarball smoke
  installed `repo-harness-0.21.1.tgz`, served the packaged Operator and
  started the packaged CLI bins.
- Environment: macOS arm64, Bun 1.4.2, fresh temporary HOME.
  `PATH` starts with `/opt/homebrew/opt/node@24/bin`, and `CLAUDECODE` and
  `AGENT` are unset. The OAR fixtures require Node 24 as the first `node` on
  `PATH`. Bun agent mode hides the `(pass)` lines that one generic review
  case reads.
- An earlier gate on `03c238fb` (OAR `0.33.1`, before #596) also passed with
  409 test files and 0 failures.

## Publication status

- Status: npm and GitHub publication verified on 2026-10-08.
- Source release commit: `3ea2f7b71c4eef95e158788b8564179034eef9a2` (main after #598). Its tree equals
  the gated tree `f52c63ea` except this checklist.
- Annotated tag `v0.21.1`: object `09a195efe1ca9182d31da6899c4dc27096280487`, pointing to the source release
  commit.
- Tarball: `npm pack` in a clean checkout of the source release commit.
  803 entries. SHA256
  `bbf5927ac170a3592262a1b617a4e3b38a80409936717887d6c09c9693fe98fa`.
  A fresh install reports CLI 0.21.1 and `@botiverse/oar` 0.37.0.
- npm: the owner published that tarball after browser authentication.
  Registry integrity and shasum equal the local tarball
  (`e7393b37808bc9c6f75cfbb0731aacaa98953c6a`). The `latest` dist-tag is
  0.21.1. `bun run check:release-published` returned 0; runtime evidence
  receipt `sha256:9ad324c3ad1e31ad73502151850d282f02dd7e84cd6e26cb75b69cc1edd0e1ee`.
- GitHub Release: https://github.com/Ancienttwo/repo-harness/releases/tag/v0.21.1.
  Public and stable. The downloaded asset SHA256 equals the tarball above.
- Scope change: the owner first approved moving the tag to include #600,
  then decided to publish 0.21.1 without it. #600 moves to the next release.
  The tag never moved.
- Release #598 merge commit: `3ea2f7b71c4eef95e158788b8564179034eef9a2`.
  Parent: `659818c3c3338e162f14e6725b8a4145eeb7ace1`.
  Exact source rollback: `git revert --no-edit 3ea2f7b71c4eef95e158788b8564179034eef9a2`.
- #600 is outside the 0.21.1 release. Its merge commit is
  `e7c86c553f229a0068dba7bef727192c8a93220c`, with parent
  `3ea2f7b71c4eef95e158788b8564179034eef9a2`.
  Exact worktree-change rollback:
  `git revert --no-edit e7c86c553f229a0068dba7bef727192c8a93220c`.
  Let an active sweep finish pending trash first. A revert cannot restore
  removed checkouts or undo an npm publication.

Skill eval evidence is unavailable. `full_test_count`, `dry_run_ratio`,
`grader_pass_rate`, and `effectiveness_authority` are unavailable.
