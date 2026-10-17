# repo-harness 0.23.1 publication record

## Scope and authority

- Base: `b6316120` (#823 squash merge) on `main`. Parent: `81fe6cf8` (#818).
- The release contains every main commit after `v0.23.0` (`0d447d3be54f`):
  #793, #791, #794, #795, #796, #797, #798, #799, #800, #801, #806, #805,
  #807, #819, #815, #816, #817, #820, #808, #809, #821, #818 and #823.
- 0.23.1 has breaking changes: the PM and task-acquisition surface, the
  stateless Engineer stores, the contract fields of Effective State and the
  local architecture model readers are removed (#807, #820, #800, #801). See
  `docs/CHANGELOG.md`.
- The owner chose the version 0.23.1 on 2026-10-17. The project convention so
  far bumps the minor version for breaking changes; the owner kept the patch
  version and accepted that difference.
- On 2026-10-17 the owner asked to clean up the open issues and PRs, then
  publish 0.23.1. The owner said to wrap up after the in-flight PRs: #773 slice
  C is not part of this release. The owner then asked to merge #808, #809 and
  #818 when CI was green and to include them. Then the owner asked to merge
  #823 (archctx 0.8.1) and rebase. The release branch was rebased onto the
  #823 merge.
- The release branch adds these commits:
  - `chore(release): set the versions to 0.23.1 and write the changelog`.
  - `fix(release): run the coding OAuth E2E in the tarball smoke`. #820 removed
    the Engineer OAuth E2E test that the smoke selected by name.
  - `chore(release): add #808, #809, #818, #821 and the smoke fix to the 0.23.1
    changelog`.
  - `docs(architecture): refresh the projection manifest for 0.23.1`. The owner
    approved a CodeGraph index in the release worktree for this step.
  - `chore(release): add the 0.23.1 publication record`.

## Acceptance environment

- macOS arm64, Bun 1.4.3, locked dependencies.
- Each run used a new temporary HOME under `/tmp` and `TMPDIR=/tmp`.
- `CLAUDECODE`, `AI_AGENT`, `AGENT` and `REPL_ID` were removed for the release
  gates.

## Acceptance status

- RED: at the first release base (`d02a082f`), `bun run check:release` with a
  temporary HOME exits 1. The tarball smoke selects the Engineer OAuth E2E
  test by name, and #820 removed that test. The smoke now selects the coding
  OAuth E2E test.
- At `06963d2f` (after the merge of #823):
  - `bun run check:type`, `bun run check:helpers`,
    `bun run check:reference-configs`: exit 0.
  - `bun run test:files tests/installed-copy-sync.test.ts
    tests/readme-dx.test.ts tests/skill-version.test.ts
    tests/effective-state.test.ts tests/hook-runtime.test.ts --timeout 60000
    --max-concurrency 1`: 99 pass, 0 fail.
  - `bash scripts/check-npm-release.sh --prepublish`: exit 0.
  - `bun run check:release`: exit 0. `tests/harness-benchmark-matrix.test.ts`:
    31 pass, 0 fail. The tarball smoke:
    `repo-harness-0.23.1.tgz` installs, serves the packaged Operator, and the
    packaged CLI bins start.
  - `repo-harness architecture-projection check --json` (source CLI): `noop`,
    freshness ok, no human actions.
  - The SHA-256 of the real `~/.repo-harness/registered-repos.json` was the
    same before and after the gate runs.
- `check:release` does not run the full suite. Each merged PR passed its own
  CI. The release PR CI must pass on its final head before the merge.
- The release work did not change, relax or remove an assertion or timeout
  to pass a gate. The smoke fix changes only the test name pattern in
  `scripts/check-tarball-install-smoke.sh`.

## Rollback evidence

- Release squash merge (#826): `d763868f1696bfa84e42f7cc02d4e75f1ab3ae2c`.
  Parent: `b631612018c88748a74065ee1967732fda766188` (#823). Reviewed head:
  `1915e3b2`. `git revert --no-edit d763868f`.
- A Git revert does not undo an npm publication.

## Publication status

- Status: npm and GitHub publication verified on 2026-10-18.
- Source release commit: `d763868f1696bfa84e42f7cc02d4e75f1ab3ae2c`. Its
  tree (`e9c3802e`) equals the tree of the gated head `1915e3b2`.
- Annotated tag `v0.23.1`: object `c1b1d0862d36fade97d6da37e27e1f021fe888d0`,
  pointing to the source release commit.
- Tarball: `npm pack` in a clean detached checkout of `v0.23.1`. 634
  entries. SHA256
  `da392fca1d8340503fbc5ddb80058841e03c46a8caea00c89edead32e8c1f0e0`.
- GitHub Release: https://github.com/Ancienttwo/repo-harness/releases/tag/v0.23.1.
  The downloaded asset SHA256 equals the tarball above.
- npm: the first publish attempt ran in the background and waited for web
  authentication. The authentication link expired before approval, and npm
  failed with `E404` on `/-/v1/done`. Nothing was published. The owner then
  ran `npm publish <tarball> --auth-type=web` in the session and approved it
  in the browser (`PUT 202`). Registry shasum
  `88061e7dcbe6eec05ec686e5680acbe216a595a3` and integrity equal the local
  tarball. The `latest` dist-tag is 0.23.1. The registry showed the version
  about 5 minutes after the PUT.
  `bun run check:release-published 0.23.1` (temporary HOME) returned OK.
- Local runtime: `repo-harness update` on the 0.23.0 CLI installed 0.23.1
  and returned 0. It reports 17 leftovers, 0 removable.
  `repo-harness install --state`: profile `full`, drift `consistent`.
  `repo-harness doctor`: 14 ok, 1 warn, 0 fail. The warn is the user-owned
  hooks in `~/.claude/settings.json`, which stay.
