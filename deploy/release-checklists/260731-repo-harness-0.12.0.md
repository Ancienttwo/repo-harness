# repo-harness 0.12.0 Release Filing

- Date: 2026-07-31
- Package: `repo-harness@0.12.0`
- Base release: `v0.11.3`
- Source range: `v0.11.3..candidate`
- Release scope: land the previously-announced breaking `adopt`-to-`init`
  cutover, add the `deep-worker` managed fleet agent with a Codex model
  projection respec, converge `docs/reference-configs` on a generated
  projection of `assets/reference-configs`, and fix four production defects —
  an MCP allowed-root realpath-canonicalization false denial, an
  `ensure-task-workflow` bootstrap write-order race, an `acceptance-receipt`
  evidence-fingerprint key-order defect, and a `contract-worktree` cleanup gap
  that left squash-absorbed branches undeleted.
- Publish status: **pending publish**. This filing does not claim npm, Git tag,
  or GitHub Release completion until the public readbacks below pass.

## Candidate Evidence

- `bd2155da` (PR #137) adds `deep-worker` to the managed agent fleet
  (Opus/high effort, workspace-write) across `.claude/agents/`,
  `.codex/agents/`, and `agents/fleet/`, moves `fast-worker` from Sonnet/max
  to Opus/medium with an explicit max-target override, and respecs the
  default Codex model projection for the `opus` family.
- `4a795875` (PR #138) fixes two production defects: an MCP allowed-root
  policy false denial on realpath-canonicalized prefixes such as
  `/private/tmp` on macOS, and an `ensure-task-workflow` bootstrap
  write-order race where the resume packet could be written before the
  current-status snapshot, failing `check-task-workflow --strict`'s
  whole-second mtime comparison nondeterministically.
- `8b506da4` (PR #139) lands the breaking `repo-harness adopt` removal:
  `init` takes over repo-local adoption byte-for-byte, the former duplicate
  global-bootstrap `init` block is removed, and `install` becomes the sole
  global/host-level bootstrap entrypoint; this is the Breaking entry already
  carried in the Unreleased changelog before this prep started.
- `3c991466` (PR #140) fixes `acceptance-receipt`'s verification-evidence
  fingerprint so it hashes through the existing `stableJson()` canonicalizer
  instead of raw `JSON.stringify`, closing a key-order-sensitivity defect
  between the evidence ledger's inline and blob storage paths that could
  fail acceptance closed as stale with no semantic change.
- `83792a81` (PR #141) makes `docs/reference-configs/` a generated
  projection of the shipped `assets/reference-configs/` source, adds
  `scripts/sync-reference-configs.ts --check/--write` wired into `check-ci`,
  and replaces scattered duplicate test assertions with one inventory-driven
  projection guard.
- `a37c16e4` (PR #142) fixes `contract-worktree` cleanup so a squash-merged
  branch is recognized as absorbed via an exact `git merge-tree`
  tree-equality fallback instead of ancestry alone, closing a false-refusal
  gap on this repo's own squash-merge ship flow.
- `eb6c001c` (PR #143) extends #142: absorbed branches now delete with
  `git branch -D` while plain ancestor merges still use `-d`, closing the
  half-completed cleanup (worktree removed, branch left behind) that
  unconditional `-d` caused on every squash-absorbed package.
- Version sources and localized README projections are `0.12.0`; the
  generated stamp is `repo-harness@0.12.0+template@0.12.0`.

## Required Release Sequence

- [ ] Merge the release-candidate changes to `main` without unrelated files.
- [ ] Confirm all GitHub CI jobs are green for the merged source commit.
- [ ] Run `bun run check:release` on that exact merged commit.
- [ ] Publish `repo-harness@0.12.0` to the official npm registry with `latest`.
- [ ] Create and push annotated tag `v0.12.0` at the published source commit.
- [ ] Create stable GitHub Release `repo-harness 0.12.0` from `v0.12.0` with no
      attached asset, matching the established release convention.
- [ ] Run `bash scripts/check-release-published.sh 0.12.0` and verify registry,
      dist-tag, tarball integrity, source tag, GitHub Release, and clean-room CLI.

## Candidate Verification Record

- Version consistency, strict workflow, contract, and full release gates are
  recorded in `tasks/reviews/20260731-1626-release-0-12-0.review.md` before
  the release candidate is merged.
- Hosted CI, exact-main release gate, npm publication, annotated tag, GitHub
  Release, and published-package readbacks remain mandatory release operations;
  no unchecked item above is represented as completed by this source filing.

## Rollback

- Before npm publication: revert or abandon the single release-prep commit.
- After npm publication: never move/reuse `v0.12.0`; correct forward with a new
  patch release.
