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
- Tree: `03c238fb`. It is `152e9ce4` (this changelog) plus #594
  (`f38a3385`) and #595 (`3a591fd3`), cherry-picked before their merge.
- Result: 409 test files ran with 0 failures. The shared tarball smoke
  installed `repo-harness-0.21.1.tgz`, served the packaged Operator and
  started the packaged CLI bins.
- Environment: macOS arm64, Bun 1.4.2, fresh temporary HOME.
  `PATH` starts with `/opt/homebrew/opt/node@24/bin`, and `CLAUDECODE` and
  `AGENT` are unset.
- An earlier run with Homebrew Node 26 first on `PATH` and `CLAUDECODE=1`
  failed 8 cases in `tests/generic-review.test.ts`. The OAR fixtures require
  Node 24 as the first `node` on `PATH`. Bun agent mode hides the `(pass)`
  lines that one case reads. Both causes are environment conditions, not
  product defects.

## Publication status

Merge #594, #595 and this preparation before the tag. The tag must point to
the main commit that contains all three. If main changes after this gate,
compare that commit with `03c238fb` before the tag.
Tag creation and npm publication remain pending.

Skill eval evidence is unavailable. `full_test_count`, `dry_run_ratio`,
`grader_pass_rate`, and `effectiveness_authority` are unavailable.
