# Release Filing: repo-harness 0.8.2

Date: 2026-06-29
Status: Published to npm and GitHub

## Scope

- Package target: `repo-harness@0.8.2`
- Base release: `v0.8.1`
- Release branch: `main`
- Release prep base: `c878664b2cb791a94a02e18a061c1c0df8166890`
- Release commit: `26eff6fc70b2c24cc3a00616204d3611f61df18e`
- Release tag: `v0.8.2`
- Registry: `https://registry.npmjs.org/`

## Version Decision

Use `0.8.2` as the next patch release because `repo-harness@0.8.1` is already
published and the current `main` line contains post-`0.8.1` workflow fixes:

- repository alias discovery fixes for MCP/workspace reader resolution;
- completed workflow artifact noise reduction for active workflow surfaces;
- two-tier plan artifact gates for `work-package` vs `checklist-row`;
- review hardening that rejects placeholder promotion reasons, transient plan
  projection, and inline sprint projection misuse before durable artifacts are
  created;
- CodeGraph tooling maintenance to keep the self-hosted dev dependency on
  `@colbymchenry/codegraph@latest`, resolving to `1.1.2` in this release
  lockfile.

This release keeps one package/template version line:
`repo-harness@0.8.2+template@0.8.2`.

## Required Alignment

- `package.json`
- `.claude/.skill-version`
- `assets/skill-version.json`
- README current release/stamp references
- `docs/CHANGELOG.md`
- release checklist and task snapshot
- `bun.lock` for the CodeGraph devDependency update

## Preflight Evidence

- `npm view repo-harness version dist-tags --json` returned latest `0.8.1`.
- `gh release list --limit 10` showed latest GitHub release `v0.8.1`.
- Local and remote `main` were aligned at
  `c878664b2cb791a94a02e18a061c1c0df8166890` before release prep.
- `git log v0.8.1..HEAD --oneline` returned five post-`0.8.1` commits.

## Verification

- `npm view @colbymchenry/codegraph version dist-tags --json --registry
  https://registry.npmjs.org/` returned `latest: 1.1.2`, matching the lockfile
  resolution for the `@colbymchenry/codegraph@latest` spec.
- First `bun run check:release` attempt failed only `README DX contract >
  localized READMEs track the current English release surface` because
  localized READMEs still referenced `0.8.1`; they were updated before rerun.
- `bun test tests/readme-dx.test.ts` passed after localized README sync.
- `bun scripts/check-skill-version.ts --project .` passed with
  `repo-harness=0.8.2`, `template=0.8.2`, and project `0.8.2`.
- `bun install --frozen-lockfile` passed after switching CodeGraph to
  `latest`.
- `bash scripts/check-task-sync.sh` passed after refreshing `tasks/current.md`.
- Second `BUN_TEST_TIMEOUT_MS=180000 BUN_TEST_MAX_CONCURRENCY=1 bun run
  check:release` passed: `1002 pass`, `1 skip`, `0 fail`, `10538 expect()`
  calls, plus workflow checks, repository inspection, package dry-run, and
  tarball smoke.
- `npm pack --dry-run --json --registry https://registry.npmjs.org/` reported
  `repo-harness-0.8.2.tgz`, size `7952300`, unpacked size `10762474`, shasum
  `d3932c3b3dfa367929f9a9987ee6f04e64f28cae`, integrity
  `sha512-QeWgCKUzyLP5EPQdDDxSHrWWIW3z7PJwO61h7eRsJG+xPA3rUBrher/wo5Oo3+El1FO/S6zE+KEFZ0n8mQtrMw==`,
  and `356` package entries.
- `npm view repo-harness@0.8.2 version --json --registry
  https://registry.npmjs.org/` returned `E404`, confirming the target version
  is still unpublished before publish.
- Initial `npm whoami --registry https://registry.npmjs.org/` returned
  `ENEEDAUTH`; publish continued after using the local private npm token through
  a temporary userconfig that was deleted after the command.
- Publish-time `npm publish --access public --registry
  https://registry.npmjs.org/` reran `prepublishOnly` and passed: `1002 pass`,
  `1 skip`, `0 fail`, plus workflow checks, package dry-run, tarball smoke, and
  `[release] OK`.

## Publish Evidence

- `npm publish --access public --registry https://registry.npmjs.org/` published
  `repo-harness@0.8.2` with tag `latest`.
- `npm view repo-harness@0.8.2 version dist-tags dist.integrity dist.shasum
  dist.tarball gitHead --json --registry https://registry.npmjs.org/` returned
  version `0.8.2`, `latest: 0.8.2`, shasum
  `d3932c3b3dfa367929f9a9987ee6f04e64f28cae`, integrity
  `sha512-QeWgCKUzyLP5EPQdDDxSHrWWIW3z7PJwO61h7eRsJG+xPA3rUBrher/wo5Oo3+El1FO/S6zE+KEFZ0n8mQtrMw==`,
  tarball `https://registry.npmjs.org/repo-harness/-/repo-harness-0.8.2.tgz`,
  and gitHead `26eff6fc70b2c24cc3a00616204d3611f61df18e`.
- `git tag -a v0.8.2 -m "repo-harness 0.8.2"` and
  `git push origin v0.8.2` created the annotated tag.
- `gh release create v0.8.2 --repo Ancienttwo/repo-harness --title
  "repo-harness 0.8.2" ...` created
  `https://github.com/Ancienttwo/repo-harness/releases/tag/v0.8.2`.
- `bash scripts/check-release-published.sh 0.8.2` passed with registry,
  dist-tag, tarball, tag, and local version files agreeing.
- `gh release view v0.8.2 --repo Ancienttwo/repo-harness --json
  tagName,url,name,isDraft,isPrerelease,targetCommitish,publishedAt` returned
  non-draft, non-prerelease release `repo-harness 0.8.2`, published at
  `2026-06-29T02:50:06Z`.
