# repo-harness 0.15.2 Release Filing

- Date: 2026-08-16
- Package: `repo-harness@0.15.2`
- Base release: `v0.15.1`
- Source range: `v0.15.1..67a0b271d008b81f8c095b24f6cceb4f177610e0`
- Release-prep commit: `dd9dcf4cded6a4d95f0fe3fc2d37d758e7bcf449`
- Final candidate commit: `ed54f6dd3f84efec93edc7e65ba48666e961104c`
- Release scope: publish the archctx 0.4.3 / docs-renderer v3 sync that adopts
  the upstream canonical-body-digest restamp-churn fix, the repo-owned
  `obsidian-memory` dual-host skill-surface facade with runtime-referenced
  official Obsidian skills, the CLI test machine node-runtime authority strip
  for local/CI parity, and the archctx target-repo resolution fix that closes
  the publish-to-global-refresh Stop-block window.
- Publish status: **complete**. Registry, tag, GitHub Release, published-package
  readback, selected Bun-global runtime, and the post-refresh architecture
  projection acceptance all passed.

## Authority Boundary

- Release metadata changes no product behavior; the shipped implementation
  range is already merged on `main` at `67a0b271`.
- `.ai/harness/policy.json#architecture.projection_version` and the vendored
  archctx dependency are one authority at 0.4.3; the CLI package root is no
  longer the resolution start point for a target repo's archctx.
- The `obsidian-memory` facade is a repo-owned skill surface; the official
  Obsidian skills stay runtime-referenced and are never vendored.
- npm `latest`, `v0.15.2`, GitHub Release, tarball metadata, local version
  fields, and installed runtime must resolve to one immutable release.

## Candidate Evidence

- npm baseline: `npm view repo-harness version` returned `0.15.1`;
  `npm view repo-harness@0.15.2 version` returned E404 before candidate
  preparation.
- `bun run check:release`: exit 0, `[release] OK: npm package gate passed.`
  The gate covered hook projection (3 files), helper projection (54 helpers),
  reference-configs projection (23 docs), typecheck, state boundaries (153
  TypeScript files), the full test suite, workflow checks, repository
  inspection, and the package dry-run. Environment-dependent failures: none.
  The `[hook:*] ... failed`, `repo-harness hook: stop failed: ...`, and
  `WorkflowProfileGuard ... block` lines in the log are asserted negative-path
  fixture output from `tests/skill-hooks.test.ts` and the guard tests, not
  gate failures.
- `bun run check:type`: exit 0, `node node_modules/typescript/bin/tsc --noEmit`
  reported no diagnostics.
- `bun test` (full, standalone run): exit 0, 2445 pass, 1 skip, 0 fail, 18833
  `expect()` calls, 2446 tests across 187 files in 780.86s. The isolated rerun
  inside `check:release` reported the identical 2445 pass / 1 skip / 0 fail in
  753.99s.
- `bash scripts/check-deploy-sql-order.sh`: exit 0, `[deploy-sql] OK`.
- `bash scripts/check-architecture-sync.sh`: exit 0,
  `mode=strict gate_min_severity=medium changed_capabilities=3 blocking=0` and
  `provider=archctx apply=automatic state=ready pending=0 running=0
  dead_letters=0 human_actions=0 adoption_required=0 blocking=0`.
- `bash scripts/check-task-sync.sh`: exit 0,
  `[task-sync] Repo changes include synchronized tasks/ updates.`
- Packed tarball: `repo-harness-0.15.2.tgz` contains 485 files, is 9,970,771
  bytes packed and 15,076,890 bytes unpacked. `[tarball-smoke] OK:
  repo-harness-0.15.2.tgz installs and packaged CLI bins start.`
- Skill eval evidence: **unavailable this cycle**. No
  `full_test_count`, `dry_run_ratio`, `grader_pass_rate`, or
  `effectiveness_authority` was produced for 0.15.2. Per the filing rules in
  `docs/reference-configs/release-deploy.md`, missing eval evidence is recorded
  as unavailable rather than substituted; this release's authority rests on the
  full `check:release` gate and the standalone full test run.
