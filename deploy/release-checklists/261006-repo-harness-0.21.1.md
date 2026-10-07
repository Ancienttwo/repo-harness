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
- Keep published release history unchanged.

## Verification

- `bun scripts/check-skill-version.ts`: exit 0.
- `bun run check:type`: exit 0.
- `bun run test:files tests/skill-version.test.ts --timeout 60000 --max-concurrency 1`:
  exit 0; 14 passed; 0 failed.
- Dependency readback: exit 0. Package dependencies and lockfile entries are
  `archctx@0.6.3` and `archctx-contracts@0.6.3`.
- `git diff --check`: exit 0.

## Publication status

Release preparation belongs to branch `chore/prepare-0.21.1-archctx-0.6.3`.
Tag creation and npm publication remain pending.
The full release gate and package installation checks have not run for 0.21.1.
This filing does not establish release readiness.

Skill eval evidence is unavailable. `full_test_count`, `dry_run_ratio`,
`grader_pass_rate`, and `effectiveness_authority` are unavailable.
