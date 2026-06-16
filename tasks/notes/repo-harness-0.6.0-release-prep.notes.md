# repo-harness 0.6.0 Release Prep Notes

Prepare the npm/package release line `repo-harness@0.6.0` after the
Transactional Adoption Planner sprint and follow-up manifest/applicator slices.

## Decisions

| Decision | Rationale | Verification |
| --- | --- | --- |
| Use `0.6.0` | The release adds a new transactional adoption planner, structured dry-run protocol, manifest-owned bootstrap templates, experimental TypeScript apply, atomic writer backups, and rollback metadata. This is a feature line rather than a patch-only fix. | `package.json`, `assets/skill-version.json`, `.claude/.skill-version`, README release surfaces, changelog, and version tests all move together to `0.6.0`. |
| Keep one package/template version line | The 0.4.0 release retired the separate generated-workflow compatibility line, and this release does not introduce a compatibility split. | Downstream generated stamps move together to `repo-harness@0.6.0+template@0.6.0`. |
| Stop before publish without npm auth | `npm whoami --registry https://registry.npmjs.org/` returns `ENEEDAUTH`; creating a tag or GitHub release before npm publish would make the release state misleading. | Release checklist records the hold reason and required publish/readback steps. |

## Preflight Evidence

- `npm view repo-harness version dist-tags --json --registry https://registry.npmjs.org/`
  reported current latest `0.5.3`.
- `npm view repo-harness@0.6.0 version --json --registry https://registry.npmjs.org/`
  returned `E404`, so the target version is available.
- `repo-harness setup check --target codex --check-updates --json` still reports
  one Waza `needs_agent` action after the recommended update command exits `0`;
  CodeGraph update/sync cleared, and setup has no warn/fail findings.

## Verification Evidence

- `bun src/cli/index.ts --version` returned `0.6.0`.
- `bun scripts/check-skill-version.ts --project .` passed with
  `repo-harness=0.6.0` and `template=0.6.0`.
- Focused release metadata tests passed:
  `bun test tests/bootstrap-files.test.ts tests/skill-version.test.ts tests/readme-dx.test.ts tests/cli/global-runtime-init.test.ts`
  returned `43 pass`, `0 fail`.
- Full release gate passed:
  `BUN_TEST_TIMEOUT_MS=180000 BUN_TEST_MAX_CONCURRENCY=1 bun run check:release`
  returned `773 pass`, `0 fail`, then completed workflow checks, repository
  inspection, migration dry-run, and package dry-run.
- `npm pack --dry-run --json` returned `repo-harness-0.6.0.tgz`, package size
  `4.7 MB`, unpacked size `6.6 MB`, `295` files, and shasum
  `572bdfe55cb763ae300addf28d38da81337388a2`.

## Hold

- npm publish is blocked by npm auth: `npm whoami --registry
  https://registry.npmjs.org/` returned `ENEEDAUTH`.
- Do not tag `v0.6.0` or create a GitHub release until publish and registry
  readback succeed.
