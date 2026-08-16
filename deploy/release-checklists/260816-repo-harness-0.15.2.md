# repo-harness 0.15.2 Release Filing

- Date: 2026-08-16
- Package: `repo-harness@0.15.2`
- Base release: `v0.15.1`
- Source range: `v0.15.1..67a0b271d008b81f8c095b24f6cceb4f177610e0`
- Release-prep commit: `(pending, this branch's release-prep commit)`
- Final candidate commit: `(pending merge to main)`
- Release scope: publish the archctx 0.4.3 / docs-renderer v3 sync that adopts
  the upstream canonical-body-digest restamp-churn fix, the repo-owned
  `obsidian-memory` dual-host skill-surface facade with runtime-referenced
  official Obsidian skills, the CLI test machine node-runtime authority strip
  for local/CI parity, and the archctx target-repo resolution fix that closes
  the publish-to-global-refresh Stop-block window.
- Publish status: **pending**. No npm publication, tag, GitHub Release, or
  merge has been performed for this version.

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
- Pending-release acceptance: after publication and global runtime refresh,
  `repo-harness architecture-projection drain --json` run from the **global**
  CLI against this repository must pass. That is the final live acceptance of
  PR #193 and cannot be observed before the global CLI carries both the fix and
  archctx 0.4.3.

## Required Release Sequence

- [x] Rebuild from current `main` and classify `v0.15.1..67a0b271` by shipped risk surface.
- [x] Move the version anchors: `package.json`, `assets/skill-version.json`
      (`version` + `templateVersion` + history entry), the five READMEs, and
      `scripts/axr7-consumer-e2e.ts`.
- [x] Record the `0.15.2` section in `docs/CHANGELOG.md`.
- [x] Freeze the candidate and run `bun run check:release`.
- [x] Run `bun run check:type`, the full `bun test`, and the deploy/architecture/task sync checks.
- [ ] Record final-subject review and AcceptanceReceipt evidence.
- [ ] Merge the candidate to `main` and confirm exact GitHub Actions CI.
- [ ] Publish `repo-harness@0.15.2` to npm `latest`.
- [ ] Create and push annotated tag `v0.15.2` and stable GitHub Release.
- [ ] Run `bash scripts/check-release-published.sh 0.15.2`.
- [ ] Install exact Bun-global `repo-harness@0.15.2` and verify version/readiness.
- [ ] Run `repo-harness architecture-projection drain --json` from the refreshed
      global CLI against this repo as PR #193's final live acceptance.
- [ ] Record closeout evidence and return to clean, synchronized `main`.

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
