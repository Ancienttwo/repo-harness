# Release Filing: repo-harness 0.6.0

Date: 2026-06-16
Status: Prepared locally; npm publish is blocked by missing npm auth

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
- `npm whoami --registry https://registry.npmjs.org/` returned `ENEEDAUTH`; npm
  publish cannot proceed from this machine until npm auth is configured.
- Tooling update advisory was attempted. CodeGraph update/sync completed and
  setup check cleared the CodeGraph action. Waza update exited `0` but still
  leaves one `needs_agent` action; setup check has no warn/fail findings.

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

## Publish Hold

- Hold reason: npm auth is missing (`ENEEDAUTH`).
- Do not create `v0.6.0` tag or GitHub release until npm publish can run and
  registry readback proves the package was published.
