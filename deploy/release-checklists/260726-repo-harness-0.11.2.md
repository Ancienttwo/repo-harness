# repo-harness 0.11.2 Release Filing

- Date: 2026-07-26
- Package: `repo-harness@0.11.2`
- Base release: `v0.11.1`
- Source range: `v0.11.1..candidate`
- Release scope: remove per-command `[ChecksFile]` context noise, keep
  out-of-repo paths outside capability/TDD jurisdiction while preserving path
  validation, and resolve SessionStart Effective State in process with bounded
  retry and redaction-safe unavailable evidence.
- Publish status: **pending publish**. This filing does not claim npm, Git tag,
  or GitHub Release completion until the public readbacks below pass.

## Candidate Evidence

- `f29a61cc` removes the redundant checks-file context line and prevents
  out-of-repo paths from invalidating the capability registry; focused path
  security coverage preserves traversal, NUL-byte, and Win32 validation.
- `76708be1` removes the remaining direct SessionStart self-CLI child, shares
  the bounded transient retry owner between both Effective State consumers, and
  adds normalized unavailable diagnostics without leaking raw messages, stacks,
  or absolute paths.
- The SessionStart characterization keeps `child_processes: 0`, keeps
  `handler-failed` as the host-liveness invariant, and still invokes the
  budgeter when diagnostics exist but normal sections are empty.
- Version sources and localized README projections are `0.11.2`; the generated
  stamp is `repo-harness@0.11.2+template@0.11.2`.

## Required Release Sequence

- [ ] Merge the release-candidate changes to `main` without unrelated files.
- [ ] Confirm all GitHub CI jobs are green for the merged source commit.
- [ ] Run `bun run check:release` on that exact merged commit.
- [ ] Publish `repo-harness@0.11.2` to the official npm registry with `latest`.
- [ ] Create and push annotated tag `v0.11.2` at the published source commit.
- [ ] Create stable GitHub Release `repo-harness 0.11.2` from `v0.11.2` with no
      attached asset, matching the established release convention.
- [ ] Run `bash scripts/check-release-published.sh 0.11.2` and verify registry,
      dist-tag, tarball integrity, source tag, GitHub Release, and clean-room CLI.

## Candidate Verification Record

- Version consistency, strict workflow, contract, and full release gates are
  recorded in `tasks/reviews/20260726-1414-release-0-11-2.review.md` before the
  release candidate is merged.
- Hosted CI, exact-main release gate, npm publication, annotated tag, GitHub
  Release, and published-package readbacks remain mandatory release operations;
  no unchecked item above is represented as completed by this source filing.

## Rollback

- Before npm publication: revert or abandon the single release-prep commit.
- After npm publication: never move/reuse `v0.11.2`; correct forward with a new
  patch release.
