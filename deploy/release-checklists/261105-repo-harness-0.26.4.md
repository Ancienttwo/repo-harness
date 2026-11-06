# repo-harness 0.26.4 publication record

## Scope and authority

- Release-prep base: `origin/main`
  `cb8f1c945ee84ff7fc0b2ec8e434bc351068dfcc` (#1841). Branch
  `chore/release-0.26.4` starts on this fixed base and merges no later main.
- Source commit: release-prep head
  `c47f7fe4b0b94adc207e78012af1249637c31abc`, PR #1845 (#1842).
  The publish candidate is its merge commit
  `d2da8b460abb77b460e531d909e3f9ec4d6f9035`.
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
- Publish status: published 2026-11-06 (see Publication).
- Hold reason: none.

### Owner decision

Issue #1842 records M87 (2026-11-05 15:32Z): hold 0.26.4 for #1770 slice 2,
#1777 and #1250. The first two merged in #1840 and #1841. The last #1250
change is arch-context#488, outside this package. The coordinator commits
the worker diff, pushes and opens the PR (M65). The owner published npm by
hand. M92 approved the tag and GitHub Release; advisor t11 completed both.
Advisor t11 ran the pre-publish smoke and the owner-approved post-upgrade
probe. This record grants no publication action to the worker.

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

Check the installed version, protocol 3, plugin selection and drift with
`repo-harness install --state`. With a disposable HOME and scratch repository,
probe the installed hook: `PreToolUse --route edit` on an `_ops/` target
exits 2; `Stop --route default` and `SessionStart --route default` exit 0.
Check the matching Operator web bundle, board protocol 2, parent protocol 3,
summary protocol 2 and quota Refresh. Check the strategy selection gate and
the Codex seat refusal without a model run. The owner machine upgrade and
advisor t11's post-upgrade results are in Publication below (#1858).

## Hosted CI

- Coordinator read-back on 2026-11-06: release-prep PR #1845 (#1842)
  `Required / CI` succeeded on prep head
  `c47f7fe4b0b94adc207e78012af1249637c31abc`, run 42139143053.
- Base `cb8f1c945`: scheduled daily run 42135520272 at 2026-11-06 00:15Z
  failed in "Daily full tests and package" (#1843) and "Daily architecture
  freshness" (#1844). Both repair issues are open (see Yellow flags).
- No hosted CI query was made from this offline worker seat. The values
  above come from the coordinator read-back in #1858.

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
- Not run by the release-prep worker: full CI, live model calls, advisor
  merge-commit smoke, installed runtime upgrade or publication.
- Coordinator host `bun run check:release` on `c47f7fe4b` (macOS): PASS,
  including tarball smoke. This does not clear the Ubuntu daily failure.
  Advisor smoke, publication proof, owner machine upgrade and post-upgrade
  proof are recorded below.

### Yellow flags

- #1843 (open): the packed Stop hook smoke in "Daily full tests and package" prints `architecture notice unavailable: review subject is unavailable: target or HEAD could not be resolved` on stderr. [Root cause confirmed](https://github.com/Ancienttwo/repo-harness/issues/1843#issuecomment-6675225968): a smoke fixture defect lets the target repository's `git init` use the host default branch (`master` on Ubuntu), while the policy base is `main`. The published 0.26.4 package is not affected by this fixture defect. A user repository on a branch other than `main` shows the same Stop notice line (#1859).
- #1844 (open): "Daily architecture freshness" fails on the rolling projection backlog for `strategy-reflection`.

## Release readiness items

- Coordinator host release gate and prep-head `Required / CI`: PASS on
  `c47f7fe4b`. The daily failures remain open (see Yellow flags).
- Advisor pre-publish smoke: PASS on `d2da8b460` (see Publication).
- npm publication, approved tag and GitHub Release: complete. The owner
  published npm by hand, not with publication steps 3 and 4.
- Owner machine upgrade and advisor post-upgrade probe: PASS on 0.26.4
  (see Publication). Project upgrade work in 2 of 11 registered repositories
  remains pending and was not run.

## Publication

- Publish candidate: release-prep merge
  `d2da8b460abb77b460e531d909e3f9ec4d6f9035`, PR #1845 (#1842), prep head
  `c47f7fe4b0b94adc207e78012af1249637c31abc`. Publication values come from
  advisor t11's report at 2026-11-06 02:15Z and the coordinator read-back
  in #1858 with `git rev-parse`, `gh release view`,
  `gh api releases/latest` and `npm view`.
- Advisor pre-publish smoke: PASS on `d2da8b460` at 2026-11-06 00:52Z
  (t11 report 00:57Z): package.json 0.26.4 and CHANGELOG `[0.26.4]`;
  0 install-profile sections in the hook bundle; pack list 915 files with
  `dist/hook-entry.js`, `dist/oar-review-host.js` and
  `dist/operator-ui/index.html`; hooks with the recorded install state exit
  2/0/0 (PreToolUse edit, Stop, SessionStart), no catalog error.
  `quota --json`: claude normal, chatgpt normal. `seats argv`: exit 0 for
  orchestrator, advisor and worker. The worker is codex gpt-6.1-sol,
  workspace-write, `sandbox_workspace_write.network_access=false`, with
  web_search disabled. The issue gives no full smoke command or environment.
- npm version: `repo-harness@0.26.4`, published
  2026-11-06T01:58:04.339Z by the owner by hand, not with publication steps
  3 and 4. Dist-tag `latest` = 0.26.4; 915 files; registry metadata has no
  `gitHead`.
- Tarball shasum: `e42f27ff61d90f190bb34eb54c594a815ce9fe5e`, integrity
  `sha512-sji6cDqq76ykXxYgQaR0bXZNsBg0GQJ3QdYn0i1D0bfyhnFDV/jpI3CYFCXu+4AsXiTVzO3Dr1tZUzVzdJZKwg==`.
  Advisor download: sha1 and sha512 match the registry; 789 files are
  byte-identical to `d2da8b460`; the other 126 are `dist/` build output.
  The downloaded hook bundle has 0 install-profile sections.
- Git tag: `v0.26.4`, annotated, tag object
  `988637addfc846e5386fa6b5eccfef00e4eef863`, target
  `d2da8b460abb77b460e531d909e3f9ec4d6f9035`. Advisor pushed it at
  2026-11-06T02:14:04Z after owner approval.
  GitHub Release https://github.com/Ancienttwo/repo-harness/releases/tag/v0.26.4,
  published 2026-11-06T02:14:09Z, notes = CHANGELOG `[0.26.4]`, latest release.
- `bash scripts/check-release-published.sh 0.26.4` from a worktree at
  `d2da8b460`, 2026-11-06 02:14:27Z:
  `runtime-evidence-receipt: valid published_tarball, clean_install, installed_hook_readback`;
  `[release-published] OK: registry, dist-tag, tarball, tag, and local version files agree.`
- Owner machine upgrade and post-upgrade probe: advisor t11's report in
  #1858, 2026-11-06 02:20Z (owner approved).
  - 02:19:05Z: `bun add -g repo-harness@0.26.4 --no-cache` installed global
    0.26.4 (0.26.3 before).
  - `repo-harness update --version 0.26.4`, run from TMPDIR: exit 0;
    candidate runtime reconciled, candidate 0.26.4, scope complete.
    Hook route registry digest (printed as `receipt=`):
    `sha256:e0745637a223ac7644838d82719f767efc251c2864ec8a3caca307817325c7df`,
    unchanged from 0.26.3 because the route table is unchanged.
    Global working rules unchanged; hc 0.1.17 unchanged; 22 leftovers,
    0 removable. Project upgrade work in 2 of 11 registered repositories
    remains pending and was not run.
  - `repo-harness install --state`: protocol 3, selection all, applied
    2026-11-06T02:19:19.650Z, all 7 plugins 0.26.4.
  - Post-upgrade probe: PASS. Installed version 0.26.4; 0 install-profile
    sections in the hook bundle; `dist/oar-review-host.js` and
    `dist/operator-ui/index.html` present. Installed hook exits 2/0/0
    (PreToolUse edit on `_ops`, Stop default, SessionStart default).
    Installed `seats argv worker`: codex workspace-write with
    `sandbox_workspace_write.network_access=false`.
  - Operator console restarted at 02:20Z, pid 92427. `GET /` returned 200;
    `GET /api/v1/quota` returned 200, protocol `repo-harness.quota.v1`.
  - Merge seals made by 0.26.3 do not verify under 0.26.4 (#1829, #1831);
    re-seal any pending merge with the installed helper.
