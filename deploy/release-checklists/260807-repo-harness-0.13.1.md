# repo-harness 0.13.1 Release Filing

- Date: 2026-08-07
- Package: `repo-harness@0.13.1`
- Base release: `v0.13.0`
- Source range: `v0.13.0..candidate`
- Release scope: ship the `repo-harness-hook` bin as a prepack-built single-file
  bundle so registry reinstalls swap one file atomically, and land the four
  verification-harness fixes that had to precede it — the 1200s whole-round
  budget, the 1260s outer verifier wrapper that must sit above it, failing
  criterion log retention, and load-robustness for five timing-sensitive tests.
  Also picks up the MCP OAuth dynamic-client TTL fix (#161, #162) merged after
  the candidate range was cut: clients holding active tokens survive the
  absolute 30-day TTL, ending periodic re-authorization for active connectors.
- Publish status: **published**. `repo-harness@0.13.1` is live on npm
  (shasum `6026823b704a7fbf42478f0386cf5f2dc2911312`), tagged `v0.13.1` on
  release commit `53a089e2`, with the stable GitHub Release created and
  `check-release-published.sh 0.13.1` reporting registry, dist-tag, tarball,
  tag, and local version files in agreement.

## Candidate Evidence

- `110d689d` ships the hook bundle. `package.json` points `repo-harness-hook` at
  `dist/hook-entry.js`, adds the `prepack`/`build:hook-bundle` scripts, and
  packs `dist/hook-entry.js`; `.gitignore` ignores `dist/`. `src/cli/hook-entry.ts`
  gains an explicit `--detached-tooling-populate` dispatch branch because
  `bun build` folds `session-context.ts`'s `import.meta.main` bootstrap to
  `false` while `import.meta.url` retargets the respawn at the bundle; both
  surfaces call the same exported `runDetachedToolingPopulate`.
  `src/effects/evidence/post-bash-importer.ts` reads a `--define`-injected
  build-time version so the bundled provider id never emits `0.0.0`, and the
  build asserts the substitution landed. `src/core/adoption/source-checkout.ts`
  moves its canonical bin-map constant with the bin.
  `tests/unit/hook-entry-single-file-bundle.test.ts` covers bundled and
  unbundled dispatch plus the define behavior.
- `a8b9b73e` raises `VERIFICATION_BUDGET_MS` to 1200000 in both
  `scripts/verify-contract.sh` and its byte-identical
  `assets/templates/helpers/` projection, syncs the pinned assertion, and adds
  `tests/unit/helper-projection-drift.test.ts` asserting byte-equality for the
  51 copy pairs (`capability-resolver.ts` excluded as a generated projection).
- `7ab2a1f9` raises `VERIFIER_HELPER_TIMEOUT_MS` to `1_260_000` so the outer
  wrapper sits strictly above the inner budget plus 60s.
- `4aae83e3` retains a failing criterion's runner log at
  `.ai/harness/runs/<run-id>-<criterion-slug>.log`.
- `a2381159` hardens the five load-sensitive tests named by retained log
  `run-20260807T004613-2770-bun-test.log`.
- `29de7591` (PR #162, squash-merged rather than `contract-worktree finish`)
  keeps dynamic OAuth clients with active tokens past the 30-day TTL. Its
  work-package carries an AcceptanceReceipt recorded through verify-sprint on
  the contract worktree (16/16 Fulfilled, pre-fix RED artifact committed at
  `.ai/harness/checks/pre-fix-mcp-oauth-client-ttl.log`); PR CI ran 4/4 green.

## Required Release Sequence

- [x] Merge every candidate work-package to `main` through
      `contract-worktree finish`, each with its own AcceptanceReceipt.
- [x] Push `main` so local and `origin/main` agree before the release commit.
- [x] Bump `package.json`, `assets/skill-version.json`, `.claude/.skill-version`,
      and the five README `Current Release` blocks to `0.13.1`.
- [x] Run `bash scripts/check-npm-release.sh --prepublish` on the exact release
      commit and publish to npm.
- [x] Create the annotated tag `v0.13.1` on the published commit.
- [x] Create the stable GitHub Release `repo-harness 0.13.1` from `v0.13.1`
      with no attached asset, matching the established release convention.
- [x] Run `bash scripts/check-release-published.sh 0.13.1`.

## Candidate Verification Record

- Each candidate work-package carries its own AcceptanceReceipt and archived
  review under `tasks/archive/`; the bundle's final round recorded
  `total=9 failed=0 status=Fulfilled` with `bun test` green and the tarball
  install smoke passing.
- `bash scripts/check-tarball-install-smoke.sh` passed on `7e9d6361` before the
  version bump.
- The bundle's own falsifier was exercised directly: 25 hook probes against
  `dist/hook-entry.js` during 40 atomic `rename(2)` swaps produced 0 failures
  and no probe over 3s.
- Unchecked items above are not represented as completed by this filing.

## Rollback

- Before npm publication: revert or abandon the release-prep commit.
- After npm publication: never move or reuse `v0.13.1`; correct forward with a
  new patch release.
