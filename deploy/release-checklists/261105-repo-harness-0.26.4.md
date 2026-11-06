# repo-harness 0.26.4 publication record

## Scope and authority

- Release-prep base: `origin/main`
  `cb8f1c945ee84ff7fc0b2ec8e434bc351068dfcc` (#1841). Branch
  `chore/release-0.26.4` starts on this fixed base and merges no later main.
- Source commit: the head of the release-prep PR for #1842. The publish
  candidate is its merge commit; the owner records it below.
- Previous release: 0.26.3, release-prep merge #1797,
  `b6db3da37398f86793ef914046d41e29c8d1fe5e`, tag `v0.26.3`.
  Its publication and upgrade values are in `261104-repo-harness-0.26.3.md`.
- Merged range: `v0.26.3..cb8f1c945ee84ff7fc0b2ec8e434bc351068dfcc`.
  All 26 first-parent commits are squash merges, in this order: #1798,
  #1802, #1799, #1800, #1805, #1803, #1807, #1793, #1810, #1808, #1811,
  #1814, #1815, #1816, #1817, #1822, #1824, #1826, #1823, #1828, #1829,
  #1831, #1778, #1833, #1840, #1841. Later merges, including #1839, are
  outside this release.
- The four version surfaces move from 0.26.3 to 0.26.4: `package.json`,
  `assets/skill-version.json` (version and template version), README
  ("Release & license") and `src/operator-web/fixtures/bots.ts`.
- Other edits: `docs/CHANGELOG.md` and this record. This prep changes no
  product behavior, dependency, lockfile, hook or install logic.
- Release date and record prefix: UTC `2026-11-05`, from `date -u +%F`.
- Publish status: pending owner.
- Hold reason: acceptance on the prep head, advisor smoke on the merge
  commit and the owner's explicit publish go remain required.

### Owner decision

Issue #1842 records M87 (2026-11-05 15:32Z): hold 0.26.4 for #1770 slice 2,
#1777 and #1250. The first two merged in #1840 and #1841. The last #1250
change is arch-context#488, outside this package. The coordinator commits
the worker diff, pushes and opens the PR (M65). The owner publishes after an
explicit go. Advisor t11 runs the pre-publish smoke and post-upgrade probe.
This record grants no publication action to the worker.

## Cause of the release

- Complete the Codex writable-seat network boundary (#1840) and quota
  attention on the Board (#1841).
- Deliver the Office overview, repository room, setup checklist, live
  board values and advisor dialog (#1808, #1814, #1816, #1822, #1824).
- Add stored summaries and board contract values (#1803, #1815, #1817).
- Tighten review network isolation, secret scans and merge seals (#1807,
  #1811, #1823, #1829, #1831).
- Every PR appears under one change section in CHANGELOG `[0.26.4]`.
  `[Unreleased]` becomes the release section. `[0.26.3]` and all older
  sections must stay byte-identical to the base.

## Upgrade notes and source checks

### Plugin selection

`src/cli/index.ts` guards `strategy` with `strategy-memory` before the lazy
body loads (#1833). `src/cli/installer/architecture-selection.ts` throws
`install_plugin_unavailable` when the plugin is absent. The repair command
keeps the recorded plugins and adds `strategy-memory`. An `all` selection
already includes it. The gate also applies to core-only installs. The
installer's architecture policy check now calls the same generic repair
function; its selection semantics do not change.

### Codex seats and review network

- `src/core/operator/seats-settings.ts` checks Codex seats for `edit` plus
  `net`. A stored invalid seat stays readable, but save returns 422 with
  `seat_codex_edit_net`. `src/cli/commands/seats.ts` checks the requested
  seat on `seats argv` and refuses it with that code. Remove `net` in the
  console or in `~/.repo-harness/config.json` before save or launch (#1840).
- The default worker drops `net`. `src/core/operator/seat-launch.ts`
  always emits `sandbox_workspace_write.network_access=false` for writable
  Codex seats. Read-only Codex seats can keep `net`; Claude and Pi seats
  do not change. A Codex worker runs no `gh` or `hc`; the coordinator reads
  its final handoff (#1840).
- Review isolation now denies local IPv4 TCP and all outbound IPv6 TCP for
  every review agent. Pi gets an allow rule only for declared loopback
  model ports; the default Operator port is refused before launch. An
  IPv6-only remote model endpoint cannot work under this policy (#1807).

### Merge seals and private keys

`scripts/merge-gate.ts` imports the private-key definition from
`src/core/security/secret-patterns.ts` (#1829). `helperFingerprint` resolves
that policy relative to the installed helper's real path, then hashes the
helper bytes and policy bytes in fixed order (#1831). Both files must be
outside the candidate repository. In 0.26.3 the fingerprint hashed only the
helper. Its seals therefore fail verification under 0.26.4 as stale. Create
a new seal with the installed helper after upgrade; no migration accepts
the old fingerprint. The seal format stays `sha256:<hex>`.

The shared grammar now covers uppercase hyphenated key names, PGP secret
blocks and ssh.com fences. The armor-comment marker case remains a known
limit of #1829; this prep changes no scanner behavior.

### Board contracts and quota

- `src/core/board/board.ts` uses board protocol 2. The parent list uses
  protocol 3. New values are plan revision, default-branch merge policy
  and seat branch; absent fields fail decoding (#1815).
- `src/core/board/summary.ts` uses summary protocol 2. It adds desk states,
  worker limit, stalled count and current batch. An old stored protocol 1
  snapshot is `snapshot_invalid` in
  `src/effects/operator/board-summary.ts`; the next completed board read
  replaces it. Snapshots live under
  `~/.repo-harness/board/summaries/<repository_id>-<parent>.json`, use mode
  0600 and atomic replace, and keep the newest observation (#1803, #1817).
- Operator CLI reads use the package-local CLI in
  `src/effects/operator/board-read.ts`. Server routes and web readers use
  the core board decoders. Restart the server and reload its page together.
  Custom external JSON readers must upgrade; no old-shape reader is shipped.
- Agents header Refresh also reads quota. The Board list and room show
  tight, exhausted and unknown accounts. A failed read clears the last
  report and shows its reason. Reads run on page open and Refresh, with no
  timer. A running read finishes before another starts. Overview and
  parent-list pages start no quota provider process (#1841).

### Hook, install and write audit

- The release range changes no hook runtime or install-state decoder.
  Install state and candidate reconciliation remain protocol 3. The hc
  pin stays 0.1.17. No new install migration is needed.
- The install selection guard and repair helper change as described above
  (#1833). Existing update effects can still install or update hc and add
  a missing managed Claude status line.
- The new boss-command POST uses the existing write channel, write audit
  and `advisor_seat:<repository_id>` lock. Its audit operation is
  `advisor_boss_<id>`; cooldowns are 1800 s for `rage` and `mine`, 3600 s
  for `carrot` and `valve`. A running or unknown advisor turn refuses the
  send. Unknown delivery still needs reconciliation (#1799).

## Publication steps for the owner

1. The coordinator commits only the six allowed paths, pushes and opens
   the prep PR. Complete local acceptance on the host and require green
   `Required / CI` on the prep head before merge.
2. Record the merge SHA below. Advisor t11 runs the pre-publish smoke on
   that exact merge commit. Check all four version surfaces, the CHANGELOG,
   package entries and isolated hook probes. Record command, result and
   environment. A worker dry check is not the advisor smoke.
3. After explicit owner go, use a clean checkout of that merge commit.
   Check `npm whoami`, run `bash scripts/check-npm-release.sh --prepublish`,
   then `npm pack`. The owner runs
   `npm publish ./repo-harness-0.26.4.tgz --auth-type=web` in a TTY and
   approves the printed authentication link.
4. Read npm 0.26.4 back with `npm view --prefer-online`. Compare shasum
   and integrity with the local tarball and check the `latest` dist-tag.
5. Tag `v0.26.4` on the publish candidate, create the GitHub Release from
   CHANGELOG `[0.26.4]`, then run
   `bash scripts/check-release-published.sh 0.26.4`. Record the values below.

## Upgrade steps for users

```bash
bun add -g repo-harness@0.26.4 --no-cache
repo-harness update --version 0.26.4
```

From 0.25.4 or earlier, follow CHANGELOG `[0.26.0]` with 0.26.4 in place
of 0.26.0. Restart the Operator server, reload its page, fix invalid Codex
seats, upgrade custom board readers and create new merge seals. No installed
runtime is changed by this release-prep task.

### Post-upgrade probe

Advisor t11 records the owner machine upgrade after publication. Check the
installed version, protocol 3, plugin selection and drift with
`repo-harness install --state`. With a disposable HOME and scratch repository,
probe the installed hook: `PreToolUse --route edit` on an `_ops/` target
exits 2; `Stop --route default` and `SessionStart --route default` exit 0.
Check the matching Operator web bundle, board protocol 2, parent protocol 3,
summary protocol 2 and quota Refresh. Check the strategy selection gate and
the Codex seat refusal without a model run. Record commands and results.

## Hosted CI

- No hosted CI query was made from the offline worker seat.
- Prep-head `Required / CI`: pending coordinator read-back.

## Acceptance environment

- macOS Darwin 25.5.0 arm64, Bun 1.4.3, Node 24.18.0; restricted Codex
  sandbox, no network. Worktree `/tmp/repo-harness-wt-1842-release-0264`,
  branch `chore/release-0.26.4`, base/HEAD `cb8f1c945` plus the prep diff.
- `node_modules` exists; no dependency install is needed.
- Checks used scratch `HOME=$PWD/node_modules/.cache/rh-1842-home`.
  Both npm gates also used `npm_config_offline=true` and a task-local
  `npm_config_cache` to honor the worker's network restriction.
- `bun run check:type`: exit 0.
- `bun run test:files tests/operator-web/operator-bots-page.test.tsx
  --timeout 60000 --max-concurrency 1`: exit 0; 14 pass, 0 fail,
  133 assertions. No test assertion changed.
- `bun run check:release`: exit 1. Helper projection check passed. The
  npm lookup returned `ENOTCACHED` in offline mode, so the gate could not
  prove that 0.26.4 is unpublished. The release lane did not start; its
  expensive tests and package/install smoke remain unverified.
- `bash scripts/check-npm-release.sh --prepublish`: exit 1 at the same
  offline npm lookup, after the helper projection check passed. This dry
  check contains no publish call. No network request was sent.
- CHANGELOG tail comparison against `cb8f1c945`: byte-identical from
  `[0.26.3]` onward. Each of the 26 range PRs has one change-section entry.
  Version surfaces and the six-path scope pass an inline Python check.
- `git diff --check`: exit 0. Test budget against base plus working diff:
  0 added test lines, 1 added product line (`src scripts`), 0 new test
  files. The coordinator records commit-bound counts after commit.
- Not run: full CI, live model calls, advisor merge-commit smoke,
  installed runtime upgrade or publication. The coordinator must run both
  release gates on the host with registry access before acceptance.

## Release readiness items

- Local acceptance and prep-head CI must pass. The offline worker cannot
  prove npm version availability; the coordinator completes that host gate.
- Advisor pre-publish smoke on the merge commit: pending advisor t11.
- Owner publish go and publication: pending owner.
- Post-upgrade probe: pending advisor t11 after publication and upgrade.

## Publication

- Publish status: pending owner.
- Publish candidate merge SHA: pending owner.
- Advisor pre-publish smoke command, result and environment: pending t11.
- npm version and publication time: pending owner.
- Dist-tag, tarball shasum and integrity read-back: pending owner.
- Git tag object and target: pending owner.
- GitHub Release URL: pending owner.
- `check-release-published.sh 0.26.4`: pending owner.
- Owner machine upgrade and advisor post-upgrade probe: pending t11.
