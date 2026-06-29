# repo-harness 0.8.3 release prep notes

## Scope

Prepare and publish `repo-harness@0.8.3` from current `main`.

## Decisions

| Decision | Rationale | Evidence |
|----------|-----------|----------|
| Use `0.8.3` | `0.8.2` is already published and npm versions are immutable; the package-only helper runtime fix landed after the `0.8.2` release commit. | `npm view repo-harness version dist-tags --json` returned `latest: 0.8.2`; `main` contains `7c0646c`. |
| Keep this a patch release | The change removes repo-local wrapper pollution and refreshes dependency lines without introducing a new public command surface. | `repo-harness adopt` now keeps helper execution package/global through `repo-harness run`; tests cover no repo-local helper scripts in standard adoption. |
| Publish only after full readback | Release is complete only when npm registry metadata, latest dist-tag, packed tarball metadata, local tag, and version files agree. | `scripts/check-release-published.sh <version>` is the post-publish gate. |

## Verification

- `bun scripts/check-skill-version.ts --project .` passed for `0.8.3`.
- `BUN_TEST_TIMEOUT_MS=180000 BUN_TEST_MAX_CONCURRENCY=1 bun run check:release` reached `1002 pass / 1 skip / 0 fail`; the first run stopped at `check-task-sync` because this task note had not yet been written.
- After writing this task note and refreshing workflow handoff state,
  `BUN_TEST_TIMEOUT_MS=180000 BUN_TEST_MAX_CONCURRENCY=1 bun run check:release`
  passed end to end: `1002 pass / 1 skip / 0 fail`, workflow checks OK,
  package dry-run OK, and tarball smoke OK for `repo-harness-0.8.3.tgz`.

## Remaining Closeout

- Publish npm with a temporary npmrc from `_ops/env/npm-token.md`.
- Create and push `v0.8.3`, create the GitHub Release, then run `bash scripts/check-release-published.sh 0.8.3`.
