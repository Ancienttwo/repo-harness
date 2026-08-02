# repo-harness 0.12.2 Release Filing

- Date: 2026-08-02
- Package: `repo-harness@0.12.2`
- Base release: `v0.12.1`
- Source range: `v0.12.1..candidate`
- Release scope: make agent-fleet health receipt-aware, converge packaged fleet
  authorship, isolate verification from helper-injected environment and stale
  provenance, and move Codex delegation to exact role-mapped App Threads with
  fail-closed native-spawn eligibility plus codex-exec/main-thread degradation.
- Publish status: **pending publish**. This filing does not claim npm, Git tag,
  or GitHub Release completion until the public readbacks below pass.

## Candidate Evidence

- `e5498b86` / PR #148 makes `check-agent-tooling.sh` honor hash-bound
  user-managed receipts and keeps absent, invalid, or mismatched receipts on the
  drift path; `048ced89` / PR #149 documents the contract, makes
  `agents/fleet/` the single authored role authority, and regenerates the
  gatekeeper Codex fixture through the installer mapping.
- `27c42d77` / PR #150 removes real upstream network calls from the four receipt
  update-check tests by using the suite's existing fake-curl boundary.
- `62daea2e` / PR #152 scrubs the whole `REPO_HARNESS_*` prefix at the bounded
  verifier spawn boundary; `5e89f6c8` / PR #153 strips materializer-owned
  provenance from the acceptance finalize overlay so the resulting projection
  re-verifies from its own bytes.
- `143e36b0`, `5e89f6c8`, and `876725fe` close the fulfilled workflow packages
  through typed acceptance and archive surfaces without adding product
  compatibility paths.
- `1c64c507` / PR #155 changes the canonical policy, advisor, standing
  authorization, downstream initializer seeds, helper mirror, and tests to
  prefer App Threads with role-TOML model/effort and fail closed when either
  thread or native schema cannot carry the exact tuple.
- `7c93c914` / PR #156 records the live fast-worker canary: requested and
  host-observed `gpt-5.6-luna`/`max` matched, while public `read_thread` omitted
  model/effort on Codex CLI `0.146.0-alpha.9.2`; portable runtime readiness
  therefore remains unverified rather than inferred from rollout JSONL.
- Version sources and localized README projections are `0.12.2`; the generated
  stamp is `repo-harness@0.12.2+template@0.12.2`.

## Required Release Sequence

- [ ] Merge the release-candidate changes to `main` without unrelated files.
- [ ] Confirm all GitHub CI jobs are green for the merged source commit.
- [ ] Run `bun run check:release` on that exact merged commit.
- [ ] Publish `repo-harness@0.12.2` to the official npm registry with `latest`.
- [ ] Create and push annotated tag `v0.12.2` at the published source commit.
- [ ] Create stable GitHub Release `repo-harness 0.12.2` from `v0.12.2` with no
      attached asset, matching the established release convention.
- [ ] Run `bash scripts/check-release-published.sh 0.12.2` and verify registry,
      dist-tag, tarball integrity, source tag, GitHub Release, and clean-room CLI.

## Candidate Verification Record

- The release gate is run on the release-prep branch before merge and again on
  the exact merged `main` commit before publication.
- Hosted CI, exact-main release gate, npm publication, annotated tag, GitHub
  Release, and published-package readbacks remain mandatory release operations;
  no unchecked item above is represented as completed by this source filing.

## Rollback

- Before npm publication: revert or abandon the release-prep commit.
- After npm publication: never move or reuse `v0.12.2`; correct forward with a
  new patch release.
