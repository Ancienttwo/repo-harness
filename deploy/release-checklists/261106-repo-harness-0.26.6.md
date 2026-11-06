# repo-harness 0.26.6 publication record

## Scope and authority

- Release-prep base: `origin/main`
  `a5ecf7d3f1a2051a37c6558970726143803ccbba` (#1904). Branch
  `chore/release-0.26.6` starts on this fixed base and merges no later main.
- Source commits: prep head `9d0161d29`, then
  `6ed1b62af9c57a19c348b43179f8311284309f6f`, PR #1907 (#1905).
  Publish candidate: release-prep merge
  `aa71b3b4eb6c35473c7841bd314d220eb78de484`, merged 2026-11-06 14:34:47Z.
- Previous release: 0.26.5, release-prep merge #1870,
  `baf09af121bd0310510e05c3216d572f5791c4d0`, tag `v0.26.5`.
  Its publication and upgrade values are in `261106-repo-harness-0.26.5.md`.
- Merged range: `v0.26.5..a5ecf7d3f1a2051a37c6558970726143803ccbba`.
  All 16 first-parent commits are squash merges, in this order: #1871,
  #1873, #1874, #1875, #1878, #1876, #1879, #1886, #1885, #1895,
  #1901, #1897, #1898, #1902, #1903, #1904. Later merges and #1891
  (S4-1) are outside this release.
- The four version surfaces move from 0.26.5 to 0.26.6: `package.json`,
  `assets/skill-version.json` (version and template version), README
  ("Release & license") and `src/operator-web/fixtures/bots.ts`.
- Other edits: `docs/CHANGELOG.md` and this record. This prep changes no
  product behavior, dependency, lockfile, hook or install logic.
- Release date and record prefix: UTC `2026-11-06`, from `date -u +%F`.
- Publish status: published 2026-11-06 by the owner by hand (see Publication).
- Open gaps: no separate pre-publish smoke ran on the merge commit. The
  isolated explicit-list refusal and its one repair line were not probed.

### Owner decision

Issue #1905 records M97: P7 ships as 0.26.6, under the #1287 plan and
the owner's release-prep go in coordinator t5's session on 2026-11-06.
The Codex worker edits and runs local checks. Coordinator t5 commits the
six paths, pushes, opens the PR and runs the host release gate. This record
grants no tag, npm publish, dist-tag, GitHub Release or machine-upgrade
action to the worker. The owner published by hand on 2026-11-06. The owner
approved the tag, GitHub Release, published-release check and this record
in coordinator t2's session. Issue #1914 supplies t2's evidence from
2026-11-06 14:28Z through 2026-11-07.

## Cause of the release

The release completes the P7 core moves and `peer-runtime` command gate.
It also binds managed hooks to absolute runtime paths, adds Board status
desks and desktop health protocol 2, and pins OAR to 0.91.0.

Each range commit was checked with `git show --stat <sha>` and its
`docs/CHANGELOG.md` diff. The table gives its release classification.
"None" means that PR wrote no CHANGELOG entry; this prep adds one.

| PR | Commit | Section in 0.26.6 | Change | Original CHANGELOG reference |
|---|---|---|---|---|
| #1871 | `01c7b4fa0` | Documentation | Architecture projection for 0.26.5 | None |
| #1873 | `66a8a8772` | Documentation | 0.26.5 publication and upgrade record | None |
| #1874 | `a439853b2` | Fixed | Local-only hc terminal reads | None |
| #1875 | `9bf2fd919` | Changed | Repair recorded `all` with `update` | #1869 |
| #1878 | `f1ca1b9c2` | Changed | One branch resolution and policy writer | #1865 |
| #1876 | `5bc925925` | Changed, Upgrade | Board desks and protocols 3/4/3 | #1867 |
| #1879 | `0169316ab` | Changed | Shared hc status classifier in Operator | None |
| #1886 | `665f180da` | Documentation | Plugin split and desktop research | None |
| #1885 | `84552d3a8` | Fixed | Claude plugin entry names without manifests | None |
| #1895 | `873506bed` | Fixed, Upgrade | Absolute Bun and global hook bundle paths | None |
| #1901 | `c6ca41794` | Changed | Exact OAR 0.91.0 pin and outcome handling | #1899 |
| #1897 | `0272b795d` | Changed | Desktop health protocol 2 | #1890 |
| #1898 | `90d78227e` | Changed | App hook config through core publication | None |
| #1902 | `d80ed49da` | Fixed | Explain unnamed scoped npm plugin refusal | None |
| #1903 | `fe5519c88` | Changed | Keep closeout, Herdr skill and fleet in core | None |
| #1904 | `a5ecf7d3f` | Breaking, Upgrade, Rollback | Gate peer-runtime commands before load | #1889 |

Every range PR appears under its change section in CHANGELOG `[0.26.6]`.
The existing Breaking, Upgrade and Rollback entries remain, with their PR
number added. `[Unreleased]` becomes the dated release section. `[0.26.5]`
and all older sections stay byte-identical to the base.

## Upgrade notes and source checks

These findings come from code at the fixed base `a5ecf7d3f`. They are source
checks, not installed-upgrade or publication results.

### Plugin selection and core ownership

- #1904 (#1889): `src/cli/index.ts` attaches `peer-runtime` guards to
  `review round|status|close|cancel`, `herdr`, `events` and the hidden
  `operator cleanup-investigation-job`. The hidden job also needs the
  existing `operator` selection. Guards run before lazy action and review
  runner imports. A refusal exits 1 with empty stdout,
  `install_plugin_unavailable` and a repair. Help stays available.
- `src/cli/installer/architecture-selection.ts` repairs a recorded `all`
  with `repo-harness update` (#1875). It repairs an explicit list with
  `repo-harness install --plugins <your plugins>,peer-runtime`, retaining
  the selected plugins. `commandPluginRepairLines` in
  `src/cli/installer/install-profile.ts` prints one `[plugins] not selected`
  line for an explicit list that omits command plugins. Its single command
  keeps that list and adds all missing command plugins. Explicit lists do
  not grow by themselves.
- `COMMAND_PLUGINS` in `src/core/skill-surface/plugin-manifest.ts` contains
  `mcp`, `operator` and `peer-runtime`. `pluginUnavailable` returns no
  target restriction for them, and probes skip their owner rows. Thus
  `peer-runtime` is available on every target. Its portal skill remains
  Claude-only. A recorded `all` gains the eligible plugin on update.
- #1903 (#1887): `src/effects/terminal/runtime-closeout.ts` owns worktree
  registration, result checks, notices and closeout. Both
  `scripts/contract-worktree-runtime.ts` and the review runner call it.
  `src/cli/commands/global-runtime.ts` directly installs the core Herdr
  skill and agent fleet. The architecture model assigns the fleet to
  contract assets and closeout to execution primitives. Expected
  user-visible change from this move: none. Core review admission and
  publication, worktree closeout, doctor, hooks, `hc`, the Herdr skill and
  fleet do not acquire the `peer-runtime` gate.

### Managed hook commands and digest

- #1895: `buildHookExecCommand` in
  `src/cli/installer/managed-entries.ts` resolves `process.execPath` and
  the Bun global package's `dist/hook-entry.js` to real absolute paths.
  It checks that Bun is executable and the bundle is readable. Missing
  paths fail closed; no PATH lookup supplies a replacement hook command.
- `repo-harness update` refreshes the selected host adapters through
  `installHostAdapters` in `src/cli/commands/global-runtime.ts`. The Codex
  adapter rewrites managed hooks in `~/.codex/hooks.json`; the Claude
  adapter rewrites managed hooks in its settings and a missing or
  repo-harness-owned status line. Both preserve user-owned sibling hooks;
  a user-owned status line stays intact. Commands keep the opt-in marker
  check, event, route, matcher and timeout. If Bun moves, run update again
  to replace the stored absolute path. Doctor can report the drift.
- The hook route registry did not change from 0.26.5. At both `v0.26.5`
  and `a5ecf7d3f`, `src/cli/hook/route-registry.ts` has Git blob
  `d7d89a1b7e25b890a2fd71b474325260e9033f3a`.
  `routeRegistryDigest` in `src/cli/commands/candidate-reconciliation.ts`
  hashes `JSON.stringify(ROUTES)` with SHA-256. A local computation gives
  `sha256:e0745637a223ac7644838d82719f767efc251c2864ec8a3caca307817325c7df`,
  the same value as the 0.26.5 record. The adapter command projection
  changes; the route registry digest does not.
- Install state and candidate reconciliation stay at protocol 3.

Digest check commands:

```bash
git rev-parse v0.26.5:src/cli/hook/route-registry.ts a5ecf7d3f:src/cli/hook/route-registry.ts
bun -e 'import { ROUTES } from "./src/cli/hook/route-registry.ts"; import { createHash } from "node:crypto"; console.log("sha256:" + createHash("sha256").update(JSON.stringify(ROUTES)).digest("hex"));'
```

### OAR, health and publication

- #1901: `package.json` pins `@botiverse/oar` to exactly `0.91.0`, up from
  `0.88.0` in 0.26.5. The range also updates `bun.lock`. A handled input
  has no turn outcome and cannot complete a review. Codex `unauthorized`
  stops a review as an auth failure. This prep changes no dependency.
- #1897 (#1890): `src/effects/operator/server.ts` sets
  `OPERATOR_SERVER_PROTOCOL` to 2. `/healthz` returns `ok`, `service`,
  `protocol` and `version`, with the version imported from `package.json`.
  Protocol 2 is the desktop integration contract, not the Board protocol.
- #1898 (#1888): `events install` in
  `src/cli/commands/events-actions.ts` calls `publishAppHookConfig` in
  `src/effects/publication/app-hook-config.ts`, using the core
  `AppHookConfig` contract. The publication operation validates HTTPS,
  JSON content, the secret and SSL verification before PATCH
  `/app/hook/config`. The caller keeps the three-step approval and the
  partial-failure text: deliveries get HTTP 401 until `events install`
  succeeds. No deployment, secret or App configuration changes run here.

### Seats, Board and adoption

- #1885 and #1902: `src/effects/board/claude-agent-types.ts` uses the
  manifest name when present; without a manifest, it uses the marketplace
  entry name before `@`. A scoped npm key that starts with `@` supplies no
  name. The error asks for `.claude-plugin/plugin.json` with a name or a
  reinstall from a marketplace. It does not guess a scoped package name.
- #1876: `src/core/board/desk.ts` owns `hcStatusClass` and adds `blocked`,
  `error` and `done` desks. Board, parent-list and summary protocols are
  now 3, 4 and 3. Their decoders reject old protocols. Restart the server
  and reload the web client together; a stored summary stays unavailable
  until a board read writes the new protocol.
- #1879: `src/effects/operator/runtime-status.ts` uses that classifier.
  `done` maps to `done-unseen`; `error`, missing and other status words
  remain `unknown`. It does not infer status from terminal text.
- #1878: `branchKeysFor` in `src/effects/adoption/standard-plan.ts`
  resolves the default branch once for a new policy, then uses it for
  `base_branch`, `review_base` and `merge_back.target`. It reads origin's
  symbolic HEAD, else the current symbolic branch. This is one shared
  resolution, not a promise of one Git process in the second case.
  Existing policies keep their values and missing keys. The two project
  scaffold scripts no longer write policy; `repo-harness init` owns it.
- #1874: `src/effects/terminal/herdr-core.ts` filters remote addresses
  from list, snapshot, missed-event and event reads before payload
  validation. The shared local address rule in
  `src/core/terminal/hc-address.ts` still rejects malformed local rows.
- #1871, #1873 and #1886 change only projection documents, the previous
  release record and research. They add no runtime behavior. Separate
  packages from the research and #1891 are not part of this release.

## Publication steps for the owner

1. The coordinator commits only the six allowed paths, pushes and opens
   the prep PR. Run `bun run check:release` on the prep head on the host.
   Require green `Required / CI` before merge and record both results.
2. Record the merge SHA below. Run the pre-publish smoke on that exact
   merge commit. Check version surfaces, CHANGELOG, package entries and
   isolated hook probes. Record command, result and environment.
3. After explicit owner go, use a clean checkout of that merge commit.
   Check `npm whoami`, run `bash scripts/check-npm-release.sh --prepublish`,
   then `npm pack`. The owner runs
   `npm publish ./repo-harness-0.26.6.tgz --auth-type=web` in a TTY and
   approves the printed authentication link.
4. Read npm 0.26.6 back with `npm view --prefer-online`. Compare shasum
   and integrity with the local tarball and check the `latest` dist-tag.
5. After owner approval, tag `v0.26.6` on the publish candidate, create the
   GitHub Release from CHANGELOG `[0.26.6]`, then run
   `bash scripts/check-release-published.sh 0.26.6`. Record the values below.

## Upgrade steps for users

```bash
bun add -g repo-harness@0.26.6 --no-cache && repo-harness update --version 0.26.6
```

From 0.25.4 or earlier, follow CHANGELOG `[0.26.0]` with 0.26.6 in place
of 0.26.0. Preserve selection `all` when used. Repair an explicit plugin
list only if its omitted commands are needed. Keep the Pi 1.5.0 floor
from 0.26.5. Restart the Operator server and reload its page together.
The prep worker does not change an installed runtime.

### Post-upgrade probe

After the owner-approved upgrade, check the installed version, install
protocol 3, selection and drift with `repo-harness install --state`.
Selection `all` must record `peer-runtime`. In isolated installs, check
the explicit-list refusal and its one repair line. Check managed adapter
commands for absolute Bun and global bundle paths, and the unchanged
route digest. With a disposable HOME and scratch repository, probe the
installed hook: `PreToolUse --route edit` on an `_ops/` target exits 2;
`Stop --route default` and `SessionStart --route default` exit 0. Check
`/healthz` for protocol 2 and version 0.26.6, the matching Operator web
bundle, and Board protocols 3/4/3. Record command, result, revision and
environment below. No installed probe has run in this prep.

## Hosted CI

- `Required / CI` succeeded on `9d0161d29` at 2026-11-06 14:18:25Z and
  on `6ed1b62af` at 2026-11-06 14:28:34Z.
- The worker made no hosted CI query from the offline sandbox. These
  values come from #1914.

## Acceptance environment

- macOS Darwin 25.5.0 arm64, Bun 1.4.3, Node 24.22.1; restricted Codex
  sandbox, no network. Worktree
  `/private/tmp/repo-harness-wt-1905-release-0266`, branch
  `chore/release-0.26.6`, base/HEAD `a5ecf7d3f` plus the prep diff.
- `node_modules` exists; no dependency install is needed.
- `bun run check:type`: exit 0.
- `bun run test:files tests/skill-version.test.ts
  tests/operator-web/operator-bots-page.test.tsx --timeout 60000
  --max-concurrency 1`: exit 0; 24 pass, 0 fail, 299 assertions across
  two isolated files. The runner supplies disposable HOME and temp roots.
  No test assertion changed.
- Inline Python validation: exit 0; exact six-path scope, four version
  surfaces, unchanged dependencies, all 16 range PRs classified, existing
  Breaking/Upgrade/Rollback entries retained, and byte-identical CHANGELOG
  from `[0.26.5]` through the end against the fixed base.
- `git diff --check`: exit 0. Test budget against `a5ecf7d3f` plus the
  working diff: 0 added test lines, 1 added product line (`src scripts`),
  0 new test files. The coordinator records commit-bound counts after
  commit.
- `bun run check:release`: skipped as instructed because it needs npm
  network. The coordinator runs it on the prep head on the host.
- Not run: full CI, prepublish npm gate, live model calls, merge-commit
  smoke, installed runtime upgrade, post-upgrade probe or publication.

## Release readiness items

- Local typecheck, affected tests, scope and historical CHANGELOG checks:
  PASS on `a5ecf7d3f` plus the prep diff.
- Host release gate: PASS on `9d0161d29`. Prep-head `Required / CI`:
  PASS on `9d0161d29` and `6ed1b62af`.
- Pre-publish smoke on the merge commit: not run; open gap. The merge
  tree equals `6ed1b62af`. The host gate on `9d0161d29` and t2 tarball
  checks cover part of the gap (see Publication).
- Prepublish gates: PASS in both clean checkouts of `aa71b3b4e`.
- npm publication, approved tag, GitHub Release and published-release
  check: complete. The owner published npm by hand after two web-auth
  attempts expired without publication.
- Owner machine upgrade: complete. Installed hook and Operator probes
  passed. The isolated explicit-list refusal and its one repair line
  were not probed; this remains an open gap (see Publication).

## Rollback

Before publication, close the prep PR or revert its merge commit. To
restore the previous plugin selection, run `repo-harness install --rollback`;
this keeps the new guards. To restore commands without the gate, reinstall
0.26.5 and run `repo-harness update --version 0.26.5` (#1904). For a downgrade to a CLI
that cannot read the selected plugins, first run `repo-harness uninstall`
with 0.26.6, then install the older CLI and reinstall with it. After
publication, keep the published tag and use a new patch release for a
correction.

## Publication

- Publish candidate: release-prep merge
  `aa71b3b4eb6c35473c7841bd314d220eb78de484`, PR #1907 (#1905), merged
  2026-11-06 14:34:47Z. It has one parent, `a5ecf7d3f`, and tree
  `44b327b6f`, equal to prep head `6ed1b62af`. That head follows
  `9d0161d29` and pins the rollback to 0.26.5: 2 files, 3 insertions and
  3 deletions in this record and CHANGELOG.
- Coordinator t5 host gate on `9d0161d29`, 2026-11-06 about 14:12Z,
  Darwin 25.5.0 arm64, Bun 1.4.3, Node 24.22.1:
  `bun run check:release` exit 0. Tarball smoke passed:
  - `mcp serve` loads 32 MCP modules with selection `all` and 0 with `[]`.
  - `operator serve` loads 85 Operator modules with `all` and serves.
    It refuses with `[]`. Status, seats, quota and hook routes load 0
    Operator modules. The hook bundle has 91 modules and 0 Operator modules.
  - `peer-runtime` loads 4 modules when selected. Refusals, core commands,
    hook routes and the hook bundle load 0 peer-runtime modules.
  - `repo-harness-0.26.6.tgz installs, serves the packaged Operator, and packaged CLI bins start`;
    `[ci] OK`; `[release] OK: npm package gate passed.`
- Pre-publish smoke on the merge commit: not run; open gap. No separate
  smoke command or result exists for `aa71b3b4e`. Tree equality with
  `6ed1b62af`, the host gate on `9d0161d29` and t2's tarball checks below
  cover part of this gap.
- Prepublish gate: `bash scripts/check-npm-release.sh --prepublish`
  exited 0 in both clean checkouts of `aa71b3b4e`: t2 at
  `/tmp/repo-harness-wt-publish-0266` and t5 at
  `/tmp/repo-harness-wt-0266-publish`. In t2's checkout,
  `bun install --frozen-lockfile` ran and `npm whoami` returned `ancienttwo`.
- t2's `npm pack` produced `repo-harness-0.26.6.tgz`: 929 files,
  7.7 MB packed, 18.8 MB unpacked, `package.json` version 0.26.6.
  It contains 126 entries under `dist/hook-entry.js`,
  `dist/oar-review-host.js` and `dist/operator-ui/`.
  Shasum: `a68f1132102b52546a674e0204e21ac630e55966`.
  Integrity:
  `sha512-pbpIGU+NSLcDh35f+2Wxo9kur3dfP4Sj39IqI4Vv3t5wbsO8Lq3412kr2IfTRKQUIHWjIX35KKvqePGi7hS81A==`.
- Two t2 publication attempts at 2026-11-06 14:51Z and 14:57Z ran
  `npm publish ./repo-harness-0.26.6.tgz --ignore-scripts --auth-type=web`.
  Both printed web authentication links. Neither link was approved within
  about 5 minutes. Both runs ended with E404 on `GET /-/v1/done` and
  published nothing.
- The owner then ran `npm publish` by hand in t2's checkout. The npm log
  at 2026-11-06 15:11:27Z records completed web authentication, `PUT 202`
  and "Your package is being processed". npm packed the same checkout
  again and printed the same shasum and integrity as t2's tarball.
- npm registry document read-back at 2026-11-06 15:17:31Z: version 0.26.6,
  publish time `2026-11-06T15:17:06.435Z`, `latest` = 0.26.6. Shasum and
  integrity equal t2's tarball values above.
- Git tag: annotated `v0.26.6`, object `d1fdef6c1`, target `aa71b3b4e`.
  Coordinator t2 created it at 2026-11-06 17:25:57Z after owner approval
  and pushed it. GitHub Release "repo-harness 0.26.6" was published at
  2026-11-06 17:26:03Z, with notes from CHANGELOG `[0.26.6]` at `aa71b3b4e`:
  https://github.com/Ancienttwo/repo-harness/releases/tag/v0.26.6.
- Published-release check:
  `bash scripts/check-release-published.sh 0.26.6` ran in a clean checkout
  of `aa71b3b4e`. It did not run on main: after #1912, the script also
  requires the console package, which 0.26.6 did not publish. Result:
  `runtime-evidence-receipt: valid published_tarball, clean_install, installed_hook_readback`;
  `[release-published] OK: registry, dist-tag, tarball, tag, and local version files agree.`
- Owner machine upgrade: `repo-harness install --state` reports protocol 3,
  core 0.26.6, selection `all`, transaction
  `99179ad0-d024-4dc7-8796-e1b96493edeb`, applied 2026-11-06 15:33:50Z.
  Plugins at 0.26.6: architecture, cross-review, mcp, operator,
  peer-runtime, pi, platform, product and strategy-memory.
  `repo-harness status` reports repo-harness 0.26.6, codex 5/5 and
  claude 6/6 managed entries, and 7 routes.
- Post-upgrade probe by t2, 2026-11-07, macOS 26.5 / Darwin 25.5.0 arm64,
  Bun 1.4.3, Node 24.22.1:
  - All 5 Codex and 6 Claude managed hooks run
    `exec '<bun>' '<global package>/dist/hook-entry.js' <event> --route <route>`.
    They keep the opt-in marker check. The placeholders represent the
    installed absolute Bun and global package paths.
  - Installed hooks ran with non-login PATH `/usr/bin:/bin:/usr/sbin:/sbin`,
    which has no `bun` or `repo-harness-hook`, a disposable HOME and a
    scratch opted-in repository. Codex `Stop --route default`, Claude
    `Stop --route default` and Claude `SessionStart --route default` each
    exited 0. Claude `PreToolUse --route edit` with a Write to `_ops/x.md`
    exited 2 with `[OpsPrivateGuard]`. This is the #1883 reproduction
    shape; before #1895 it exited 127.
  - Installed route digest:
    `sha256:e0745637a223ac7644838d82719f767efc251c2864ec8a3caca307817325c7df`,
    equal to 0.26.5.
  - `repo-harness operator serve --port 4399` with a disposable HOME
    refused with `install_plugin_unavailable` because that HOME had no
    install state. With the real HOME, `/healthz` returned
    `{"ok":true,"service":"repo-harness-operator","protocol":2,"version":"0.26.6"}`.
    `/assets/index-Fcy-xiIk.js` returned 200 and matches the file in the
    installed `dist/operator-ui/assets/`. The server was stopped after
    the probe. Installed source declares Board, parent-list and summary
    protocols 3, 4 and 3.
  - Not run: the isolated explicit-list refusal and its one repair line.
    This remains an open gap.
