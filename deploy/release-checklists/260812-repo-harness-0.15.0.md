# repo-harness 0.15.0 Release Filing

- Date: 2026-08-12
- Package: `repo-harness@0.15.0`
- Base release: `v0.14.2`
- Source range: `v0.14.2..candidate`
- Frozen product commit: `f3b4afe4da639e59927af542ed7f6359601e6e3d`
- Release scope: make the repo-level architecture changed-set cursor the single
  Stop/manual-drain mutation authority, retire the journal architecture dirty
  bit, and preserve unacknowledged work when a legacy cascade cannot complete.
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
- Full repository/release checks: 2364 pass, 1 platform skip, 0 fail;
  18,172 expectations across 183 test files.
- Packed tarball install and bin startup: pass for `repo-harness@0.15.0`.
- Exact `main` CI: pending candidate push.
- Skill-eval evidence: unavailable and not required for this hook correctness
  release; no effectiveness claim is made.

## Required Release Sequence

- [x] Classify `v0.14.2..candidate` as a backward-compatible minor release.
- [x] Freeze the candidate and complete the final post-fix
      `bun run check:release` gate.
- [x] Record the candidate subject, evidence hashes, and acceptance receipt.
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
