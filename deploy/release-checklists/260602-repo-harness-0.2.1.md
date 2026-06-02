# Release Filing: repo-harness 0.2.1

Date: 2026-06-02
Filing ID: 260602-repo-harness-0.2.1
Status: Published

## Naming

Release filing documents use a `YYMMDD-<package>-<version>.md` filename. This
file uses `260602` so the release artifact sorts by filing date without relying
only on GitHub or npm metadata.

## Scope

- Package: `repo-harness@0.2.1`
- Generated workflow compatibility: `5.2.3` (unchanged)
- Public CLI commands: `repo-harness init` becomes first-run global runtime
  bootstrap; `repo-harness update` owns existing repo-local harness refresh.
- Hook behavior: prompt-guard performs a non-blocking CodeGraph index init before
  the first structural CodeGraph route hint when `.codegraph/codegraph.db` is
  missing.
- Main change: a patch release that makes npm `npx -y repo-harness init` usable
  without a source checkout and keeps repo-local refresh on `update`.

## Included Changes

- Added `src/cli/commands/global-runtime.ts` as the thin wrapper around packaged
  `scripts/setup-plugins.sh`.
- Updated `src/cli/index.ts` so `init` dispatches global runtime setup and
  `update` dispatches the existing `runInit` repo-local install/refresh chain.
- Updated `README.md`, `README.zh-CN.md`, `README.ja.md`, `README.fr.md`, and
  `README.es.md` for the `0.2.1` release line, the split `init` / `update`
  lifecycle, and the hook-side CodeGraph index self-heal behavior.
- Updated `.ai/hooks/prompt-guard.sh` and `assets/hooks/prompt-guard.sh` so
  structural code-navigation prompts initialize a missing CodeGraph index with
  the local or PATH-visible `codegraph` binary. The hook stays advisory, does not
  install dependencies, does not run the heavier repo-harness readiness probe,
  and removes `.cursor/rules/codegraph.mdc` only when current CodeGraph created
  it as a side effect of this automatic init.
- Added regression tests for global init argv/validation, `update --help`, and
  hook-side missing CodeGraph index initialization.

## Verification

- `bun src/cli/index.ts --version` returned `0.2.1`.
- `bun src/cli/index.ts status` reported `repo-harness 0.2.1`.
- Focused regression coverage passed:
  `bun test tests/bootstrap-files.test.ts tests/readme-dx.test.ts
  tests/cli/global-runtime-init.test.ts tests/cli/init.test.ts
  tests/hook-runtime.test.ts` returned 130 pass, 0 fail.
- `bash scripts/check-npm-release.sh` passed before publish: 565 pass, 6 skip,
  0 fail; it also ran `bun install --frozen-lockfile`, `bun test`,
  `bash scripts/check-deploy-sql-order.sh`, `bash scripts/check-task-sync.sh`,
  `bash scripts/check-task-workflow.sh --strict`,
  `bun scripts/inspect-project-state.ts --repo . --format text`,
  `bash scripts/migrate-project-template.sh --repo . --dry-run`, and
  `npm pack --dry-run --json`.
- `npm whoami --registry https://registry.npmjs.org/` initially returned
  `E401 Unauthorized`; using the local `_ops/env/npm.md` npm token through a
  temporary npmrc verified the publish identity as `ancienttwo`.
- `npm publish --registry https://registry.npmjs.org/ --access public` reran the
  full `prepublishOnly` gate successfully and published `repo-harness@0.2.1`.
- `npm view repo-harness@0.2.1 version dist.tarball gitHead --registry
  https://registry.npmjs.org/` returned:
  - `version = '0.2.1'`
  - `dist.tarball = 'https://registry.npmjs.org/repo-harness/-/repo-harness-0.2.1.tgz'`
  - `gitHead = '56a68b10192695c4ba49ec3df37276c0121672f9'`
- Clean-temp npm CLI smoke passed:
  `npx -y --registry https://registry.npmjs.org/ repo-harness@0.2.1 --version`
  printed `0.2.1`, and `npx -y --registry https://registry.npmjs.org/
  repo-harness@0.2.1 init --help` printed the global init help.
- `bun src/cli/index.ts --version`, `bun src/cli/index.ts init --help`, and
  `bun src/cli/index.ts update --help` passed locally after publish.

## Published Artifacts

- npm: https://www.npmjs.com/package/repo-harness/v/0.2.1
- npm tarball: https://registry.npmjs.org/repo-harness/-/repo-harness-0.2.1.tgz
- GitHub release: https://github.com/Ancienttwo/repo-harness/releases/tag/v0.2.1
