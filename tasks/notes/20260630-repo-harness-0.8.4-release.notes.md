# repo-harness 0.8.4 release notes

## Scope

- Release line: `repo-harness@0.8.4`.
- Base fix: package-dispatched `workstream-sync` now resolves bundled sibling
  helpers when downstream repositories no longer vendor legacy helper scripts.
- Release metadata updates: package version, skill/template stamp, README release
  surface, changelog, and release filing.

## Verification

- `bun test tests/skill-version.test.ts tests/readme-dx.test.ts` passed.
- First `bun run check:release` reached the workflow-check stage after
  `bun test` completed with 1003 pass, 1 skip, 0 fail; it then failed
  `check-task-sync` because release metadata had no `tasks/` synchronization
  artifact yet.
- Added this task note to synchronize the release metadata with `tasks/`.
- Second `bun run check:release` passed:
  - `bun test`: 1003 pass, 1 skip, 0 fail, 10522 expect calls.
  - Workflow checks: deploy SQL OK, architecture sync advisory blocking=0,
    task sync OK, brain sync OK, strict workflow OK.
  - Package checks: dry-run OK; tarball smoke confirmed
    `repo-harness-0.8.4.tgz` installs and packaged CLI bins start.

## Boundary

- The primary checkout still has unrelated local CodeGraph install parity
  changes. This release is prepared in the clean
  `/Users/chris/Projects/repo-harness-release-0.8.4` worktree so the package
  tarball does not include that dirty state.
