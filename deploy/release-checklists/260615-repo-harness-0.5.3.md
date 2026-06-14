# Release Filing: repo-harness 0.5.3

Date: 2026-06-15
Status: Prepared for npm and GitHub release

## Scope

- Package target: `repo-harness@0.5.3`
- Base release: `v0.5.2`
- Release branch: `main`
- Registry: `https://registry.npmjs.org/`

## Version Decision

Use `0.5.3` as a patch release. The release contains the post-`0.5.2`
CLI parsing fix that lets `repo-harness update --version <version>` install a
specific package version while keeping the top-level `repo-harness --version`
shortcut intact.

## Required Alignment

- `package.json`
- `.claude/.skill-version`
- `assets/skill-version.json`
- README current release/stamp references, including localized READMEs
- `docs/CHANGELOG.md`
- version expectation tests
- `src/cli/index.ts`
- `tests/cli/global-runtime-init.test.ts`

## Preflight Evidence

- `npm view repo-harness version dist-tags --json --registry https://registry.npmjs.org/`
  returned current latest `0.5.2` before the version bump.
- `npm view repo-harness@0.5.3 version --json --registry https://registry.npmjs.org/`
  returned `E404`, proving the target package is unpublished before publish.
- `gh release view v0.5.2 --repo Ancienttwo/repo-harness --json tagName,name,publishedAt,url,targetCommitish,isDraft,isPrerelease,assets`
  returned the public `v0.5.2` release, non-draft, non-prerelease, with no
  assets.
- `repo-harness setup check --target codex --check-updates --json` returned
  `status=ok`, `28 ok`, `0 warn`, `0 fail`, `0 needs_agent`; CLI, Waza, and
  CodeGraph were all current.

## Verification

- `bun src/cli/index.ts --version` returned `0.5.3`.
- `bun scripts/check-skill-version.ts --project .` passed with
  `repo-harness=0.5.3` and `template=0.5.3`.
- `bun test tests/bootstrap-files.test.ts tests/skill-version.test.ts tests/readme-dx.test.ts tests/cli/global-runtime-init.test.ts`
  passed with `43 pass`, `0 fail`.
- `BUN_TEST_TIMEOUT_MS=180000 BUN_TEST_MAX_CONCURRENCY=1 bun run check:release`
  passed with `754 pass`, `0 fail`, then completed workflow checks, repository
  inspection, and `npm pack --dry-run`.

## Publish Evidence

- Pending.

## Hold Reason

- Pending npm publish, registry readback, tag push, GitHub release, and local
  runtime refresh.
