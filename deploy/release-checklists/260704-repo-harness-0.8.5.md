# repo-harness 0.8.5 Release Filing

- Date: 2026-07-04
- Package: `repo-harness@0.8.5`
- Base release: `v0.8.4`
- Release scope: patch release for Bun global install recovery and packaged sprint-backlog helper-root coverage.
- Publish status: published; registry readback, Git tag, GitHub release, and
  post-publish gate verified.
- Published at: 2026-07-04 HKT / 2026-07-03T18:06:33Z GitHub release time.

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

## Publish Evidence

- `npm publish --access public --registry https://registry.npmjs.org/`
  published `repo-harness@0.8.5` with tag `latest`.
- Publish-time `prepublishOnly` reran the full release gate and passed:
  `1013 pass`, `1 skip`, `0 fail`, `10593 expect()`; workflow checks,
  package dry-run, and `repo-harness-0.8.5.tgz` tarball smoke passed.
- `npm view repo-harness@0.8.5 version dist-tags dist.integrity dist.shasum
  dist.tarball gitHead --json --registry https://registry.npmjs.org/`
  returned version `0.8.5`, `latest: 0.8.5`, shasum
  `b515499bf16cf73c766a96e6707306d872301826`, integrity
  `sha512-H5g/3qB2h/WRpFjtR77QH2ucdpoK95nKvu8yPXsFrxkYEuKwv0VEKY2EP3nt0T/EXsZCqYusJXsPXRQbqM5WZA==`,
  tarball `https://registry.npmjs.org/repo-harness/-/repo-harness-0.8.5.tgz`,
  and gitHead `a8f8663bb50c9201f37bf17c617c7918d5988618`.
- `git tag -a v0.8.5 -m "repo-harness 0.8.5"` and
  `git push origin v0.8.5` created the annotated tag. Remote tag readback
  returned tag object `31a4eb4eb7f9a9f037e407f84d8c1988aed32a1a` and peeled
  commit `a8f8663bb50c9201f37bf17c617c7918d5988618`.
- `gh release create v0.8.5 --repo Ancienttwo/repo-harness --title
  "repo-harness 0.8.5" ...` created
  `https://github.com/Ancienttwo/repo-harness/releases/tag/v0.8.5`.
- `gh release view v0.8.5 --repo Ancienttwo/repo-harness --json
  tagName,url,name,isDraft,isPrerelease,targetCommitish,publishedAt` returned
  non-draft, non-prerelease release `repo-harness 0.8.5`, published at
  `2026-07-03T18:06:33Z`.
- `bash scripts/check-release-published.sh 0.8.5` passed with registry,
  dist-tag, tarball, tag, and local version files agreeing.
- Clean-cache user-entry smoke passed:
  `NPM_CONFIG_CACHE="$(mktemp -d)/npm-cache" npx -y --registry
  https://registry.npmjs.org/ repo-harness@0.8.5 --version` returned `0.8.5`.

## Publish Checklist

- [x] Publish `repo-harness@0.8.5` to npm with the `latest` dist-tag.
- [x] Read back npm registry metadata, dist tag, tarball shasum/integrity, and
  `gitHead`.
- [x] Push annotated tag `v0.8.5` at the published source commit.
- [x] Create GitHub release `repo-harness 0.8.5` and verify it is non-draft and
  non-prerelease.
- [x] Run `bash scripts/check-release-published.sh 0.8.5`.
