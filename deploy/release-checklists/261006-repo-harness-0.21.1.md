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
- Add the `/tmp` worktree default and the merged worktree sweep (#600) to
  the 0.21.1 changelog. The owner approved moving tag `v0.21.1` to include it.
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
- Tree: `940679f2` on branch `feat/worktree-tmp-default` (#600). It is main
  `3ea2f7b7` plus #600. The later commit on that branch changes only this
  checklist and one changelog sentence.
- Location: the gate ran from a worktree under `/tmp`, the new default.
- Result: 409 test files ran with 0 failures. The shared tarball smoke
  installed `repo-harness-0.21.1.tgz`, served the packaged Operator and
  started the packaged CLI bins. No `/tmp/*-wt-*` path was left.
- Environment: macOS arm64, Bun 1.4.2, Git 2.50.1, fresh temporary HOME,
  `caffeinate -dimsu`. `PATH` starts with `/opt/homebrew/opt/node@24/bin`,
  and `CLAUDECODE` and `AGENT` are unset.
- Earlier gates: `f52c63ea` (OAR `0.37.0`) passed. Runs on `739dfe02`,
  `40fabd87` and `0ce0ca30` failed. The `40fabd87` run is not valid because
  the host slept during it. The other failures were fixed in #600.
- Independent review of #600: NO-GO on `739dfe02`, `40fabd87` and
  `0ce0ca30`, then GO WITH FIXES on `940679f2`. The two remaining items were
  this changelog sentence and the test changes listed in the PR body.

## Publication status

Merge #600 before the tag. The owner approved moving tag `v0.21.1` from
`3ea2f7b7` to the main commit that contains #600. If main changes after this
gate, compare that commit with `940679f2` before the tag.
Tag creation and npm publication remain pending.

Skill eval evidence is unavailable. `full_test_count`, `dry_run_ratio`,
`grader_pass_rate`, and `effectiveness_authority` are unavailable.
