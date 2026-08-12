# repo-harness 0.15.0 Release Filing

- Date: 2026-08-12
- Package: `repo-harness@0.15.0`
- Base release: `v0.14.2`
- Source range: `v0.14.2..b8e3bea6bb3abab3b9059c1e0347fde7cf365482`
- Frozen product commit: `b8e3bea6bb3abab3b9059c1e0347fde7cf365482`
- Release scope: make the repo-level architecture changed-set cursor the single
  Stop/manual-drain mutation authority, retire the journal architecture dirty
  bit, preserve unacknowledged work when a legacy cascade cannot complete, and
  clarify the native Codex fleet contract against the 0.147 model catalog.
- Publish status: **pending publish**. Registry, tag, GitHub Release, and the
  selected Bun-global runtime are not claimed until their readbacks pass.

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
- Full repository/release checks: pending rerun for the rebound frozen product
  commit.
- Packed tarball install and bin startup: pending the same release-gate rerun.
- Exact `main` CI: pending candidate push.
- Skill-eval evidence: unavailable and not required for this hook correctness
  release; no effectiveness claim is made.

## Required Release Sequence

- [x] Classify `v0.14.2..candidate` as a backward-compatible minor release.
- [ ] Freeze the rebound candidate and complete the final post-fix
      `bun run check:release` gate.
- [ ] Record the rebound candidate subject and release-gate evidence.
- [ ] Merge the candidate to `main`, push the exact release commit, and confirm
      GitHub Actions CI for that SHA.
- [ ] Publish `repo-harness@0.15.0` to npm `latest`.
- [ ] Create and push annotated tag `v0.15.0` and stable GitHub Release.
- [ ] Run `bash scripts/check-release-published.sh 0.15.0`.
- [ ] Install exact Bun-global `repo-harness@0.15.0` and verify version/readiness
      readback.

## Rollback

- Before npm publication: abandon or revert the release-prep candidate.
- After npm publication: never move or reuse `v0.15.0`; correct forward with a
  new patch release. The previous registry version remains installable by exact
  version.
