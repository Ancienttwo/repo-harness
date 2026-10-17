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

- Pending the release PR merge.
- A Git revert does not undo an npm publication.

## Publication status

- Pending.