- Post-release acceptance: after the global CLI refresh, the first
  `repo-harness architecture-projection drain --json` correctly resolved from
  the target repository and reported its stale installed `archctx@0.4.2`.
  `bun install --frozen-lockfile` restored the target repository's declared
  `archctx@0.4.3`; the next drain succeeded, applied the pending job, and left
  `pending=0`, `deadLetters=0`, and `sourceJournalPending=0`. This closes PR
  #193's final live acceptance without falling back to the CLI package root.

## Required Release Sequence

- [x] Rebuild from current `main` and classify `v0.15.1..67a0b271` by shipped risk surface.
- [x] Move the version anchors: `package.json`, `assets/skill-version.json`
      (`version` + `templateVersion` + history entry), the five READMEs, and
      `scripts/axr7-consumer-e2e.ts`.
- [x] Record the `0.15.2` section in `docs/CHANGELOG.md`.
- [x] Freeze the candidate and run `bun run check:release`.
- [x] Run `bun run check:type`, the full `bun test`, and the deploy/architecture/task sync checks.
- [x] Record final-subject review and AcceptanceReceipt evidence.
- [x] Merge the candidate to `main` and confirm exact GitHub Actions CI.
- [x] Publish `repo-harness@0.15.2` to npm `latest`.
- [x] Create and push annotated tag `v0.15.2` and stable GitHub Release.
- [x] Run `bash scripts/check-release-published.sh 0.15.2`.
- [x] Install exact Bun-global `repo-harness@0.15.2` and verify version/readiness.
- [x] Run `repo-harness architecture-projection drain --json` from the refreshed
      global CLI against this repo as PR #193's final live acceptance.
- [x] Record closeout evidence and return to clean, synchronized `main`.

## Publish Follow-through

- Exact `main@ed54f6dd` GitHub Actions CI run `31930665509` passed.
- npm publication returned `+ repo-harness@0.15.2`; registry readback returned
  `latest=0.15.2`, tarball
  `https://registry.npmjs.org/repo-harness/-/repo-harness-0.15.2.tgz`, shasum
  `dc052a4f215b93228a838bbe1c3a9c131aad4b88`, and
  `gitHead=ed54f6dd3f84efec93edc7e65ba48666e961104c`.
- Annotated tag `v0.15.2` peels to `ed54f6dd`; the stable, non-draft,
  non-prerelease GitHub Release is
  `https://github.com/Ancienttwo/repo-harness/releases/tag/v0.15.2`.
- `bash scripts/check-release-published.sh 0.15.2` passed registry, dist-tag,
  tarball integrity, tag, runtime receipt, and local-version agreement.
- `bun install -g repo-harness@0.15.2` installed both binaries and
  `repo-harness --version` returned `0.15.2`. Runtime readiness reported
  `fail=0`, `ok=28`, `warn=1`, `na=2`, and `needs_agent=2`; the advisory
  actions are the pre-existing local security review and missing optional
  official Obsidian runtime skills, neither of which is release authority.
- The post-refresh global architecture drain succeeded after synchronizing the
  target repository's ignored dependency installation to its locked
  `archctx@0.4.3`; the queue is empty and no dead letters remain.

## Rollback

- Before npm publication: abandon or revert the release-prep candidate on
  `codex/release-0-15-2`; nothing outside this repository has changed.
- After npm publication: never move or reuse `v0.15.2`; correct forward with a
  later patch. The previous registry version `0.15.1` remains installable
  exactly.
- If the post-refresh global `architecture-projection drain --json` still
  blocks, the resolver fix did not close the window: keep the global CLI pinned
  to the last working version and reopen the archctx resolution work package
  rather than editing `.ai/harness/policy.json#architecture.projection_version`
  to hide the mismatch.
