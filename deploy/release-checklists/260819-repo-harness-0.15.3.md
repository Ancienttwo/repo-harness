# repo-harness 0.15.3 Release Filing

- Date: 2026-08-19
- Package: `repo-harness@0.15.3`
- Base release: `v0.15.2`
- Source range: `v0.15.2..4ff0e64fca4d9f13bc68c2a07710dde8170335dc` (73 commits)
- Release-prep commit: `b25e8f6a56dea773dc438164d30039f7c0ff0c3f` (version anchors,
  changelog, filing, and workflow artifacts on `codex/release-0-15-3`)
- Final candidate commit: `(pending)` — assigned when the candidate merges to
  `main`, which is the orchestrator's follow-on phase
- Release scope: publish the shared coordination plane WP1 lease store behind
  the `sprint claim|bind|release|steal|reconcile|identify|begin-completion`
  verbs with a quiescent fail-closed cutover, the coordination-lease-hardening
  follow-up (three-field owner record, `completing` guard, inline `complete`
  gate, fail-closed rejection of legacy lease shapes, fixed marker write
  order), the archctx 0.4.4 / `archcontext.docs-renderer/v4` projection pin,
  the SubagentStart long-command guardrail advisory (#203), the SessionStart
  cleanable-contract-worktree notice (#201), explicit-opt-in-only CodeGraph
  enablement (#202), the `setup-plugins.sh` shift-overrun fix (#200), the
  `minimal_change` enforce mode, and the worktree base-metadata typed-selector
  convergence.
- Version strategy: this is `0.15.3`, not `0.16.0`. `0.15.3` covers the
  coordination plane WP1, its hardening pass, the archctx 0.4.4 / v4 pin, and
  the surrounding hook/installer fixes across this range. `0.16.0` is reserved
  for the release where the kanban program lands complete, meaning WP2 (board)
  and WP3 (hook) ship together.
- Publish status: **complete**. Registry, tag, GitHub Release, published-package
  readback, selected Bun-global runtime, and the post-refresh architecture
  projection drain acceptance all passed. See Publish Follow-through.

## Authority Boundary

- Release metadata changes no product behavior; the shipped implementation
  range is already merged on `main` at `4ff0e64f`.
- The coordination lease store is one authority. The cutover is quiescent and
  fail-closed: legacy lease shapes are rejected rather than upgraded in place,
  so there is no dual-authority window between the old and new owner record.
- `.ai/harness/policy.json#architecture.projection_version` and the vendored
  archctx dependency are one authority at 0.4.4 with the
  `archcontext.docs-renderer/v4` contract.
- CodeGraph enablement has exactly two true paths: the `full` profile and an
  explicit `tooling.codegraph.enabled: true`. Repository size is no longer an
  authority for enablement.
- npm `latest`, `v0.15.3`, GitHub Release, tarball metadata, local version
  fields, and installed runtime must resolve to one immutable release.
- This candidate preparation did not publish, tag, create a GitHub Release,
  merge to `main`, or touch the global runtime.

## Candidate Evidence

- npm baseline: `npm view repo-harness version` returned `0.15.2`;
  `npm view repo-harness@0.15.3 version` returned E404 (`404 No match found for
  version 0.15.3`) before candidate preparation.
- Gate environment: every gate below ran inside the isolated worktree with
  `REPO_HARNESS_SOURCE_ROOT` unset, so helper resolution stays on this
  worktree's own build instead of the Bun-global install this machine's
  `zshenv` points at. `REPO_HARNESS_NODE_BIN` was left in place because archctx
  requires Node >=24 <26 and this machine's PATH node is v22.22.0.
- `bun run check:release`: exit 0 in 637s, `[release] OK: npm package gate
  passed.` The gate covered state boundaries (159 TypeScript files), hook
  projection (3 files), helper projection (55 helpers), reference-configs
  projection (23 docs), typecheck, the full test suite, workflow checks,
  repository inspection, the package dry-run, and the tarball install smoke.
  Environment-dependent failures: none. The `[hook:*] ... failed`,
  `repo-harness hook: stop failed: ...`, `[SubagentQualityGate] ... block`, and
  `[repo-harness:long-command-guardrail] ...` lines in the log are asserted
  negative-path fixture output from `tests/skill-hooks.test.ts` and the guard
  tests, not gate failures.
- `bun run check:type`: exit 0, `node node_modules/typescript/bin/tsc --noEmit`
  reported no diagnostics.
- `bun test` (full, isolated rerun inside `check:release`): 2628 pass, 1 skip,
  0 fail, 19910 `expect()` calls, 2629 tests across 196 files in 603.46s.
- `bun test` (full, standalone run): exit 0, 2628 pass, 1 skip, 0 fail, 19910
  `expect()` calls, 2629 tests across 196 files in 601.82s. This matches the
  isolated rerun inside `check:release` exactly.
- `bash scripts/check-deploy-sql-order.sh`: exit 0, `[deploy-sql] OK`.
- `bash scripts/check-architecture-sync.sh`: exit 0,
  `mode=strict gate_min_severity=medium changed_capabilities=3 blocking=0` and
  `provider=archctx apply=automatic state=ready pending=0 running=0
  dead_letters=0 human_actions=0 adoption_required=0 blocking=0 uncommitted=0`.
- `bash scripts/check-task-sync.sh`: exit 0,
  `[task-sync] Repo changes include synchronized tasks/ updates.`
- Packed tarball: `repo-harness-0.15.3.tgz` contains 494 files, is 10,041,496
  bytes packed and 15,309,205 bytes unpacked, shasum
  `1f7671f9cd73b38544106678c2f06acdd9d62c4e`.
  `bash scripts/check-tarball-install-smoke.sh repo-harness-0.15.3.tgz`
  returned exit 0 with `[tarball-smoke] OK: repo-harness-0.15.3.tgz installs
  and packaged CLI bins start.`
- Skill eval evidence: **unavailable this cycle**. No `full_test_count`,
  `dry_run_ratio`, `grader_pass_rate`, or `effectiveness_authority` was produced
  for 0.15.3. Per the filing rules in
  `docs/reference-configs/release-deploy.md`, missing eval evidence is recorded
  as unavailable rather than substituted; this candidate's authority rests on
  the full `check:release` gate and the standalone full test run.
- Recovered gate condition: the first `check:release` in this worktree failed
  the strict architecture projection gate (`state=error`, `blocking=1`) and then
  dead-lettered with `archctx returned human-action-required; human actions:
  unresolved-major-change` across eleven capabilities. This was a fresh-worktree
  artifact, not a candidate defect: a new worktree has no drift cursor, so the
  first projection run against an already dirty tree re-anchors and processes
  the entire working tree as one delta. The identical nine-file edit applied to
  a pristine detached worktree whose cursor had been anchored on a clean tree
  returned `changed_capabilities=3 blocking=0`. Recovery was to remove the
  ignored dead-letter job, anchor the cursor on a clean tree, restore the edits,
  and rerun; the recorded run above is the clean one.

## Required Release Sequence

- [x] Rebuild from current `main` and classify `v0.15.2..4ff0e64f` by shipped risk surface.
- [x] Move the version anchors: `package.json`, `assets/skill-version.json`
      (`version` + `templateVersion` + history entry), the five READMEs, and
      `scripts/axr7-consumer-e2e.ts`.
- [x] Record the `0.15.3` section in `docs/CHANGELOG.md`.
- [x] Freeze the candidate and run `bun run check:release`.
- [x] Run `bun run check:type`, the full `bun test`, and the deploy/architecture/task sync checks.
- [x] Record final-subject review and AcceptanceReceipt evidence.
- [x] Merge the candidate to `main` and confirm exact GitHub Actions CI.
- [x] Publish `repo-harness@0.15.3` to npm `latest`.
- [x] Create and push annotated tag `v0.15.3` and stable GitHub Release.
- [x] Run `bash scripts/check-release-published.sh 0.15.3`.
- [x] Install exact Bun-global `repo-harness@0.15.3` and verify version/readiness.
- [x] Record closeout evidence and return to clean, synchronized `main`.

## Publish Follow-through

- AcceptanceReceipt closed on the candidate at `4ae02ff8`: `external_pass`,
  reviewer Claude, Reviewed Subject SHA256
  `sha256:e182826d618c906901a2635a3fc631641996d795f20374be8f9cd8cd3f60f527`,
  Verification Evidence SHA256
  `sha256:4f9d036da2aeaf07c78938c3714b3c86223dc1a5f4b0790b0bdf2a8bc5673326`.
  Three receipt findings recorded (bounded-verifier archctx collision P2; two
  exit-criteria right-sizing amendments P3; missing Change Assessment oracle
  declaration P3), none blocking.
- `main` fast-forwarded `4ff0e64f..4ae02ff8`; exact GitHub Actions CI run
  `32253072855` on `4ae02ff8` passed before publication.
- npm publication required a fresh web login first: the stored token had
  expired wholesale, and `npm publish` surfaces that as `E404 Not Found - PUT`
  with no auth prompt rather than E401 (`npm whoami` confirmed E401).
  `npm login --auth-type=web --browser=false` then a second per-publish web
  authorization completed the flow; publication returned `+ repo-harness@0.15.3`.
- Registry readback: `latest=0.15.3`, tarball
  `https://registry.npmjs.org/repo-harness/-/repo-harness-0.15.3.tgz`, shasum
  `1f7671f9cd73b38544106678c2f06acdd9d62c4e` (byte-identical to the candidate
  evidence), `gitHead=4ae02ff864b906bc9f821c94bbe8d2e80ac88537`.
- Annotated tag `v0.15.3` peels to `4ae02ff8`; the stable, non-draft GitHub
  Release is `https://github.com/Ancienttwo/repo-harness/releases/tag/v0.15.3`.
- `bash scripts/check-release-published.sh 0.15.3` passed registry, dist-tag,
  tarball integrity, tag, runtime receipt
  (`sha256:dc6fef7207eb81966aa141bc9a236e92f0545ef3077a175c540f9b8179c42ead`),
  and local-version agreement.
- `bun install -g repo-harness@0.15.3` (after `bun remove -g` to force lock
  re-resolution) installed both binaries; `repo-harness --version` returned
  `0.15.3`, the global copy carries `archcontext.docs-renderer/v4` and hoists
  `archctx@0.4.4`, closing the v3-runtime downgrade trap this release exists to
  ship.
- Post-refresh `repo-harness architecture-projection drain --json` reported
  `status=idle`, `pending=0`, `deadLetters=0`, `sourceJournalPending=0`.

## Rollback

- Before npm publication: abandon or revert the release-prep candidate on
  `codex/release-0-15-3`; nothing outside this repository has changed.
- After npm publication: never move or reuse `v0.15.3`; correct forward with a
  later patch. The previous registry version `0.15.2` remains installable
  exactly.
- If the coordination lease cutover misbehaves in a consuming repo, the
  fail-closed rejection surfaces as an explicit error rather than silent
  corruption: pin the global CLI back to `0.15.2` and reopen the coordination
  plane work package instead of relaxing the legacy-shape rejection.
