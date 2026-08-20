> **Archived**: 2026-08-20 18:10
> **Related Plan**: (none)
> **Outcome**: Superseded
> **Lifecycle**: notes
> **Parent Run ID**: orphan-family-sweep

# repo-harness 0.5.0 Release Prep Notes

## Scope

Prepare the npm/package release line `repo-harness@0.5.0` after the command
boundary refactor split user-level runtime refresh from repo-local adoption.

## Decisions

| Decision | Rationale | Consequence |
| --- | --- | --- |
| Use `0.5.0` | `repo-harness update` changed public lifecycle ownership and no longer means repo-local refresh. | Treat the release as a minor version instead of another 0.4.x patch. |
| Keep one package/template version line | The 0.4.0 release retired the old generated-workflow compatibility split. | Downstream generated stamps move together to `repo-harness@0.5.0+template@0.5.0`. |
| Include `.claude/.skill-version` in the release commit | The self-host repo tracks the generated workflow stamp, and `migrate-project-template.sh` updates it during release verification. | Publish gates stay clean instead of discovering a tracked stamp diff during `prepublishOnly`. |
| Document eight hook routes in README | `src/cli/hook/route-registry.ts` exposes eight managed adapter routes across five host events. | The README now explains route behavior without implying there are eight host event types. |
| Execute publish after `next` | The next slice explicitly continues the prepared release. | npm publish, tag, GitHub release, readbacks, and local runtime refresh become part of the release closeout. |

## Verification

- `bun test tests/bootstrap-files.test.ts tests/skill-version.test.ts tests/cli/status.test.ts tests/cli/global-runtime-init.test.ts tests/cli/run.test.ts tests/reclaim-runtime.test.ts`
  passed with 51 tests, 0 failures.
- First `bash scripts/check-npm-release.sh` run reached full `bun test` with
  727 pass, 0 fail, then stopped at `check-task-sync` because this task note did
  not exist yet.
- Final `bash scripts/check-npm-release.sh` passed after adding this task note:
  727 pass, 0 fail, deploy SQL, architecture sync, task sync, brain sync,
  strict workflow, inspector, migration dry-run, and npm pack dry-run all
  completed.
- First `npm publish` attempt authenticated as `ancienttwo`, reran the full
  prepublish gate, and stopped at `check-task-sync` only because
  `.claude/.skill-version` was not in the prepared release commit. The stamp is
  now aligned to `0.5.0`.
- A later publish attempt hit one timeout in
  `Hook runtime behavior > run-hook preserves Codex failure status without
  surfacing telemetry JSON`. The focused test passed direct reproduction, so the
  closeout reran publish with `BUN_TEST_TIMEOUT_MS=180000` and
  `BUN_TEST_MAX_CONCURRENCY=1` instead of changing runtime behavior.
- Final `npm publish --access public --registry https://registry.npmjs.org/`
  completed successfully and returned `+ repo-harness@0.5.0`.
- Registry readback for `repo-harness@0.5.0` returned `latest=0.5.0`, tarball
  `https://registry.npmjs.org/repo-harness/-/repo-harness-0.5.0.tgz`, gitHead
  `79746b3254bc151e66d5154d0579c886f8156f68`, and shasum
  `61f9ca3c64a9fa1ebeaf10e941e087b91df7ba00`.
- `npx --yes --package repo-harness@0.5.0 repo-harness --version` returned
  `0.5.0`.
- Annotated tag `v0.5.0` was pushed, and GitHub release
  `https://github.com/Ancienttwo/repo-harness/releases/tag/v0.5.0` was created
  as the latest non-draft, non-prerelease release.
- Local runtime refresh installed `repo-harness@0.5.0` through Bun global and
  NVM Node 22 global, ran `repo-harness update --version 0.5.0`, and verified
  Bun, NVM, npx, and Homebrew-visible entrypoints all returned `0.5.0`.
- Local health readback: `repo-harness status --json` reported 8 managed routes
  for both Codex and Claude adapters, `repo-harness doctor --json` reported
  `ok=11`, `warn=0`, `fail=0`, and `repo-harness security scan --json`
  reported `ok` with no findings.
- `npm pack --dry-run --json` reported `repo-harness-0.5.0.tgz`, 276 files,
  shasum `61f9ca3c64a9fa1ebeaf10e941e087b91df7ba00`, and included
  `docs/images/image.png`.
- `npm view repo-harness@0.5.0 version --json --registry https://registry.npmjs.org/`
  returned `E404`, proving the target version is unpublished before publish.
- `gh release view v0.4.3 --repo Ancienttwo/repo-harness --json ...` confirmed
  the base release is published, non-draft, and non-prerelease.
