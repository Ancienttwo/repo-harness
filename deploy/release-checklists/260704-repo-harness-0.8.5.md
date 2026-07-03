# repo-harness 0.8.5 Release Filing

- Date: 2026-07-04
- Package: `repo-harness@0.8.5`
- Base release: `v0.8.4`
- Release scope: patch release for Bun global install recovery and packaged sprint-backlog helper-root coverage.
- Publish status: prepared; npm publish, Git tag, and GitHub release are pending.
- Hold reason: publish has not been run in this prep slice.

## Scope

- Repaired local workspace-source installs when Bun reports `DependencyLoop` for
  `repo-harness` by packing the source package into
  `~/.repo-harness/packages/`, removing the stale global package, and
  reinstalling from the cached tarball.
- Added package-smoke coverage that creates a target-repo sprint fixture and
  verifies packaged `repo-harness run sprint-backlog status` reads the target
  repo state.
- Preserved package-channel install behavior: explicit `repo-harness@<version>`
  installs still fail closed instead of taking the local-source repair path.

## Preflight Evidence

- `npm view repo-harness version dist-tags --json --registry https://registry.npmjs.org/`
  returned latest `0.8.4` before the version bump.
- `npm view repo-harness@0.8.5 version --json --registry https://registry.npmjs.org/`
  returned `E404`, proving the target package is unpublished before publish.
- `git log v0.8.4..HEAD --oneline` showed two post-`0.8.4` commits before
  release prep:
  - `a89e95a fix(runtime): repair Bun dependency-loop installs`
  - `6c7aec9 Harden no-fallback distribution and helper roots`
- Git tags include local and remote `v0.8.4`; GitHub releases currently list
  `v0.8.3` as latest, so the 0.8.5 publish closeout must create or refresh the
  GitHub release surface explicitly.

## Verification

- Passed: `bun src/cli/index.ts --version`
  - returned `0.8.5`.
- Passed: `bun scripts/check-skill-version.ts --project .`
  - `repo-harness=0.8.5`, `template=0.8.5`, and self-host project stamp is up
    to date.
- Passed: `bun test tests/skill-version.test.ts tests/readme-dx.test.ts --timeout 30000`
  - 22 pass, 0 fail.
- First `bun run check:release` attempt passed the full Bun test suite
  (`1013 pass`, `1 skip`, `0 fail`) but stopped at `check-task-sync` because
  the prep lacked a task synchronization artifact. The release prep note was
  added before the final rerun.
- Passed: `bun run check:release`
  - npm unpublished-version preflight for `repo-harness@0.8.5`: OK
  - `bun test`: 1013 pass, 1 skip, 0 fail, 10593 expect calls
  - `bash scripts/check-deploy-sql-order.sh`: OK
  - `bash scripts/check-architecture-sync.sh`: advisory, blocking=0
  - `bash scripts/check-task-sync.sh`: OK
  - `bash scripts/check-task-workflow.sh --strict`: OK
  - package dry-run: OK
  - tarball smoke: `repo-harness-0.8.5.tgz` installs and packaged CLI bins start

## Publish Checklist

- Publish `repo-harness@0.8.5` to npm with the `latest` dist-tag.
- Read back npm registry metadata, dist tag, tarball shasum/integrity, and
  `gitHead`.
- Push annotated tag `v0.8.5` at the published source commit.
- Create GitHub release `repo-harness 0.8.5` and verify it is non-draft and
  non-prerelease.
- Run `bash scripts/check-release-published.sh 0.8.5`.
