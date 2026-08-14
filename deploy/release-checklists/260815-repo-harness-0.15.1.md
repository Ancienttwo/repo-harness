# repo-harness 0.15.1 Release Filing

- Date: 2026-08-15
- Package: `repo-harness@0.15.1`
- Base release: `v0.15.0`
- Source range: `v0.15.0..candidate`
- Candidate commit: pending freeze
- Release scope: publish the contract-first Change Assessment and acceptance
  authority, durable hook-effect recovery, Goal Calibration Gate, one-commit
  contract worktrees, nested capability routing, and transaction-safe semantic
  architecture queue events.
- Publish status: **pending publish**. Registry, tag, GitHub Release, and the
  selected Bun-global runtime are not claimed until their readbacks pass.

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
- Version consistency: pending candidate gate.
- Full repository/release checks: pending candidate gate.
- Packed tarball contents and isolated install: pending candidate gate.
- Exact `main` CI: pending candidate merge.
- Independent release review and AcceptanceReceipt: pending final subject.

## Required Release Sequence

- [x] Rebuild from current `main` and classify `v0.15.0..candidate` by shipped risk surface.
- [ ] Freeze the candidate and run `bun run check:release`.
- [ ] Record final-subject review and AcceptanceReceipt evidence.
- [ ] Merge the candidate to `main` and confirm exact GitHub Actions CI.
- [ ] Publish `repo-harness@0.15.1` to npm `latest`.
- [ ] Create and push annotated tag `v0.15.1` and stable GitHub Release.
- [ ] Run `bash scripts/check-release-published.sh 0.15.1`.
- [ ] Install exact Bun-global `repo-harness@0.15.1` and verify version/readiness.
- [ ] Record closeout evidence and return to clean, synchronized `main`.

## Rollback

- Before npm publication: abandon or revert the release-prep candidate.
- After npm publication: never move or reuse `v0.15.1`; correct forward with a
  later patch. The previous registry version remains installable exactly.
