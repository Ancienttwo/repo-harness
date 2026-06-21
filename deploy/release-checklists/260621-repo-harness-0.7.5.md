# Release Filing: repo-harness 0.7.5

Date: 2026-06-21
Status: Release branch prepared; npm publish blocked on local npm auth

## Scope

- Package target: `repo-harness@0.7.5`
- Base release: `v0.7.4`
- Release branch: `codex/release-0.7.5`
- Registry: `https://registry.npmjs.org/`

## Version Decision

Use `0.7.5` as a patch release. The release contains only the repo-isolation
hook hardening needed to prevent user-level hook adapters from writing workflow
artifacts into the wrong repository.

The broader lane-runtime work remains outside this patch line and should ship
separately as a beta candidate.

## Required Alignment

- `package.json`
- `assets/skill-version.json`
- README current release/stamp references
- `docs/CHANGELOG.md`
- self-host `.ai/hooks` and packaged `assets/hooks`
- hook runtime and installer tests
- release checklist

## Preflight Evidence

- `npm view repo-harness version dist-tags --json --registry https://registry.npmjs.org/`
  returned current latest `0.7.4` before publish.
- `npm view repo-harness@0.7.5 version --json --registry https://registry.npmjs.org/`
  returned unpublished/E404 before publish.
- GitHub release `v0.7.4` exists at
  `https://github.com/Ancienttwo/repo-harness/releases/tag/v0.7.4`.
- `git diff -- bun.lock` is empty after install, release gate, and package
  dry-run. The `@colbymchenry/codegraph` lockfile range remains outside this
  patch release.

## Verification

Passed before publish:

- `bun src/cli/index.ts --version` returned `0.7.5`.
- `bun scripts/check-skill-version.ts --project .` passed for
  `repo-harness=0.7.5` and `template=0.7.5`.
- `bun test tests/cli/hook.test.ts tests/cli/install.test.ts tests/hook-runtime.test.ts`
  passed with `152 pass`, `0 fail`.
- `bun test tests/readme-dx.test.ts` passed with `8 pass`, `0 fail`.
- `BUN_TEST_ISOLATE_FILES=1 BUN_TEST_TIMEOUT_MS=180000 BUN_TEST_MAX_CONCURRENCY=1 bun run check:release`
  passed with `[release] OK: npm package gate passed.`
- `npm pack --dry-run --json --registry https://registry.npmjs.org/`
  produced `repo-harness-0.7.5.tgz`, size `7859814`, unpacked size
  `10312804`, shasum `dc22cd09acf059bcf10b92b1d5ba1c3e417a4f5c`,
  integrity `sha512-Vh6vwTi2Om9ZjpQ2WXMRpuQ29/xglZieANiAZASeODej33tvNsCTVXwGtK+bWxUR+CCKAJNlLsbI4kgJq4coGw==`.
- The release gate's tarball smoke passed:
  `[tarball-smoke] OK: repo-harness-0.7.5.tgz installs and packaged CLI bins start.`

Local note: a non-isolated full release-gate attempt was killed by the local
runtime with exit `137`; the accepted release proof is the same gate run with
file isolation and constrained test concurrency.

## Publish Evidence

Blocked:

- `npm whoami --registry https://registry.npmjs.org/` returned `ENEEDAUTH`.
- The repo has CI but no publish workflow for GitHub Actions trusted publishing.
- No local `_ops/env/npm-token.md` publish token file was present in the main or
  release worktree.

Pending after npm auth is available:

- npm publish result for `repo-harness@0.7.5`
- registry readback for version, tarball, shasum, integrity, and `gitHead`
- `latest` dist-tag readback
- Git tag `v0.7.5`
- GitHub release URL
- clean-room `npx --package repo-harness@0.7.5 repo-harness --version`
- local `repo-harness update --version 0.7.5 --json`
- final `repo-harness status --json` and `repo-harness doctor --json`

## Publish Hold

- Do not publish until an authenticated npm identity is available.
- Do not tag `v0.7.5` or create the GitHub release until npm publish and
  registry readback succeed.
- Do not include the lane-runtime feature branch in this patch release.
