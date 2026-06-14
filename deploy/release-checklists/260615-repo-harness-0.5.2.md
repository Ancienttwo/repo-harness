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

- Pending.

## Hold Reason

- Pending npm publish, registry readback, tag push, GitHub release, and local
  runtime refresh.
