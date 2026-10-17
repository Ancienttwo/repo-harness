# repo-harness 0.23.1 publication record

## Scope and authority

- Base: `81fe6cf8` (#818 squash merge) on `main`. Parent: `16ea1272` (#821).
- The release contains every main commit after `v0.23.0` (`0d447d3be54f`):
  #793, #791, #794, #795, #796, #797, #798, #799, #800, #801, #806, #805,
  #807, #819, #815, #816, #817, #820, #808, #809, #821 and #818.
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
  #818 when CI was green and to include them. The release branch was rebased
  onto the #818 merge.
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

GATE_RESULTS

## Rollback evidence

- Pending the release PR merge.
- A Git revert does not undo an npm publication.

## Publication status

- Pending.
