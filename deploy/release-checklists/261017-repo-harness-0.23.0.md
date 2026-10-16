# repo-harness 0.23.0 publication record

## Scope and authority

- Base: `c9ad06b0` (#784 squash merge) on `main`. Parent: `26f1806d`
  (#786). #784 merged while the release PR was open. The release branch
  merged it with no rebase.
- The release contains every main commit after `v0.22.1`
  (`dc0efeb20da7`): #686, #700, #672, #702, #706, #707, #712, #710, #713,
  #708, #714, #717, #720, #719, #716, #715, #721, #685, #722, #723, #724,
  #727, #725, #726, #729, #728, #730, #732, #731, #733, #740, #742, #746,
  #747, #748, #752, #753, #741, #750, #751, #755, #756, #758, #760, #774,
  #775, #776, #777, #778, #780, #781, #785, #783, #787, #782, #788, #789,
  #786 and #784.
- 0.23.0 is a minor release. It has breaking changes: the collaboration
  commands and pipeline observer are removed (#785), Pi support and the
  Codex `/delegate` route are removed (#766), and managed hook blocks run
  before user blocks (#742). `repo-harness state owed` is removed (#784).
  See `docs/CHANGELOG.md`.
- The release branch adds these commits:
  - `chore(release): set the versions to 0.23.0 and write the changelog`.
  - `fix(evals): install the benchmark artifact without a package manager`.
    Since #728, `src/core/architecture/projection.ts` reads `dependencies`
    from `package.json` at runtime. The benchmark artifact removed every
    dependency field, so its installed CLI failed at start, and the release
    lane test `tests/harness-benchmark-matrix.test.ts` failed. Bun 1.4.3
    ignores bundled dependencies, so the fields cannot stay with
    `bun add -g`. The new `installBenchmarkRuntimeArtifact` unpacks the
    self-contained artifact and links its bins. No package manager runs.
    The runner and the test use the same function. The owner approved this
    design on 2026-10-17.
  - `docs(architecture): refresh the projection manifest for 0.23.0`.
  - A merge of `origin/main` (#784). The only conflict was the generated
    projection manifest. The merge took main's copy, and the projection was
    applied again.
  - `chore(release): add #784 to the 0.23.0 changelog and refresh the
    manifest`.
- On 2026-10-16 the owner approved the release with these actions: release
  PR and merge, tag and GitHub Release, npm publish, local update and
  adapter reinstall. The owner asked to wait for #786, #788 and #789. On
  2026-10-17 the owner gave GO for #786 at `00f64864` and asked to fix the
  benchmark artifact before the release.

## Acceptance environment

- macOS arm64, Bun 1.4.3, locked dependencies.
- Each run used a new temporary HOME under `/tmp`.
- `CLAUDECODE`, `AI_AGENT`, `AGENT` and `REPL_ID` were removed.

## Acceptance status

- RED: at `0219efad` (versions only), `bun run check:release` with a
  temporary HOME exits 1. `tests/harness-benchmark-matrix.test.ts` gives
  30 pass and 1 fail: "reuses one packed artifact across isolated installs
  without mutating source authority" fails at the installed CLI
  `--version` (exit 1, `Export named 'dependencies' not found`).
- At `222236a8` (before the merge of #784), the same gates below passed.
- At `6673b770` (after the merge of #784):
  - `bun run check:type`, `bun run check:helpers`,
    `bun run check:reference-configs`: exit 0.
  - `bun run test:files tests/skill-version.test.ts
    tests/installed-copy-sync.test.ts tests/readme-dx.test.ts
    tests/architecture-debt.test.ts tests/check-ci-job-split.test.ts
    --timeout 60000 --max-concurrency 1`: 93 pass, 0 fail.
  - `bash scripts/check-npm-release.sh --prepublish`: exit 0.
  - `bun run check:release`: exit 0. `tests/harness-benchmark-matrix.test.ts`
    with `REPO_HARNESS_TEST_EXPENSIVE=1`: 31 pass, 0 fail. The tarball smoke:
    `repo-harness-0.23.0.tgz` installs, serves the packaged Operator, and the
    packaged CLI bins start.
  - `repo-harness architecture-projection check --json` (source CLI): `noop`.
  - The SHA-1 of the real `~/.repo-harness/registered-repos.json` was the
    same before and after the gate runs.
- `check:release` does not run the full suite. CI on `26f1806d` passed.
  #784 passed its own PR CI. The release PR CI must pass on its final head before the merge.
- The release work did not change, relax or remove an assertion or timeout
  to pass a gate. The benchmark fix changes two tests in
  `tests/harness-benchmark-matrix.test.ts`, both caused by the new install
  function:
  - The install test calls `installBenchmarkRuntimeArtifact` in place of the
    inline `bun add -g` and its exit-code assertion. Its other assertions
    are unchanged.
  - The source-text test for `projectHarnessBase` now looks for the
    `installBenchmarkRuntimeArtifact` call, checks the path guard in the
    whole script (the guard moved into the new function), and checks that
    `projectHarnessBase` has no `bun add -g`.

## Rollback evidence

- The release squash merge SHA and its parent are recorded after the merge.
  Roll back with `git revert --no-edit <release squash SHA>`.
- A Git revert does not undo an npm publication.

## Publication status

- Status: not published yet.
