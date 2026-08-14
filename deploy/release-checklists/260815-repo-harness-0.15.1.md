# repo-harness 0.15.1 Release Filing

- Date: 2026-08-15
- Package: `repo-harness@0.15.1`
- Base release: `v0.15.0`
- Source range: `v0.15.0..0f8a80fb8b27320f61178331ac4ed70a93382aeb`
- Release-prep commit: `eb5970dad9474638a00c7357d7eeae2e53705345`
- Final candidate commit: `0f8a80fb8b27320f61178331ac4ed70a93382aeb`
- Release scope: publish the contract-first Change Assessment and acceptance
  authority, durable hook-effect recovery, Goal Calibration Gate, one-commit
  contract worktrees, nested capability routing, and transaction-safe semantic
  architecture queue events.
- Publish status: **complete**. Registry, tag, GitHub Release, and the selected
  Bun-global runtime all passed readback.

## Authority Boundary

- Release metadata changes no product behavior; the shipped implementation
  range is already merged on `main`.
- Change Assessment and AcceptanceReceipt remain the final-subject acceptance
  authority; review Markdown is a projection.
- Architecture event identity is per file and semantic scope. Record and
  archive share one rollback-safe queue lock outside the snapshot tree.
- npm `latest`, `v0.15.1`, GitHub Release, tarball metadata, local version
  fields, and installed runtime must resolve to one immutable release.

## Candidate Evidence

- npm baseline: `latest=0.15.0`; `repo-harness@0.15.1` returned E404 before
  candidate preparation.
- Version consistency: `check-skill-version`, CLI `--version`, helper/hook
  projection checks, typecheck, state boundaries, and 37 focused release tests
  passed; all source authorities report 0.15.1.
- Full repository/release checks: the non-isolated local run reached 2429 pass,
  1 skip, 6 fail; the CI-isolated rerun stopped at the same macOS Node 26
  ArchContext fixture mismatch already present on clean `main`. Exact hosted
  Node 24 CI remains the release authority and is pending candidate push.
- Packed tarball contents and isolated install: `repo-harness-0.15.1.tgz`
  contains 484 files, is 9,944,553 bytes (15,057,942 unpacked), and includes
  the Change Assessment, runtime receipt, and architecture queue canonical plus
  template helpers. `check-tarball-install-smoke.sh` passed under Node 24.
- Acceptance blocker repair: PR #190 preserves long committed oracle IDs at
  the fingerprinted `required_oracles[].id` path; 54 focused tests,
  self-hosted typed acceptance, and exact hosted CI passed before merge to
  `main@1185370b2a2ea660dd47e61d58e0e1a08862b9ff`.
- Exact PR CI run `31831595965` and exact `main` CI run `31832159174` passed.
- Independent release review and the typed user-waiver AcceptanceReceipt passed
  against subject `sha256:fa6f7d76b1d12282cda8ec4642b7fa96ddab45067455d1fd53f1de00325d31e8`.

## Required Release Sequence

- [x] Rebuild from current `main` and classify `v0.15.0..candidate` by shipped risk surface.
- [x] Freeze the candidate and run `bun run check:release`; preserve the local
  Node 26 baseline mismatch for hosted Node 24 CI resolution.
- [x] Record final-subject review and AcceptanceReceipt evidence.
- [x] Merge the candidate to `main` and confirm exact GitHub Actions CI.
- [x] Publish `repo-harness@0.15.1` to npm `latest`.
- [x] Create and push annotated tag `v0.15.1` and stable GitHub Release.
- [x] Run `bash scripts/check-release-published.sh 0.15.1`.
- [x] Install exact Bun-global `repo-harness@0.15.1` and verify version/readiness.
- [x] Record closeout evidence and return to clean, synchronized `main`.

## Publish Follow-through

- npm Web Auth publication returned `+ repo-harness@0.15.1`; registry readback
  returned `version=0.15.1`, `latest=0.15.1`, shasum
  `50b53aad01862ed2ca3989ec73777e7d47223b0a`, and integrity
  `sha512-Ss8z9CwiNEoID6jA/aB3kdrwadJXncVKloDwffmicgPXTzZmzXZawpmXpUiPyPo2eP7WGseVxA9dVxTHvP8NUg==`.
- Annotated tag `v0.15.1` peels to
  `0f8a80fb8b27320f61178331ac4ed70a93382aeb`; the stable, non-draft,
  non-prerelease GitHub Release is
  `https://github.com/Ancienttwo/repo-harness/releases/tag/v0.15.1`.
- `bash scripts/check-release-published.sh 0.15.1` passed registry, dist-tag,
  tarball, tag, runtime receipt, and local-version agreement.
- `bun install -g repo-harness@0.15.1` installed both binaries;
  `repo-harness --version` returned `0.15.1`.
- Runtime readiness returned `fail=0`, `needs_agent=0`, `ok=29`, `warn=1`, and
  `na=2`; the sole warning is advisory and no release authority depends on it.

## Rollback

- Before npm publication: abandon or revert the release-prep candidate.
- After npm publication: never move or reuse `v0.15.1`; correct forward with a
  later patch. The previous registry version remains installable exactly.
