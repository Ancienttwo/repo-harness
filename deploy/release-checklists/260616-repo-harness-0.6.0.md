# Release Filing: repo-harness 0.6.0

Date: 2026-06-16
Status: Published and verified

## Scope

- Package target: `repo-harness@0.6.0`
- Base release: `v0.5.3`
- Release branch: `codex/sprint-transactional-adoption-planner`
- Registry: `https://registry.npmjs.org/`

## Version Decision

Use `0.6.0` as a minor release. The release contains the Transactional
Adoption Planner foundation: protocol v1 dry-run plans, manifest-owned
bootstrap templates, helper-wrapper planning, atomic writer backups,
experimental TypeScript apply, workflow-contract apply, and rollback metadata.

This is a compatible addition to the `repo-harness adopt` surface. Default
apply behavior remains on the existing shell migration path unless callers opt
into `--experimental-ts-apply`.

## Required Alignment

- `package.json`
- `.claude/.skill-version`
- `assets/skill-version.json`
- README current release/stamp references, including localized READMEs
- `docs/CHANGELOG.md`
- version expectation tests
- release checklist and task notes

## Preflight Evidence

- `npm view repo-harness version dist-tags --json --registry https://registry.npmjs.org/`
  returned current latest `0.5.3` before the version bump.
- `npm view repo-harness@0.6.0 version --json --registry https://registry.npmjs.org/`
  returned `E404`, proving the target package is unpublished before publish.
- `npm whoami --registry https://registry.npmjs.org/` initially returned
  `ENEEDAUTH`; npm publish was completed later from an authenticated runtime.
- Tooling update advisory was attempted. CodeGraph update/sync completed and
  setup check cleared the CodeGraph action. Waza update exited `0` but still
  leaves one `needs_agent` action; setup check has no warn/fail findings.
- `bash scripts/check-release-published.sh 0.6.0` passed after publish,
  proving npm registry readback, `latest` dist-tag, tarball integrity/shasum,
  local `v0.6.0` tag, and local version-file alignment.
- Registry readback returned:
  - version: `0.6.0`
  - dist-tag latest: `0.6.0`
  - shasum: `f0386f616f5ec0310166f728aa80539f1afe9c1b`
  - integrity:
    `sha512-g3rDuz3PQbOkI7+IeRebTfBK+xfXtEy7DagzRIz6d3FcU+vc1dfXYCn95L0nF9iYswCsKDdor/u4M65bLXPC4Q==`

## Verification

- `bun src/cli/index.ts --version` returned `0.6.0`.
- `bun scripts/check-skill-version.ts --project .` passed with
  `repo-harness=0.6.0` and `template=0.6.0`.
- `bun test tests/bootstrap-files.test.ts tests/skill-version.test.ts tests/readme-dx.test.ts tests/cli/global-runtime-init.test.ts`
  passed with `43 pass`, `0 fail`.
- `BUN_TEST_TIMEOUT_MS=180000 BUN_TEST_MAX_CONCURRENCY=1 bun run check:release`
  passed with `773 pass`, `0 fail`, then completed deploy SQL order,
  architecture sync, task sync, brain sync, strict workflow, repository
  inspection, migration dry-run, and package dry-run.
- `npm pack --dry-run --json` returned:
  - filename: `repo-harness-0.6.0.tgz`
  - package size: `4.7 MB`
  - unpacked size: `6.6 MB`
  - total files: `295`
  - shasum: `572bdfe55cb763ae300addf28d38da81337388a2`
  - integrity: `sha512-4dzCZs2htwLrBpcqoGSRxWdlrvrkZFhfSCXFCkhMtwb8wdow3Ns5T2rKJymSipNxtH8FjNjZ4036KOTqmdJPjQ==`
- `bash scripts/check-tarball-install-smoke.sh` passed, proving the local packed
  tarball installs into a temporary project and starts the packaged
  `repo-harness` and `repo-harness-hook` bins.

## Publish Evidence

- npm package: `repo-harness@0.6.0`
- npm dist-tag: `latest -> 0.6.0`
- Git tag: `v0.6.0`
- Post-publish readback command: `bash scripts/check-release-published.sh 0.6.0`
