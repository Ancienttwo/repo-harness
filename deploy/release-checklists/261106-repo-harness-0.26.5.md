# repo-harness 0.26.5 publication record

## Scope and authority

- Release-prep base: `origin/main`
  `912034abba49f488e876f2391a6d6c841e948bba` (#1864). Branch
  `chore/release-0.26.5` starts on this fixed base and merges no later main.
- Source commit: pending coordinator commit and prep PR for #1868.
  Publish candidate: pending release-prep merge commit.
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
- Publish status: pending owner.
- Hold reason: prep-head acceptance, advisor smoke on the merge commit
  and the owner's explicit publish go remain required.

### Owner decision

Issue #1868 records M94 (2026-11-06 02:36Z): 0.26.5 uses option b, with
the #1287 step 3 moves and gates, OAR 0.88.0, Pi 1.5.0, the DSH listing,
the #1843 fix, the rolling projection #1838 and the 0.26.4 release record.
M95 sets the Pi 1.5.0 floor. M96 (04:19Z) adds #1859, merged in #1866.
P7 (#1861) moves to 0.26.6. M58 assigns the Codex writer. Under M65 the
coordinator commits the six paths, pushes and opens the PR. The owner
publishes after an explicit go. Advisor t11 runs the pre-publish smoke on
the release-prep merge commit and the post-upgrade probe. This record
grants no publication action to the worker.

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

Advisor t11 runs and records this probe after the owner-approved upgrade.
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
command, result, revision and environment below.

## Hosted CI

- `Required / CI` on the prep head: pending coordinator read-back.
- The worker made no hosted CI query from the offline sandbox.

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
- Not run: full CI, live model calls, advisor merge-commit smoke,
  installed runtime upgrade or publication.

## Release readiness items

- Local typecheck, affected tests, scope and historical CHANGELOG checks:
  PASS on `912034abb` plus the prep diff.
- Both local release gates: blocked at offline npm lookup (`ENOTCACHED`).
- Host release gates and prep-head `Required / CI`: pending coordinator.
- Advisor t11 pre-publish smoke on the merge commit: pending.
- Owner publish go, npm publication, tag and GitHub Release: pending owner.
- Owner machine upgrade and advisor t11 post-upgrade probe: pending.

## Rollback

Before publication, close the prep PR or revert its merge commit. An older
CLI refuses an install state that names `mcp` or `operator` with
`install_state_invalid`. For an installed rollback, first run
`repo-harness uninstall` with 0.26.5, then install the older CLI and
reinstall with it (#1856, #1864). Do not downgrade the CLI before uninstall.
After publication, keep the published tag and use a new patch release for
a correction.

## Publication

- Publish candidate merge SHA: pending coordinator.
- Advisor t11 pre-publish smoke (command, result, environment): pending.
- Publish status: pending owner.
- npm version and publish time: pending owner.
- Tarball shasum and integrity: pending owner.
- `latest` dist-tag read-back: pending owner.
- Git tag and GitHub Release: pending owner approval and action.
- Published-release check: pending owner.
- Owner machine upgrade: pending owner.
- Advisor t11 post-upgrade probe (command, result, environment): pending.
