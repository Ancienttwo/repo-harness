# repo-harness 0.26.5 publication record

## Scope and authority

- Release-prep base: `origin/main`
  `912034abba49f488e876f2391a6d6c841e948bba` (#1864). Branch
  `chore/release-0.26.5` starts on this fixed base and merges no later main.
- Source commit: release-prep head
  `e8482cce10f9ac6019bc6d2b9f3814fe737b0187`, PR #1870 (#1868).
  Publish candidate: release-prep merge
  `baf09af121bd0310510e05c3216d572f5791c4d0`.
- Previous release: 0.26.4, release-prep merge #1845,
  `d2da8b460abb77b460e531d909e3f9ec4d6f9035`, tag `v0.26.4`.
  Its publication and upgrade values are in `261105-repo-harness-0.26.4.md`.
- Merged range: `v0.26.4..912034abba49f488e876f2391a6d6c841e948bba`.
  All 13 first-parent commits are squash merges, in this order: #1836,
  #1837, #1846, #1851, #1852, #1855, #1860, #1856, #1863, #1862,
  #1838, #1866, #1864. Later merges are outside this release.
- The four version surfaces move from 0.26.4 to 0.26.5: `package.json`,
  `assets/skill-version.json` (version and template version), README
  ("Release & license") and `src/operator-web/fixtures/bots.ts`.
- Other edits: `docs/CHANGELOG.md` and this record. This prep changes no
  product behavior, dependency, lockfile, hook or install logic.
- Release date and record prefix: UTC `2026-11-06`, from `date -u +%F`.
- Publish status: published 2026-11-06 (see Publication).
- Hold reason: none.

### Owner decision

Issue #1868 records M94 (2026-11-06 02:36Z): 0.26.5 uses option b, with
the #1287 step 3 moves and gates, OAR 0.88.0, Pi 1.5.0, the DSH listing,
the #1843 fix, the rolling projection #1838 and the 0.26.4 release record.
M95 sets the Pi 1.5.0 floor. M96 (04:19Z) adds #1859, merged in #1866.
P7 (#1861) moves to 0.26.6. M58 assigns the Codex writer. Under M65 the
coordinator commits the six paths, pushes and opens the PR. The owner
published npm by hand at 05:43Z and approved the tag, GitHub Release,
published-release check and machine upgrade at about 06:00Z. Advisor t11
completed the pre-publish smoke and post-upgrade probe. This record grants
no publication action to the worker.

## Cause of the release

- Complete the #1287 step 3 module moves and the `mcp` and `operator`
  selection gates (#1836, #1837, #1851, #1852, #1856, #1864).
- Reject the retired MCP configuration selector (#1846).
- Update OAR and Pi, list DSH, and enforce the Pi host floor (#1862).
- Fix the smoke fixture default branch (#1843, merged in #1863) and
  derive a new policy's review base from Git (#1859, merged in #1866).
- Refresh architecture documentation and record the previous publication
  (#1855, #1838, #1860).
- Every range PR appears under its change section in CHANGELOG `[0.26.5]`.
  `[Unreleased]` becomes that release section. `[0.26.4]` and all older
  sections must stay byte-identical to the base.

## Upgrade notes and source checks

### Plugin selection

- `src/cli/index.ts` guards `mcp serve` and `mcp doctor` with `mcp`
  before their lazy command bodies load (#1856). An explicit plugin list
  that omits it gets `install_plugin_unavailable` and the repair command
  `repo-harness install --plugins <your plugins>,mcp`. The guard exits 1;
  `mcp serve` writes no stdout or JSON-RPC answer. `mcp --help`,
  `mcp access set` and `bots` stay available.
- The same root guards `operator` (serve, capture,
  cleanup-investigation-job and doc-sessions), `worktrees` and `catch-up`
  with `operator` (#1864). An explicit list that omits it gets
  `install_plugin_unavailable` and
  `repo-harness install --plugins <your plugins>,operator`. The guard
  loads no Operator body and binds no port. Help, `seats`, `quota`, `bots`,
  `mcp access set` and the status line need no Operator plugin.
- `src/cli/installer/architecture-selection.ts` now prefixes every plugin
  guard error with `install_plugin_unavailable: `, including `strategy`
  and the architecture commands (#1856).
- Selection `all` gains both command plugins after `repo-harness update`.
  Before update, an older `all` state does not record the new plugins and
  the guard can print an explicit plugin list. Do not apply that list to
  an `all` state: it changes the selection to an explicit list.
- `commandPluginRepairLines` in `src/cli/installer/install-profile.ts`
  makes update on an explicit list print one `[plugins] not selected`
  line for omitted command plugins. Its one repair command keeps the
  selected plugins and adds the missing `mcp` and `operator` plugins.
  Explicit lists do not grow by themselves (#1864).

### OAR, Pi and runtime discovery

- `package.json` pins `@botiverse/oar` to exactly `0.88.0`. Its optional
  `@earendil-works/pi-coding-agent` peer range is `^1.5.0`. `bun.lock`
  resolves the Pi packages to 1.5.0 (#1862).
- `src/pi/compat.ts` sets `MIN_PI_VERSION` to `1.5.0`. A host below that
  floor is refused with `PI_HOST_UNSUPPORTED_VERSION`. The doctor checks
  the host, and `src/effects/review/generic-review.ts` checks the floor
  before either Pi review launch mode. Install or update Pi before using
  those paths. This prep does not change the dependency versions.
- `src/effects/setup/agent-runtime-probe.ts` lists the DSH (DeepSeek
  Harness) runtime from OAR. It does not add DSH as a review, seat or
  docs-host runtime.
- OAR 0.88.0 uses `agy acp`. Antigravity needs agy CLI 1.5.0 or newer;
  the probe reports an older version as `unsupported`. Antigravity
  sessions from older OAR do not resume. See CHANGELOG and #1862.

### New policy review base

`src/effects/adoption/standard-plan.ts` reads
`refs/remotes/origin/HEAD`, else the current branch, only when standard
`init` creates a policy (#1866). It writes that name as
`worktree_strategy.review_base`. An unborn HEAD supplies its branch name.
If neither ref supplies a name, including a detached HEAD without a remote
HEAD or a non-git target, it refuses with `review_base_unresolved`. The
error names `.ai/harness/policy.json#worktree_strategy.review_base` and
the repair: check out a branch or set the remote HEAD, then run init again.
Use `--mode minimal` for a non-git scaffold. Existing policies keep their
review-base value; a missing key in an existing policy stays missing.
No existing policy migration runs.

### Retired configuration selector

`validSelector` in `src/cli/installer/configuration-ownership.ts` no longer
accepts `mcp_servers.repo_harness` (#1846). Installation refuses receipts
that name it. Remove that retired entry from
`~/.repo-harness/configuration-restore.json` before retrying. This changes
receipt validation, not its format, and supplies no compatibility reader.

### Module moves and public paths

- #1836 moves shared Operator code to terminal, public projections, CI
  and Board owners. Commands, routes and messages keep their behavior.
  One public path changes: the hc pin is now
  `src/core/terminal/herdr-core-pin.json`, and
  `runtime.herdr_core.min_version_source` is
  `package:src/core/terminal/herdr-core-pin.json`. External readers of the
  old `src/core/operator/herdr-core-pin.json` path must change it. The hc
  version remains 0.1.17.
- #1837 moves Operator GitHub writes to shared publication operations.
  Document sessions and cleanup archives use those operations for remote
  branch pushes and draft PR creation. Commands, routes and stored record
  contracts stay the same. No publication action runs in this prep.
- #1851 moves shared CodeGraph readers and the MCP audit path out of MCP
  directories and loads MCP command bodies on use. Commands, tool schemas
  and the audit path stay the same.
- #1852 moves seats, agent settings, launch policy and quota to core Board.
  The status line loads `src/effects/board/quota.ts` instead of the
  Operator path. CLI, web and status line behavior stay the same. Seats
  and quota remain available without an Operator plugin.

### Hook, install and protocol audit

- The hook route registry is byte-identical to `v0.26.4`:
  `src/cli/hook/route-registry.ts` has Git blob
  `d7d89a1b7e25b890a2fd71b474325260e9033f3a` at both revisions.
  `routeRegistryDigest` hashes `JSON.stringify(ROUTES)`. A local read gives
  `sha256:e0745637a223ac7644838d82719f767efc251c2864ec8a3caca307817325c7df`,
  unchanged from 0.26.4.
- The hook entry changes only the status line's quota import and comment
  (#1852). No hook event, route or output contract changes.
- Install state and candidate reconciliation stay at protocol 3. The new
  command plugins have no installed file surface or host probe row. The
  plugin selection and receipt validation changes are described above;
  no new install protocol or migration runs (#1846, #1856, #1864).
- Board protocol 2, parent-list protocol 3 and summary protocol 2 do not
  change in this range. Package smoke fixtures now use `git init -b main`
  instead of the host default branch (#1863). That fixes #1843's fixture
  defect; #1866 supplies the new-policy fix for user repositories.

## Publication steps for the owner

1. The coordinator commits only the six allowed paths, pushes and opens
   the prep PR. Complete both release gates on the host and require green
   `Required / CI` on the prep head before merge.
2. Record the merge SHA below. Advisor t11 runs the pre-publish smoke on
   that exact merge commit. Check the four version surfaces, CHANGELOG,
   package entries and isolated hook probes. Record command, result and
   environment. The worker dry check does not replace this smoke.
3. After explicit owner go, use a clean checkout of that merge commit.
   Check `npm whoami`, run `bash scripts/check-npm-release.sh --prepublish`,
   then `npm pack`. The owner runs
   `npm publish ./repo-harness-0.26.5.tgz --auth-type=web` in a TTY and
   approves the printed authentication link.
4. Read npm 0.26.5 back with `npm view --prefer-online`. Compare shasum
   and integrity with the local tarball and check the `latest` dist-tag.
5. After owner approval, tag `v0.26.5` on the publish candidate, create the
   GitHub Release from CHANGELOG `[0.26.5]`, then run
   `bash scripts/check-release-published.sh 0.26.5`. Record the values below.

## Upgrade steps for users

```bash
bun add -g repo-harness@0.26.5 --no-cache
repo-harness update --version 0.26.5
```

From 0.25.4 or earlier, follow CHANGELOG `[0.26.0]` with 0.26.5 in place
of 0.26.0. Preserve selection `all` when used; repair an explicit plugin
list only if the listed commands are needed. Update Pi to at least 1.5.0
and external hc pin readers to the new path. Restart the Operator server
and reload its page together. This prep changes no installed runtime.

### Post-upgrade probe

Check the installed version, protocol 3, plugin selection and drift with
`repo-harness install --state`. An `all` selection must record `mcp` and
`operator`. With a disposable HOME and scratch repository, probe the
installed hook: `PreToolUse --route edit` on an `_ops/` target exits 2;
`Stop --route default` and `SessionStart --route default` exit 0. Check
the unchanged hook route digest, matching Operator web bundle and board
protocols. Use isolated installs to check plugin refusals and the explicit
list repair line. Check Pi host version and the DSH registry entry without
a model run. In a scratch repository on a branch other than `main`, check
that a new policy uses Git's branch authority as its review base. Record
command, result, revision and environment below. Advisor t11's
post-upgrade probe passed at 2026-11-06 06:05:22Z; the supplied results
are in Publication.

## Hosted CI

- `Required / CI` succeeded on prep head
  `e8482cce10f9ac6019bc6d2b9f3814fe737b0187`.
- Daily run 42164438985 on publish candidate `baf09af12`:
  "Daily full tests and package" succeeded (Ubuntu full suite and tarball
  smoke). "Daily architecture freshness" failed on projection lag after
  #1864 (#1844, no package file effect). Every other daily job succeeded.
- Rolling projection #1871 then merged as `01c7b4fa0`. Daily run
  42171775698 (`workflow_dispatch` on that main commit) completed with
  success: "Daily architecture freshness", "Daily full tests and package",
  "Daily governance" and the MCP path matrix all succeeded. #1844 is closed
  on that run.
- No hosted CI query was made from this offline worker seat. These values
  come from #1872 and the coordinator's dispatch addition.

## Acceptance environment

- macOS Darwin 25.5.0 arm64, Bun 1.4.3, Node 24.18.0; restricted Codex sandbox,
  no network. Worktree `/private/tmp/repo-harness-wt-1868-release-0265`,
  branch `chore/release-0.26.5`, base/HEAD `912034abb` plus the prep diff.
- `node_modules` exists; no dependency install is needed.
- Checks use scratch `HOME=$PWD/node_modules/.cache/rh-1868-home`.
  Both npm gates use `npm_config_offline=true` and separate task-local
  `npm_config_cache` directories. No network request was sent.
- `bun run check:type`: exit 0.
- `bun run test:files tests/skill-version.test.ts
  tests/operator-web/operator-bots-page.test.tsx --timeout 60000
  --max-concurrency 1`: exit 0; 24 pass, 0 fail, 299 assertions across
  two isolated files. No test assertion changed.
- `bun run check:release`: exit 1. Helper projection passed
  (`sha256:5642b0d94b4c2f0d50c75f1c9aa14cc26adbee98f5b6ebc45acb21b8424f1cba`).
  Offline npm lookup returned `ENOTCACHED`, so the gate could not prove
  that 0.26.5 is unpublished. The release lane did not start; its tests
  and package/install smoke remain unverified.
- `bash scripts/check-npm-release.sh --prepublish`: exit 1 at the same
  offline npm lookup, after helper projection passed. The dry check
  contains no publish call.
- Inline Python validation: passed all version surfaces, unchanged
  dependencies, the exact six-path scope, all 13 range PRs in CHANGELOG
  and this record, and the byte-identical CHANGELOG tail from `[0.26.4]`.
- `git diff --check`: exit 0. Test budget against `912034abb` plus the
  working diff: 0 added test lines, 1 added product line (`src scripts`),
  0 new test files. The coordinator records commit-bound counts after
  commit.
- Not run by the release-prep worker: full CI, live model calls, advisor
  merge-commit smoke, installed runtime upgrade or publication.
- Coordinator host gates on prep head `e8482cce1`, 2026-11-06
  04:39:29Z to 04:43:18Z, Darwin 25.5.0 arm64, Bun 1.4.3, Node 24.18.0:
  `bun run check:release` exit 0, including tarball smoke and the `mcp`
  and `operator` load gates;
  `repo-harness-0.26.5.tgz installs, serves the packaged Operator, and packaged CLI bins start`;
  `[ci] OK`; `[release] OK: npm package gate passed`.
  `bash scripts/check-npm-release.sh --prepublish` exit 0.
  Both gates apply to merge `baf09af12`, which has the same tree as the
  prep head. Advisor smoke, publication, upgrade and probe results follow.

### Yellow flags

- #1844: "Daily architecture freshness" failed on `baf09af12` because of projection lag after #1864; no package file effect. Rolling projection #1871 merged as `01c7b4fa0`; Daily run 42171775698 passed, including freshness, full tests and package, governance and the MCP path matrix. #1844 is closed on that run.
- #1869: the plugin guard repair prints an explicit list for an `all` state. The 0.26.5 Upgrade notes warn about it. The owner upgrade ran `update`, so the owner machine is not affected.
- The registered-repo summary timed out at its 30 s budget under load. A rerun of `upgrade --registered --json` took 40 s at load average 29 and reported 11 repositories with statuses `ready` and `skipped`.

## Release readiness items

- Local typecheck, affected tests, scope and historical CHANGELOG checks:
  PASS on `912034abb` plus the prep diff.
- The release-prep worker's gates stopped at offline npm lookup
  (`ENOTCACHED`); both coordinator host gates and prep-head `Required / CI`
  passed on `e8482cce1`. The host gates apply to the identical merge tree.
- Advisor t11 pre-publish smoke: PASS on `baf09af12`.
- npm publication, approved tag, GitHub Release and published-release check:
  complete. The owner published npm by hand, not with publication steps
  3 and 4.
- Owner machine upgrade and advisor t11 post-upgrade probe: PASS on 0.26.5
  (see Publication). Yellow flags records the registered-repo timeout.
- The #1870 body was corrected on 2026-11-06 to point to this record for the advisor smoke, publication, upgrade and probe.

## Rollback

Before publication, close the prep PR or revert its merge commit. An older
CLI refuses an install state that names `mcp` or `operator` with
`install_state_invalid`. For an installed rollback, first run
`repo-harness uninstall` with 0.26.5, then install the older CLI and
reinstall with it (#1856, #1864). Do not downgrade the CLI before uninstall.
After publication, keep the published tag and use a new patch release for
a correction.

## Publication

- Publish candidate: release-prep merge
  `baf09af121bd0310510e05c3216d572f5791c4d0`, PR #1870 (#1868), prep head
  `e8482cce10f9ac6019bc6d2b9f3814fe737b0187`. The merge has one parent,
  `912034abba49f488e876f2391a6d6c841e948bba`, and the same tree as the
  six-file prep head. Values come from advisor t11's reports in #1872,
  2026-11-06 04:48Z to 06:07Z, and the coordinator's dispatch addition.
- Advisor pre-publish smoke: PASS on `baf09af12`, finished
  2026-11-06 04:46:50Z (`rel0265`, this Mac): version 0.26.5 and CHANGELOG
  `[0.26.5]`; 0 install-profile sections in the hook bundle; pack list
  926 files with the hook bundle, OAR review host and Operator UI.
  Hook exits: PreToolUse 2, Stop 0, SessionStart 0; no catalog error.
  With the real 0.26.4 owner state minus `mcp` and `operator`, `mcp serve`
  and `operator serve` each exit 1 with empty stdout and
  `install_plugin_unavailable` for their plugin. The repair commands use
  explicit lists (#1869, as documented). Quota: claude normal, chatgpt
  normal. `seats argv` orchestrator, advisor and worker each exit 0;
  the Codex worker has `network_access=false`. The issue supplies no full
  smoke command.
- npm version: `repo-harness@0.26.5`, published
  2026-11-06T05:43:28.973Z by the owner by hand, not with publication steps
  3 and 4. Advisor t11 read it back at 05:54Z: dist-tag `latest` = 0.26.5;
  926 files; no `gitHead` in registry metadata.
- Tarball shasum: `8e081a45894bcfbac51ae88a0ec38b85c7e7cfee`, integrity
  `sha512-Ja9JjX30AfA2GbkNaYrBx8tRW4x/H4KnV2F+DpoY8BQRc70y6piqfOPi6OgZGNzz6F91JkVIWZp/qSuFWGBWsQ==`.
  Registry tarball: 800 files byte-identical to `baf09af12`, 126 under
  `dist/`, 0 differ.
- Git tag: `v0.26.5`, annotated, tag object
  `61baab46da5913a37fa04e17884e61e47513a0bf`, target
  `baf09af121bd0310510e05c3216d572f5791c4d0`, tagger Ancienttwo,
  2026-11-06T06:01:07Z, message `repo-harness 0.26.5`.
  GitHub Release 436151991:
  https://github.com/Ancienttwo/repo-harness/releases/tag/v0.26.5,
  published 2026-11-06T06:01:12Z, title `repo-harness 0.26.5`, body =
  CHANGELOG `[0.26.5]`, latest release. The owner approved the tag and
  release at about 06:00Z.
- `bash scripts/check-release-published.sh 0.26.5`: advisor t11, temporary
  worktree at `baf09af12`, 2026-11-06 06:03:15Z to 06:04:23Z:
  `runtime-evidence-receipt: valid published_tarball, clean_install, installed_hook_readback`;
  `[release-published] OK: registry, dist-tag, tarball, tag, and local version files agree.`
- Owner machine upgrade and post-upgrade probe (advisor t11, owner approved):
  - 06:04:23Z: `bun add -g repo-harness@0.26.5 --no-cache` installed global
    0.26.5 (0.26.4 before). `repo-harness update --version 0.26.5` exit 0.
    Hook route registry digest (reconcile `receipt=`):
    `sha256:e0745637a223ac7644838d82719f767efc251c2864ec8a3caca307817325c7df`,
    unchanged; 22 leftovers, 0 removable. See Yellow flags for the
    registered-repo summary timeout and rerun.
  - Install state: protocol 3, selection `all`, applied at
    2026-11-06T06:04:43.600Z; 9 plugins at 0.26.5, including `mcp` and
    `operator`.
  - Operator console: pid 92427 stopped; new pid 83742
    (`bun ~/.bun/bin/repo-harness operator serve`); `GET /` returned 200
    at 06:05:16Z.
  - Post-upgrade probe: PASS at 06:05:22Z. Installed version 0.26.5;
    state records `mcp` and `operator`; 0 install-profile sections;
    OAR host and Operator UI present; hook exits 2/0/0; installed worker
    seat has `network_access=false`; `GET /api/v1/quota` returned 200,
    protocol `repo-harness.quota.v1`.
