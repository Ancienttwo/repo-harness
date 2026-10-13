# repo-harness 0.22.1 publication record

## Scope and authority

- Base: `4703dd9017ec14abbbff5937ad00432f456edb30` (#683 squash merge) on
  `main`. Parent: `f79b6838` (#671).
- `v0.22.0` (`193d6825be73dc5806481ca296e0e3de15d0d72c`) was tagged but not
  published to npm or GitHub Releases. 0.22.1 replaces it and contains all
  of 0.22.0.
- The release contains every main commit after `v0.22.0`: #651, #659, #656,
  #654, #657, #661, #658, #655, #660, #673, #671 and #683.
- The release branch adds two commits:
  - `fix(review): keep the round body in runReviewRound for the flow proof`.
    #657 moved the round body into a private helper. The acceptance-review
    flow proof requires the entrypoint `runReviewRound` to call
    `composeReviewPacket`, `validateReviewOutput` and `recordAcceptance`
    directly. The body is back in `runReviewRound`. Overloads keep the
    herdr return type narrow. Behavior does not change.
  - `chore(release): prepare repo-harness 0.22.1`: versions, changelog, this
    record, and the refreshed `docs/architecture/.projection-manifest.json`.
    Five capability source digests changed after #657 and #683. The rendered
    pages did not change. `architecture-projection check` returns `noop`.
- Pi `1.2.0` is now the exact supported Pi version (#683). `@botiverse/oar`
  depends on Pi `^1.1.0`, so a fresh install resolved Pi `1.2.0` and the
  first tarball smoke failed with the old `1.1.0` pin.
- On 2026-10-13 the owner chose version 0.22.1 and skipped publication of
  0.22.0. The owner then authorized: "绿了就合，然后发版" (merge #683 when
  green, then release).

## Acceptance environment

- macOS arm64, Bun 1.4.3, Node 24.21.0, locked dependencies.
- Each run used a new temporary HOME under `/tmp`.
- `CLAUDECODE`, `AI_AGENT`, `AGENT` and `REPL_ID` were removed, so Bun
  prints passing test lines.
- The gate ran on a local base of `f79b6838` plus the three #683 branch
  commits. That base tree (`1d2e26c6`) equals the tree of `4703dd90`. The
  release commit tree (`b4b1a2c5`) did not change after the rebase onto
  `4703dd90`.

## Acceptance status

- First gate run: `bash scripts/check-npm-release.sh --prepublish` and the
  tarball smoke returned 0. `bun run check:release` and
  `bash scripts/check-ci.sh governance` stopped at the architecture
  projection step: `planned` with a stale manifest. The release commit then
  applied the projection.
- Second gate run at `f01e4249` (tree `b4b1a2c5`):
  - `bash scripts/check-npm-release.sh --prepublish`: exit 0.
  - `bun run check:release`: exit 1. 384 test files ran. 383 passed.
    `tests/effects/dev-activity-collector.test.ts` case `reaps a direct
    child that ignores SIGTERM on aborted` did not see the fixture ready
    file within 2000 ms under eight parallel file workers. The same file
    timed out under load in the 0.22.0 gate. Alone, the file passed three
    times: 12/12 each time.
  - `bash scripts/check-tarball-install-smoke.sh`: exit 0.
    `repo-harness-0.22.1.tgz` installs, serves the packaged Operator, and
    the packaged CLI bins start. The Pi package smoke passed with Pi 1.2.0.
  - `bash scripts/check-ci.sh governance`: exit 0. The architecture
    projection step returned `noop`.
- #683 PR CI passed on its final head `a7a252d5`.
- #687 PR CI passed on its final head `e5b487bd`. Codex review had no
  findings.
- #684 merged to main after the gate and before the #687 merge. It adds
  four assertion lines to `tests/pi-extension.test.ts`. The release merge
  commit therefore contains #684. Delta checks at `dc0efeb2` in a clean
  checkout (Node 24, temporary HOME, agent variables removed):
  - `bun run check:type`: exit 0.
  - `tests/pi-extension.test.ts`: 19 passed, 0 failed.
  - `bash scripts/check-tarball-install-smoke.sh`: exit 0, including the
    Pi package smoke.
  - `architecture-projection check`: `planned`. #684 changed the source
    digest of `capability.verification.evals-checks`. The manifest and
    `tests/` are not in the npm package. A later main PR refreshed the
    manifest.
- No assertion or timeout was changed for this release.

## Rollback evidence

- Release squash merge (#687): `dc0efeb20da72ee47b1c5946cd424838003c2972`.
  Parent: `9ab7dd02f0b3fde11c47f726cc8e1a2ab01abe88` (#684).
  `git revert --no-edit dc0efeb2`.
- #683 squash merge: `4703dd9017ec14abbbff5937ad00432f456edb30`.
  Parent: `f79b6838`. `git revert --no-edit 4703dd90`. A revert restores
  the Pi `1.1.0` pin; a fresh install then resolves Pi `1.2.0` again and
  the Pi extension refuses it.
- A Git revert does not undo an npm publication.

## Publication status

- Status: npm and GitHub publication verified on 2026-10-13.
- Source release commit: `dc0efeb20da72ee47b1c5946cd424838003c2972`.
- Annotated tag `v0.22.1`: object `a97c2c5ee032a0826f8c88d570d9e598689f7495`,
  pointing to the source release commit.
- Tarball: `npm pack` in a clean checkout of the source release commit.
  814 entries. SHA256
  `3daf74ca38097c2ae848cb2a9a9996ff027df388381be28ed4bdae980a396110`.
- npm: the owner published that tarball after browser authentication.
  Registry shasum `a4033498065491d776eb67e9652f8a2fab45df4f` and integrity
  equal the local tarball. The `latest` dist-tag is 0.22.1.
  `bun run check:release-published 0.22.1` returned OK; runtime evidence
  receipt `sha256:5f92ba5e0ee3f67ee7af3020a743783de756850e677ec90c9f229637516b2e40`.
- GitHub Release: https://github.com/Ancienttwo/repo-harness/releases/tag/v0.22.1.
  The downloaded asset SHA256 equals the tarball above.
- Local runtime: `repo-harness update --version 0.22.1` on the 0.21.2 CLI
  failed. The first run hit a stale Bun manifest cache. The second run
  failed with `archctx architecture docs renderer mismatch`: the 0.21.2
  verifier requires renderer v4, and archctx 0.7.2 reports v5 (#699). The
  owner's CLI stayed at 0.21.2. `bun add -g repo-harness@0.22.1` then
  installed 0.22.1, and `repo-harness update` on 0.22.1 code returned 0.
  The setup check reports no failure. The GitHub Release notes give this
  workaround.
