# repo-harness 0.26.0 publication record

## Scope and authority

- Release-prep base: `origin/main`
  `65e9d318a` (#1671, the Architecture plugin, #1287 step 3). The
  coordinator holds every other merge to main until the release-prep PR
  merges. The release-prep branch `release/0.26.0` starts on this base and
  merges no later main.
- Source commit: the head of the release-prep PR #1676. The publish candidate
  is the merge commit of that PR on `origin/main`. The owner records it below
  before publish.
- Previous release: 0.25.4, from the release-prep merge
  `7a85940dd768459086d2cbbab84f0eb7863fccd3` (#1646). The owner published it
  to npm on 2026-11-03 (record `261104-repo-harness-0.25.4.md`, publication
  values from #1649).
  - Tag `v0.25.4`: annotated. Tag object:
    `6e144f5e1a9da0b786bed369f42e551c11f4c5f2`. Target:
    `7a85940dd768459086d2cbbab84f0eb7863fccd3`.
- Merged range: `7a85940dd..65e9d318a`: 13 first-parent commits and
  13 commits in total (`git rev-list --count`). Every PR in the range is a
  squash merge.
- The release-prep PR also carries #1607 (owner decision M41): it deletes the
  install-state protocol 2 → 3 one-shot.
- The npm package goes from 0.25.4 to 0.26.0. `package.json`,
  `assets/skill-version.json` (version and template version), README and the
  operator bot fixture show 0.26.0.
- `archctx` and `archctx-contracts` stay at the locked exact 0.11.2. The range
  removes the `@deepseek-ai/cordis` peer dependency and the `dsh` package key
  (#1657). The release-prep PR changes no dependency version.
- Publish status: pending owner publish.
- Hold reason: none.

### Owner decision

M41 (#1607, #1651): 0.26.0 ships with #1287 step 3, the Architecture plugin
(#1667, #1671). #1607 rides this release-prep PR. #1650 (#1652) ships in
0.26.0; there was no 0.25.5. #1663, #1670 and #1673 are open and are not in
this release. The owner runs the publish; the agent does not tag, publish or
create a GitHub release.

## Cause of the release

- Architecture plugin (#1287 step 3): core reaches the archctx code only
  through typed ports (#1667); archctx and CodeGraph load only for a selected
  `architecture` plugin, and a repository policy with
  `context.capability_source: archcontext` or `tooling.codegraph.enabled:
  true` needs the plugin (#1671). Known gap until #1670: `operator serve`
  still starts archctx with the plugin not selected.
- Install: the DSH plugin and the `dsh` plugin id are removed (#1657);
  install-state protocol 2 is retired, with 0.25.4 as the bridge (#1676,
  #1607).
- Fixes: `repo-harness migrate` outside a repository (#1652); the Herdr skill
  stale owner marker (#1661, #1669); the operator architecture map layout
  (#1665); ship-claim recovery generation (#1645).
- Operator: the Board page picks from the open parent issues (#1666); one
  Agents page, Settings removed (#1664).
- CI: `Required / CI` needs the ADR-0002 rule 5 plugin-internals constraint
  (#1647).
- Documentation: archimap refresh at `f77f3d04` (#1644); 0.25.4 publication
  values (#1649).
- The full list is in `docs/CHANGELOG.md`, section `[0.26.0]`. The
  `[Unreleased]` entries now name the PRs: #1653 → #1657, #1656 → #1671,
  #1659 → #1666, #1658 → #1664, #1655 → #1667. `[0.25.4]` and all older
  sections are byte-identical to `65e9d318a`.

## Publication steps for the owner

1. Merge the release-prep PR only after green `Required / CI` on its head.
2. From the merge commit: `npm publish`. The `prepublishOnly` gate
   (`bash scripts/check-npm-release.sh --prepublish`) runs first.
3. npm read-back: wait at least 4 minutes after the upload before the first
   read-back. The 0.25.4 read-back took about 4 minutes (upload
   2026-11-03T17:57:49Z, `npm view` at 18:01:58Z); a 3-minute wait is too
   short. Then:

   ```bash
   npm view repo-harness@0.26.0 version
   ```

   It prints `0.26.0`. Until it does, `bun add -g repo-harness@0.26.0` and
   `bun run check:release-published` cannot resolve the version.
4. Record the publication values below, then run
   `bun run check:release-published`.

## Upgrade steps for users

The owner's machine starts from the 0.25.4 CLI with an install state of
protocol 3, selection `"all"` and 7 plugins (`architecture`, `cross-review`,
`peer-runtime`, `pi`, `platform`, `product`, `strategy-memory`), all at
0.25.4, no `dsh`.

1. Install the new CLI directly, then update:

   ```bash
   bun add -g repo-harness@0.26.0 --no-cache
   repo-harness update --version 0.26.0
   ```

   A 0.25.4 state is protocol 3, so `update` reads it with no migration.
2. The Architecture selection after the update. `architecture` is not a new
   id: the 0.25.4 plugin ids already hold it, and the owner's state records
   it. For the selection `"all"`, `update` resolves the set again from the
   0.26.0 plugin ids (`resolveRecordedSelection`,
   `src/cli/installer/install-profile.ts:1394`, loop at `:1408`). The ids are
   `architecture`, `cross-review`, `peer-runtime`, `pi`, `platform`,
   `product`, `strategy-memory` (`src/core/skill-surface/plugin-manifest.ts:9`).
   Only `pi` needs a host program (`plugin-manifest.ts:36`), so
   `architecture` stays in the recorded list on `--target both`. The recorded
   list stays at 7: 0.26.0 adds no id and removes only `dsh`, which the
   owner's state does not record.

   Check:

   ```bash
   repo-harness install --state | jq -e '.protocol == 3 and .selection == "all" and ([.plugins[].id] | index("architecture") != null)'
   ```

   It prints `true` and exits 0. No repair is needed then. If it prints
   `false` while `selection` is `"all"`, run `repo-harness install` (a bare
   install keeps `"all"`; `--target` defaults to `both`,
   `src/cli/index.ts:719`), then repeat the check. The repair line that
   `status` and `doctor` print for an unselected plugin is
   `repo-harness install --plugins architecture,<plugins>`
   (`architectureRepair`, `install-profile.ts:1444`). It records an explicit
   list, so use it only for a state that already has an explicit list.
3. A state that names `dsh` (in its plugins, an explicit `selection` or its
   `previous` state) fails with `install_state_invalid`:
   `install state names unknown plugin "dsh"; expected one of architecture,
   cross-review, peer-runtime, pi, platform, product, strategy-memory:
   ~/.repo-harness/install-state.json` (`install-profile.ts:1128`). A ledger
   entry with owner `dsh` fails with `install_state_invalid_ownership`.
   Repair:

   ```bash
   rm ~/.repo-harness/install-state.json
   repo-harness install                    # a former "all" selection
   repo-harness install --plugins <ids>    # a former explicit list, without dsh
   ```

   The owner's state does not record `dsh`.
4. From 0.11.1 to 0.25.3 (protocol 2): 0.26.0 refuses the state with
   `install_state_protocol_retired` (`install-profile.ts:1164`). Use the
   0.25.4 bridge first:

   ```bash
   bun add -g repo-harness@0.25.4 --no-cache
   repo-harness update --version 0.25.4
   bun add -g repo-harness@0.26.0 --no-cache
   repo-harness update --version 0.26.0
   ```

   A protocol 1 state (before 0.11.1) runs the 0.25.3 step first:
   `bun add -g repo-harness@0.25.3 --no-cache`, then its protocol 1
   migration (`repo-harness install --help` in 0.25.3 names it), then the
   bridge above.
5. The M41 workaround ends: after the update, `repo-harness migrate --apply`
   outside a repository fails with `repo-harness migrate: cwd is not in a git
   repository: <cwd>` before any write (#1652).
6. Rollback after publish: `bun add -g repo-harness@0.25.4 --no-cache`, then
   `repo-harness install --state`. When it prints the state, run
   `repo-harness update --version 0.25.4`. When it fails, delete
   `~/.repo-harness/install-state.json` and run `repo-harness install`. A
   source `git revert` does not restore a ledger. Do not delete the tag.

### Post-update check

Run after step 1. Each command and flag is in the source at `65e9d318a`;
the line numbers here and in the steps above are at the PR head:

| Command or flag | Source |
|---|---|
| `install --state` (JSON of `installStateStatus`: `protocol`, `selection`, `plugins[].id`, `drift.status`; exit 1 with no state) | `src/cli/index.ts:723`, `:750`; `install-profile.ts:1323` |
| `update --version <version>` | `src/cli/index.ts:874` |
| `status` (`selection:` and `plugins:` lines; `Architecture projection:` section in an opted-in repository) | `src/cli/commands/status.ts:269-270`, `:286-297` |
| `doctor --json` (selected: `codegraph-readiness`, `codex-codegraph-mcp`, `claude-codegraph-mcp`, `codegraph-index`; not selected: `codegraph` `na` and `architecture-projection` `na`) | `src/cli/tools/codegraph.ts:862-868`; `src/cli/commands/doctor.ts:580-600` |
| `setup check --target both --check-updates --json` | `src/cli/commands/init-hook.ts:944-948` |

```bash
# Protocol 3, selection "all", the 7 plugins with architecture, no drift.
repo-harness install --state | jq -r '"protocol=\(.protocol) selection=\(.selection) plugins=\([.plugins[].id] | join(",")) drift=\(.drift.status)"'
# expect: protocol=3 selection=all plugins=architecture,cross-review,peer-runtime,pi,platform,product,strategy-memory drift=consistent

# Status: the selection, and in an opted-in repository the architecture rows
# (model authority, provider, code facts), not "plugin: not selected".
cd ~/Projects/repo-harness && repo-harness status

# Doctor: the four CodeGraph rows of a selected plugin; no "not selected" row.
repo-harness doctor --json | jq -r '.checks[] | select(.id | test("codegraph|architecture")) | "\(.id) \(.status)"'

# Setup check: no install-state.repair action.
repo-harness setup check --target both --check-updates --json | jq -r '[.agent_actions[].id] | index("install-state.repair") == null'
# expect: true
```

## Hosted CI

- Push CI on main: every run from `ad4c9f036` (#1644, the first PR after
  0.25.4) to `65e9d318a` passed. The run on the base is 41744336212
  (`65e9d318a`, success).
- Daily run: the last scheduled run is 41743276040 on `11deb10ed`
  (2026-11-03T23:58Z): failure in "Daily architecture freshness",
  `human-action-required`, `unresolved-major-change` (yellow flag 1).
- The release-prep PR needs green `Required / CI` on its head before merge.

## Acceptance environment

- macOS 26.5 arm64, Bun 1.4.3, Node 24.18.0.
- `bun install --frozen-lockfile` (518 packages) in the release worktree on
  `release/0.26.0`.
- Guard: `hc`, `herdr-app` and `herdr` shims that log the call and exit 97
  are first on PATH for every test, release and readiness run. PATH holds
  only explicit directories (guard, `node_modules/.bin`, a directory with
  links to `bun`, `node`, `npm` and `npx` only, `/opt/homebrew/bin`,
  `/usr/bin`, `/bin`, `/usr/sbin`, `/sbin`), not `~/.local/bin` and not
  `~/.bun/bin`. `HC_*`, `HERDR_ENV`, `CLAUDECODE`, `CLAUDE_CODE_*` and
  `REPO_HARNESS_SOURCE_ROOT` are removed. No run called the owner's `hc`.
- Subject: commit `e8333484d` (base `65e9d318a` plus #1607, the version
  and the changelog edits). The filing commit changes only this file.
- `bun run check:release`: exit 0 in 97 s. `[helpers] projection OK`;
  expensive release lane `tests/harness-benchmark-matrix.test.ts` 31 pass,
  0 fail; `[tarball-smoke] OK: repo-harness-0.26.0.tgz installs, serves the
  packaged Operator, and packaged CLI bins start.`; `[release] OK: npm
  package gate passed.` Guard calls: 1 (`hc server status --json`).
- Prepublish gate, read-only: `bash scripts/check-npm-release.sh
  --prepublish`: exit 0, `[release] OK: prepublish fast gate passed`. It runs
  `check:helpers` and an `npm view` lookup that proves 0.26.0 is
  unpublished; it does not publish.
- `bun run check:type`: exit 0.
- #1607 tests: `bun run test:files tests/install-profiles.test.ts
  tests/cli/init-hook.test.ts tests/cli/status.test.ts --timeout 60000
  --max-concurrency 1`: 70, 28 and 20 pass, 0 fail. Guard calls: 0.
- Version-surface tests: `bun run test:files tests/skill-version.test.ts
  tests/installed-copy-sync.test.ts
  tests/operator-web/operator-architecture.test.tsx
  tests/operator-web/operator-bots-page.test.tsx --timeout 60000
  --max-concurrency 1`: 10, 30, 34 and 14 pass, 0 fail. Guard calls: 0.
- `grep -rln "0\.25\.4" tests` finds the three #1607 test files (the
  0.25.4 bridge command) and the board fixture title "Post-0.25.4 wave". No
  test pins the old package version.
- Consumer architecture smoke (review round 1, gk1676-r1-01), at the
  round 2 head: `bun run test:files tests/hook-runtime.test.ts -t "#850"
  --timeout 60000 --max-concurrency 1`: 2 pass, 0 fail. Guard calls: 0. No
  archctx daemon started.
- `bash scripts/check-ci.sh architecture` (the render freshness lane) did
  not run locally. The scheduled "Daily architecture freshness" job runs it;
  its last run fails with `unresolved-major-change` (yellow flag 1), the
  same result the 0.25.4 record shows. The PR job `PR architecture
  constraint and freshness` runs `check-ci.sh architecture-advisory` on
  each head and is part of `Required / CI` since #1647; it passed on
  `0d02366d5` (run 41747686174).

## Readiness check

- Candidate: the release worktree at `e8333484d`, with the guard first on
  PATH.
- Selection probe, real HOME, read-only: the 0.26.0 `readInstallState`
  parses the owner's state (protocol 3, `"all"`, 7 plugins, 58 ledger
  entries). `resolveRecordedSelection(state, 'both')` gives `run` and
  `record` equal to the 7 ids, with `skipped`, `kept` and `notAdded` empty,
  also for a partial refresh. `architectureSelected(readRecordedSelection())`
  is `true`. The state file SHA-256 is the same before and after.
- `dsh` probe, temporary HOME: a protocol 3 state with `dsh` under `"all"`,
  in an explicit list or in `previous` gives `install_state_invalid`
  (`names unknown plugin "dsh"`); a ledger owner `dsh` gives
  `install_state_invalid_ownership`.
- Real HOME, read-only by contract, `TMPDIR=/tmp`:
  - `bun src/cli/index.ts doctor --json` in the worktree: the four CodeGraph
    rows of a selected plugin (`codegraph-readiness` warn,
    `codex-codegraph-mcp` ok, `claude-codegraph-mcp` ok, `codegraph-index`
    fail: this worktree has no index). No `codegraph` `na` row and no
    `architecture-projection` row. No archctx process started.
  - `bun src/cli/index.ts status`: `selection: all`, the 7 plugins, and
    `Architecture projection:` with `model authority: archcontext (ready)`,
    `provider: archctx (ready)`, `code facts: index-missing`.
  - `bun src/cli/index.ts setup check --target both --check-updates --json`:
    exit 1, `status: blocked`; 32 ok, 3 warn, 1 fail, 3 na, 5 needs_agent.
    The fail is `doctor.codegraph-index` (no index in this worktree). No
    `install-state.repair` action: the 0.26.0 reader accepts the owner's
    state.
  - `bash scripts/check-agent-tooling.sh --json --host both
    --check-updates`: exit 0.
  - `bun src/cli/index.ts security scan --json`: exit 0, `status: warn`,
    2 findings: `unmanaged-hook-command` in `~/.claude/settings.json` and in
    `~/.codex/hooks.json`.
  - `bun src/cli/index.ts upgrade --json` (no `--apply`): exit 1, 41 items:
    23 `refresh` of current-package skills (the installed 0.25.4 copies
    against the 0.26.0 source) and 18 `report` (15 legacy state artifacts,
    2 retired skills, 1 dangling skill link). Nothing was applied.
  - Guard calls: 4 (`hc --version` 3 times, `hc ls --json --label
    repo-harness.service=attention --all` once).
- Temporary HOME: `bun src/cli/index.ts run check-deploy-sql-order`:
  exit 0, `[deploy-sql] OK`.
- `git check-ignore -v _ops/`: `.gitignore:46:_ops/`. `git ls-files _ops`:
  0 tracked files.

### Yellow flags

The owner accepts or repairs each flag before publish.

1. Architecture projection render pending at the base (Daily run
   41743276040, `unresolved-major-change`). Push CI on `65e9d318a` passed.
   Repair: the rolling writer render and the archimap refresh, in the next
   release window.
2. Known gap until #1670: `repo-harness operator serve` starts archctx with
   the `architecture` plugin not selected. The owner's selection includes
   the plugin, so the owner's console does not hit it.
3. The upgrade from 0.25.4 is the first real run of the 0.26.0 selection
   gate on an installed host. Run the post-update check.
4. `runtime.herdr_core` and `tooling.herdr_skill` are `needs_agent`, and
   `doctor.board-attention-watcher` is `warn hc_unavailable`. The guard `hc`
   answers every call with exit 97, so these rows do not describe the
   owner's `hc`. Repair: run `setup check` with the real `hc` after
   `repo-harness update`.
5. `repo-harness` and `repo-harness-hook` are not on PATH
   (`doctor.cli-on-path`); the guard PATH leaves out the global install by
   design. Security config: 2 warn findings `unmanaged-hook-command`. Skills
   CLI missing (`runtime.skills_cli`, optional). Repair: none for the
   release.

## Release readiness items

- Skill eval evidence: unavailable for 0.26.0. The only report,
  `evals/benchmark.md`, is from 2026-06-14 (0.5.1). 0.26.0 makes no
  skill-effectiveness claim.
- Known open follow-ups, not in 0.26.0: #1663, #1670, #1673.

## Publication

- Publish candidate: `4366cd90354bdf45a2cd3333f5813aec101591fa` (the #1676
  merge commit). Before the pack, its tree equaled the #1676 head tree
  `cf6fae9f`. The publish did not use main HEAD, so #1675 and #1677 are not
  in the tarball. The prepublish gate
  (`bash scripts/check-npm-release.sh --prepublish`) passed in both runs.
  Run 1 started at 2026-11-04T01:00:23Z and did not publish: the npm web
  authentication window (about 5 minutes) expired, with E404 on
  `/-/v1/done` at 01:05:29Z. In run 2 the owner approved the web
  authentication at about 04:11Z.
- npm version: `repo-harness@0.26.0`, dist-tag `latest`. Upload accepted at
  2026-11-04T04:11:04Z.
- Git tag: annotated `v0.26.0`, tag object
  `1b93e61c5f21ef83bdb8129da15ab0878c7598f3`, on `4366cd903`; GitHub Release
  https://github.com/Ancienttwo/repo-harness/releases/tag/v0.26.0, published
  2026-11-04T04:15:26Z, notes from the `[0.26.0]` CHANGELOG section at
  `4366cd903`.
- Published tarball digest: shasum `8343ac67950edddf691478ddda06246787b8817c`,
  integrity `sha512-XONEY+0LkgCmFs3514Sf3k5OCBYPtCbWiKEK3rn8A0icBpAifJb40ntgyrdrUGfGHdDECdhQd4euWR+fTuLgsg==`,
  858 files.
- `bun run check:release-published`: `bash scripts/check-release-published.sh
  0.26.0` at 04:15Z: `[release-published] OK: registry, dist-tag, tarball,
  tag, and local version files agree.`
- Owner machine upgrade: pending owner. The machine is still on 0.25.4.

- Yellow flag for the next release: the npm web authentication link expires
  in about 5 minutes. The owner must be at the machine when the publish
  starts.
