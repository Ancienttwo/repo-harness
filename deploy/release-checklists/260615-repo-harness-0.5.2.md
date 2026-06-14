# Release Filing: repo-harness 0.5.2

Date: 2026-06-15
Status: Prepared for npm and GitHub release

## Scope

- Package target: `repo-harness@0.5.2`
- Base release: `v0.5.1`
- Release branch: `main`
- Registry: `https://registry.npmjs.org/`

## Version Decision

Use `0.5.2` as a patch release. The public command lifecycle remains the
`0.5.0` boundary; this release closes setup/readiness noise and recovery gaps:
weekly SessionStart tooling-update advisory caching, reviewed security
exceptions for warning-only user-level hooks, accepted gbrain fast-mode DB-skip
readiness, and Claude review transcript recovery.

## Required Alignment

- `package.json`
- `.claude/.skill-version`
- `assets/skill-version.json`
- README current release/stamp references, including localized READMEs
- `docs/CHANGELOG.md`
- version expectation tests
- `scripts/check-agent-tooling.sh`
- `assets/templates/helpers/check-agent-tooling.sh`
- `assets/skills/claude-review/SKILL.md`

## Preflight Evidence

- `npm view repo-harness version dist-tags --json --registry https://registry.npmjs.org/`
  returned current latest `0.5.1` before the version bump.
- `npm view repo-harness@0.5.2 version --json --registry https://registry.npmjs.org/`
  returned `E404`, proving the target package is unpublished before publish.
- `gh release view v0.5.1 --repo Ancienttwo/repo-harness --json tagName,name,publishedAt,url,targetCommitish,isDraft,isPrerelease,assets`
  returned the public `v0.5.1` release, non-draft, non-prerelease, with no
  assets.

## Verification

- `bun src/cli/index.ts --version` returned `0.5.2`.
- `bun src/cli/index.ts status --json` returned CLI version `0.5.2` and `8`
  managed routes, with both Codex and Claude adapters at `8/8` managed entries.
- `bun scripts/check-skill-version.ts --project .` passed with
  `repo-harness=0.5.2` and `template=0.5.2`.
- `repo-harness setup check --target codex --check-updates --json` returned
  `status=ok`, `28 ok`, `0 warn`, `0 fail`, `0 needs_agent`; Waza and
  CodeGraph were `update=up-to-date`, and gbrain was `present` with the
  fast-mode DB check intentionally skipped.
- `bun test tests/bootstrap-files.test.ts tests/skill-version.test.ts tests/readme-dx.test.ts tests/check-agent-tooling.test.ts tests/cli/security.test.ts tests/cli/doctor.test.ts tests/hook-contracts.test.ts tests/hook-runtime.test.ts`
  passed with `196 pass`, `0 fail`.
- `BUN_TEST_TIMEOUT_MS=180000 BUN_TEST_MAX_CONCURRENCY=1 bun run check:release`
  passed with `752 pass`, `0 fail`, then completed workflow checks, repository
  inspection, and `npm pack --dry-run`.

## Publish Evidence

- `npm publish --access public --registry https://registry.npmjs.org/` succeeded
  after the `prepublishOnly` release gate passed with `752 pass`, `0 fail`, then
  completed workflow checks, repository inspection, and `npm pack --dry-run`.
- Published tarball: `repo-harness-0.5.2.tgz`, package size `4.7 MB`,
  unpacked size `6.5 MB`, total files `280`, shasum
  `c73dab58d51c6377fef1ad21ddff45ed0175a773`.
- `npm view repo-harness@0.5.2 version gitHead dist.shasum dist.tarball --json --registry https://registry.npmjs.org/`
  returned version `0.5.2`, `gitHead`
  `321d01c56f88e00b6241948af9b8155f0689be92`, shasum
  `c73dab58d51c6377fef1ad21ddff45ed0175a773`, and tarball
  `https://registry.npmjs.org/repo-harness/-/repo-harness-0.5.2.tgz`.
- `npm view repo-harness version dist-tags --json --registry https://registry.npmjs.org/`
  returned `version=0.5.2` and `latest=0.5.2` after registry propagation.
- Clean-room `npx --yes --package repo-harness@0.5.2 repo-harness --version`
  from a temporary directory returned `0.5.2`.
- Tag `v0.5.2` was created and pushed for commit
  `321d01c56f88e00b6241948af9b8155f0689be92`.
- GitHub release `repo-harness 0.5.2` was created at
  `https://github.com/Ancienttwo/repo-harness/releases/tag/v0.5.2`; release
  verification returned `isDraft=false`, `isPrerelease=false`, and no assets.
- Local runtime refresh ran through `repo-harness update --channel latest --json`
  and installed `repo-harness@0.5.2` with Bun global tooling; npm global was also
  installed from `repo-harness@0.5.2`.
- Local runtime readback returned `/opt/homebrew/bin/repo-harness`,
  `/Users/chris/.bun/node/bin/repo-harness`, and
  `/Users/chris/.bun/bin/repo-harness` all at version `0.5.2`; npm global and
  Bun global both report `repo-harness@0.5.2`.
- `repo-harness status --json` returned CLI version `0.5.2`, `8` routes, and
  both Codex and Claude targets configured at `8/8` managed entries.
- `repo-harness doctor --json` returned `0 fail`, `0 warn`, `11 ok`; the
  security check reported `no active findings; 2 reviewed exception(s)`.
- `repo-harness setup check --target codex --check-updates --json` returned
  `status=ok`, `28 ok`, `0 warn`, `0 fail`, `0 needs_agent`; Waza, CodeGraph,
  gbrain, and CLI update checks were all current.

## Hold Reason

- None for `0.5.2`.

## Post-Release Follow-up

- `repo-harness update --version 0.5.2 --json` currently prints the CLI version
  instead of running update because Commander handles the global `--version`
  flag before the subcommand option. The local refresh used
  `repo-harness update --channel latest --json` after `latest` moved to `0.5.2`.
