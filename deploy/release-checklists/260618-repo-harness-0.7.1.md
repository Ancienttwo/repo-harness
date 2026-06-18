# Release Filing: repo-harness 0.7.1

Date: 2026-06-18
Status: Prepared; npm publish, Git tag, and GitHub release pending

## Scope

- Package target: `repo-harness@0.7.1`
- Base release: `v0.7.0`
- Release branch: `main`
- Registry: `https://registry.npmjs.org/`

## Version Decision

Use `0.7.1` as a patch release. The release adds the GPT Pro setup and consult
skill facades over the existing ChatGPT Web browser-session bridge, keeps the
user-facing command language focused on `gptpro_*`, and fixes PostBash advisory
metadata so it no longer pollutes the authoritative `latest.json`
`repo-harness-run-trace.v1` slot.

## Required Alignment

- `package.json`
- `assets/skill-version.json`
- README current release/stamp references, including localized READMEs
- `docs/CHANGELOG.md`
- `assets/skill-commands/manifest.json`
- `assets/skill-commands/repo-harness-gptpro-setup/SKILL.md`
- `assets/skill-commands/repo-harness-gptpro/SKILL.md`
- PostBash installable and self-host hook runtime copies
- version expectation tests
- release checklist

## Preflight Evidence

- `npm view repo-harness version --registry https://registry.npmjs.org/`
  returned current latest `0.7.0`.
- `npm view repo-harness@0.7.1 version --json --registry https://registry.npmjs.org/`
  returned `E404`, proving the target package is unpublished before publish.
- `repo-harness setup check --target codex --check-updates --json` reported
  `status=ok`, `28 ok`, and no warnings, failures, or agent actions after Waza
  and CodeGraph bounded update commands were rerun.

## Verification

- `bun src/cli/index.ts --version` returned `0.7.1`.
- `bun scripts/check-skill-version.ts --project .` passed with
  `repo-harness=0.7.1`, `template=0.7.1`, and project stamp up to date.
- Full release gate passed:
  `BUN_TEST_TIMEOUT_MS=180000 BUN_TEST_MAX_CONCURRENCY=1 bun run check:release`
  returned `842 pass`, `0 fail`, then completed deploy SQL order,
  architecture sync, task sync, brain sync, strict workflow, repository
  inspection, package dry-run, tarball install smoke, and
  `[release] OK: npm package gate passed`.
- `npm pack --dry-run --json --registry https://registry.npmjs.org/`
  returned:
  - filename: `repo-harness-0.7.1.tgz`
  - package size: `7823545`
  - unpacked size: `10111036`
  - total files: `329`
  - shasum: `b5578e47bf8638f9f3ac994577f8ce6637269205`
  - integrity:
    `sha512-EAZMeECUmCCcm7oZWHQTfrKrZbe7FFwpAaQ/iGy2Ru0DcRNRPnroPP6eii03bL+1uzMOhPrscdBii+NiB+CQiw==`
- The package dry-run includes
  `assets/skill-commands/repo-harness-gptpro-setup/SKILL.md`,
  `assets/skill-commands/repo-harness-gptpro/SKILL.md`, and the updated
  `assets/hooks/post-bash.sh`.
- Pending publish readback:
  `bash scripts/check-release-published.sh 0.7.1`

## Publish Hold

- npm publish has not been run yet.
- Do not tag `v0.7.1` or create the GitHub release until npm publish and
  registry readback succeed.
