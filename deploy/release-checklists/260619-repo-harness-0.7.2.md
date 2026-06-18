# Release Filing: repo-harness 0.7.2

Date: 2026-06-19
Status: Published

## Scope

- Package target: `repo-harness@0.7.2`
- Base release: `v0.7.1`
- Release branch: `main`
- Registry: `https://registry.npmjs.org/`

## Version Decision

Use `0.7.2` as a patch release. The release hardens the GPT Pro and ChatGPT
browser-session setup path without changing the public package boundary:
`repo-harness-gptpro` now documents the ChatGPT Apps limitation more explicitly,
Oracle-backed GPT Pro consults keep a 59-second heartbeat by default, Oracle
repair suggestions respect the selected binary source, and ChatGPT MCP setup
preserves existing endpoint/operator settings when only the server name changes.

## Required Alignment

- `package.json`
- `.claude/.skill-version`
- `assets/skill-version.json`
- README current release/stamp references, including localized READMEs
- `docs/CHANGELOG.md`
- GPT Pro setup and consult command skill docs
- ChatGPT browser engine docs
- MCP setup docs and tests
- version expectation tests
- release checklist and task notes

## Preflight Evidence

- PR #10 was merged to `main` as merge commit `87d60a2`.
- `npm view repo-harness version dist-tags --json --registry https://registry.npmjs.org/`
  returned current latest `0.7.1`.
- `npm view repo-harness@0.7.2 version --json --registry https://registry.npmjs.org/`
  returned `E404`, proving the target package is unpublished before publish.
- `npm whoami --registry https://registry.npmjs.org/` returned `ENEEDAUTH` for
  the default npm config in this shell.

## Verification

- `bun src/cli/index.ts --version` returned `0.7.2`.
- `bun scripts/check-skill-version.ts --project .` passed with
  `repo-harness=0.7.2`, `template=0.7.2`, and project stamp up to date.
- Focused release metadata and GPT Pro/browser checks passed:
  `bun test tests/bootstrap-files.test.ts tests/skill-version.test.ts tests/readme-dx.test.ts tests/cli/chatgpt-browser.test.ts tests/cli/mcp-setup.test.ts tests/action-command-skills.test.ts`
  returned `90 pass`, `0 fail`.
- Full release gate passed:
  `BUN_TEST_TIMEOUT_MS=180000 BUN_TEST_MAX_CONCURRENCY=1 bun run check:release`
  returned `866 pass`, `0 fail`, then completed deploy SQL order,
  architecture sync, task sync, brain sync, strict workflow, repository
  inspection, package dry-run, tarball install smoke, and
  `[release] OK: npm package gate passed`.
- `npm pack --dry-run --json --registry https://registry.npmjs.org/`
  returned:
  - filename: `repo-harness-0.7.2.tgz`
  - package size: `7859002`
  - unpacked size: `10245516`
  - total files: `333`
  - shasum: `fd80672886702dcf7f925cb9384dcb030a0694f5`
  - integrity:
    `sha512-yokXmM1rt4lc/ajJKnDWvVZPQq9s0x5O37wtYLqxALRG6ugOhV+UUqOPN0MaXojZSikagrkz1yhRSzLVc+Ur7A==`
- The package dry-run includes
  `assets/skill-commands/repo-harness-gptpro-setup/SKILL.md`,
  `assets/skill-commands/repo-harness-gptpro/SKILL.md`,
  `docs/repo-harness-chatgpt-browser-engine.md`, and
  `src/cli/chatgpt-browser/oracle-provider.ts`.

## Publish Evidence

- `npm whoami` with a temporary npmrc backed by the local
  `_ops/env/npm-token.md` token verified the publish identity as `ancienttwo`
  without writing the token to global config.
- `npm publish --access public --registry https://registry.npmjs.org/` used the
  same temporary npmrc and a temporary npm cache, reran the full
  `prepublishOnly` release gate successfully, and published
  `repo-harness@0.7.2`.
- Publish-time prepublish gate passed:
  - `bun test`: `866 pass`, `0 fail`, `8410` expect calls across `79` files.
  - deploy SQL order, architecture sync, task sync, brain sync, strict workflow,
    repository inspection, package dry-run, and tarball install smoke all passed.
  - `[release] OK: npm package gate passed.`
- `npm view repo-harness@0.7.2 version dist.tarball dist.shasum dist.integrity gitHead --json --registry https://registry.npmjs.org/`
  returned:
  - `version = "0.7.2"`
  - `dist.tarball = "https://registry.npmjs.org/repo-harness/-/repo-harness-0.7.2.tgz"`
  - `dist.shasum = "fd80672886702dcf7f925cb9384dcb030a0694f5"`
  - `dist.integrity = "sha512-yokXmM1rt4lc/ajJKnDWvVZPQq9s0x5O37wtYLqxALRG6ugOhV+UUqOPN0MaXojZSikagrkz1yhRSzLVc+Ur7A=="`
  - `gitHead = "2106c5725ebc2cc9e4ec2fa942c94b06daea855c"`
- `npm view repo-harness dist-tags --json --registry https://registry.npmjs.org/`
  returned `{ "latest": "0.7.2" }`.
- Git tag `v0.7.2` points to release commit `2106c57`.
- `bash scripts/check-release-published.sh 0.7.2` passed, proving registry,
  dist-tag, tarball, local tag, and local version files agree.
- Clean temporary install smoke passed:
  `npm install --registry https://registry.npmjs.org/ repo-harness@0.7.2`
  followed by `node_modules/.bin/repo-harness --version` returned `0.7.2`.

## Release Links

- npm: https://www.npmjs.com/package/repo-harness/v/0.7.2
- npm tarball: https://registry.npmjs.org/repo-harness/-/repo-harness-0.7.2.tgz
- GitHub release: https://github.com/Ancienttwo/repo-harness/releases/tag/v0.7.2
