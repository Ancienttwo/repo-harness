# repo-harness 0.15.0 Release Filing

- Date: 2026-08-12
- Package: `repo-harness@0.15.0`
- Base release: `v0.14.2`
- Source range: `v0.14.2..c30f08fcf306b15911f300288bd10cbff03d5377`
- Frozen product commit: `b8e3bea6bb3abab3b9059c1e0347fde7cf365482`
- Release scope: make the repo-level architecture changed-set cursor the single
  Stop/manual-drain mutation authority, retire the journal architecture dirty
  bit, preserve unacknowledged work when a legacy cascade cannot complete, and
  clarify the native Codex fleet contract against the 0.147 model catalog.
- Publish status: **complete**. npm `latest`, the annotated Git tag, the stable
  GitHub Release, and the selected Bun-global runtime all passed readback.

## Authority Boundary

- The frozen Stop diff supplies the changed set; Stop and manual drain consume
  the same cursor contract.
- Cascade acknowledgement occurs only after the selected runner and follow-up
  succeed. Runner unavailability and helper failures retain the cursor for a
  later retry.
- The retired journal architecture bit is not a compatibility authority or
  fallback path.
- Large dirty-tree Stop fan-out remains a deferred, measured performance risk;
  it does not change the correctness authority in this release.

## Candidate Evidence

- Version consistency: package, skill, and template all read back `0.15.0`.
- Full repository/release checks: `bun run check:release` passed at
  `628d0760fb713d9ffbfd60a864552c4361cc25fb` with 2,364 passing tests, one
  platform skip, zero failures, and 18,176 assertions.
- Packed tarball install and bin startup: passed for
  `repo-harness-0.15.0.tgz` in the same release gate.
- Exact `main` CI: GitHub Actions run `31610237896` passed for release commit
  `c30f08fcf306b15911f300288bd10cbff03d5377`.
- Skill-eval evidence: unavailable and not required for this hook correctness
  release; no effectiveness claim is made.

## Required Release Sequence

- [x] Classify `v0.14.2..candidate` as a backward-compatible minor release.
- [x] Freeze the rebound candidate and complete the final post-fix
      `bun run check:release` gate.
- [x] Record the rebound candidate subject and release-gate evidence.
- [x] Merge the candidate to `main`, push the exact release commit, and confirm
      GitHub Actions CI for that SHA.
- [x] Publish `repo-harness@0.15.0` to npm `latest`.
- [x] Create and push annotated tag `v0.15.0` and stable GitHub Release.
- [x] Run `bash scripts/check-release-published.sh 0.15.0`.
- [x] Install exact Bun-global `repo-harness@0.15.0` and verify version/readiness
      readback.

## Publish Follow-through

- npm publish returned `+ repo-harness@0.15.0`; registry readback returned
  `version=0.15.0`, `latest=0.15.0`, Git head `c30f08fcf306b15911f300288bd10cbff03d5377`,
  and shasum `9539f0bb14010a98bb22bf4331432f68b8eab58e`.
- Annotated tag `v0.15.0` peels to the release commit. The stable, non-draft,
  non-prerelease GitHub Release is
  `https://github.com/Ancienttwo/repo-harness/releases/tag/v0.15.0`.
- `bash scripts/check-release-published.sh 0.15.0` passed registry, dist-tag,
  tarball, tag, and local-version agreement.
- `bun install -g repo-harness@0.15.0` installed both package binaries;
  `repo-harness --version` returned `0.15.0`.
- `repo-harness update --check --json` returned `fail=0`, `needs_agent=0`,
  `ok=29`, `warn=1`, and `na=2`. The sole warning was an optional Skills CLI
  probe timeout; Waza, the Codex automation profile, agent fleet, CodeGraph,
  and ArchContext all reported present/ready, so no release claim depends on
  that advisory probe.

## Rollback

- Before npm publication: abandon or revert the release-prep candidate.
- After npm publication: never move or reuse `v0.15.0`; correct forward with a
  new patch release. The previous registry version remains installable by exact
  version.
