# repo-harness 0.26.1 publication record

## Scope and authority

- Release-prep base: `origin/main`
  `ee9b6d632df4a1f71fa8c8fdd954f63c0701f538` (#1683, the #1680 hook fix).
  The release-prep branch `release/0.26.1` starts on this base and merges no
  later main.
- Source commit: the head of the release-prep PR #1693. The publish
  candidate is the merge commit of that PR on `origin/main`. The owner
  records it below before publish.
- Previous release: 0.26.0, from the release-prep merge
  `4366cd90354bdf45a2cd3333f5813aec101591fa` (#1676). The owner published it
  to npm on 2026-11-04 (record `261104-repo-harness-0.26.0.md`, publication
  values from #1679).
  - Tag `v0.26.0`: annotated. Tag object:
    `1b93e61c5f21ef83bdb8129da15ab0878c7598f3`. Target:
    `4366cd90354bdf45a2cd3333f5813aec101591fa`.
- Merged range: `4366cd903..ee9b6d632`: 5 first-parent commits and 5
  commits in total (`git rev-list --count`). Every PR in the range is a
  squash merge: #1675, #1677, #1679, #1682, #1683.
- The npm package goes from 0.26.0 to 0.26.1. `package.json`,
  `assets/skill-version.json` (version and template version), README and the
  operator bot fixture show 0.26.1. These are the four version surfaces that
  #1676 changed.
- The release-prep PR changes no product code and no dependency version.
  `archctx` and `archctx-contracts` stay at the locked exact 0.11.2.
- Publish status: pending owner.
- Hold reason: none.

### Owner decision

M53 (#1690, relayed by advisor t11): fix #1680 fast and ship 0.26.1 as main
after the #1680 merge. No rollback to 0.25.4. The owner runs the publish with
the advisor; the agent does not tag, publish or create a GitHub release.

## Cause of the release

- Hook fix (#1683, #1680): in 0.26.0, each bundled `repo-harness-hook` run
  exited 1 with `MANIFEST_MISSING` when the machine recorded an install
  state. So the edit, bash and subagent guards, the inbox, SessionStart and
  Stop did not run. The hook now reads the selection through an
  install-state read model (`src/cli/installer/install-state.ts`) that does
  not load the installer.
- Behavior change (#1683): the selection read of a hook or command root
  (`readRecordedSelection`, `src/cli/installer/architecture-selection.ts:20`)
  no longer checks the ownership surfaces. With `architecture` selected and
  an ownership surface outside the host mutation paths, every root that uses
  this read now loads the architecture providers, where 0.26.0 skipped them
  as `unreadable`: the CLI root (`src/cli/index.ts:135`), the hook
  (`src/cli/hook-entry.ts:21`), the Operator architecture thread
  (`src/cli/commands/architecture-thread.ts:13`),
  `scripts/capability-resolver.ts:39`, `scripts/check-managed-runtime.ts:6`,
  `scripts/contract-worktree-runtime.ts:131`, and the shell gate
  `scripts/lib/architecture-plugin.sh:20`, so `check-ci.sh`,
  `contract-worktree.sh` and `check-agent-tooling.sh` start archctx or
  CodeGraph. The list is `git grep -n "readRecordedSelection(" -- src
  scripts assets` at the PR head. `install`, `update`, `doctor`, `status`,
  `uninstall` and `upgrade` still check each surface and fail with
  `install_state_invalid_ownership`.
- Operator: the module review diff reads owners through the ownership port
  (#1682); the architecture page names each map failure (#1677).
- MCP: the CodeGraph adapter is required (#1675).
- Documentation: 0.26.0 publication values (#1679).
- The full list is in `docs/CHANGELOG.md`, section `[0.26.1]`. The
  `[Unreleased]` entry of #1683 is now in `[0.26.1]` Fixed. `[0.26.0]` and
  all older sections are byte-identical to `ee9b6d632`.

## Publication steps for the owner

1. Merge the release-prep PR only after green `Required / CI` on its head.
2. Be at the machine when the publish starts. The npm web authentication link
   expires in about 5 minutes (0.26.0 run 1 expired, record
   `261104-repo-harness-0.26.0.md`).
3. Publish with the advisor publish script:

   ```bash
   publish-0.26.1.sh <merge sha> <release-prep PR>
   ```

   The script checks that the merge commit is on `origin/main`, that its
   tree equals the PR head tree, and that `package.json` and
   `docs/CHANGELOG.md` show 0.26.1. Then it runs the prepublish gate
   (`bash scripts/check-npm-release.sh --prepublish`), `npm pack`, and
   `npm publish --auth-type=web`. Open the link that npm prints.
4. npm read-back: the upload takes about 4 minutes to show in the registry
   (0.25.4). The script polls `npm view --prefer-online` for up to 8 minutes
   and stops before the tag when the registry shasum differs from the local
   tarball.
5. The script tags `v0.26.1` on the merge commit, creates the GitHub release
   from the `[0.26.1]` CHANGELOG section, and runs
   `bash scripts/check-release-published.sh 0.26.1`. Record the values that
   its step 9 prints below.

## Upgrade steps for users

The owner's machine runs the 0.26.0 CLI with an install state of protocol 3,
selection `"all"` and 7 plugins (`architecture`, `cross-review`,
`peer-runtime`, `pi`, `platform`, `product`, `strategy-memory`), all at
0.26.0, 58 ledger entries (read-only read of
`~/.repo-harness/install-state.json`, 2026-11-04).

1. Install the new CLI directly, then update:

   ```bash
   bun add -g repo-harness@0.26.1 --no-cache
   repo-harness update --version 0.26.1
   ```

   `update` runs from `src/cli/index.ts` (`update`, `:873`; `--version`,
   `:876`), not from the hook bundle, so the 0.26.0 fault does not stop it.
   A 0.26.0 state is protocol 3: no migration.
2. From 0.25.4 or earlier: the `[0.26.0]` Upgrade steps in
   `docs/CHANGELOG.md` apply, with 0.26.1 in place of 0.26.0.
3. Rollback after publish: none (M53). Rolling back to 0.26.0 brings back the
   hook fault, and M53 rules out 0.25.4. A fault in 0.26.1 gets a 0.26.2. Do
   not delete the tag.

### Post-update hook probe

Run after step 1. The probe runs the installed `repo-harness-hook` with the
recorded protocol 3 state for `PreToolUse --route edit` and
`Stop --route default`, the shape of the #1683 tarball smoke
(`scripts/check-tarball-install-smoke.sh:534-565`). Each run must exit 0
with no error output. 0.26.0 exits 1 here with `MANIFEST_MISSING`.

The probe runs in a detached worktree of `origin/main`. It is an adopted
repository (`.ai/harness/workflow-contract.json` is tracked), and it needs no
`repo-harness init`: an `init` of a scratch repository adds it to
`~/.repo-harness/registered-repos.json`. The managed hook command sets
`HOOK_HOST` and `HOOK_REPO_ROOT` the same way
(`src/cli/installer/managed-entries.ts:71`).

```bash
probe=/tmp/repo-harness-wt-hookprobe
git -C ~/Projects/repo-harness fetch -q origin main
git -C ~/Projects/repo-harness worktree add -q --detach "$probe" origin/main
cd "$probe"
printf '%s\n' "{\"session_id\":\"hook-probe\",\"hook_event_name\":\"PreToolUse\",\"cwd\":\"$probe\",\"tool_name\":\"Write\",\"tool_input\":{\"file_path\":\"$probe/notes.txt\",\"content\":\"x\"}}" \
  | HOOK_REPO_ROOT="$probe" HOOK_HOST=claude repo-harness-hook PreToolUse --route edit 2>/tmp/hook-probe-edit.err
echo "edit exit=$?"; cat /tmp/hook-probe-edit.err
printf '%s\n' "{\"session_id\":\"hook-probe\",\"hook_event_name\":\"Stop\",\"cwd\":\"$probe\",\"stop_hook_active\":false}" \
  | HOOK_REPO_ROOT="$probe" HOOK_HOST=claude repo-harness-hook Stop --route default 2>/tmp/hook-probe-stop.err
echo "stop exit=$?"; cat /tmp/hook-probe-stop.err
# expect: edit exit=0, stop exit=0, and no text from either cat
cd ~ && git -C ~/Projects/repo-harness worktree remove --force "$probe" && git -C ~/Projects/repo-harness worktree prune
rm -f /tmp/hook-probe-edit.err /tmp/hook-probe-stop.err
```

The write target is `notes.txt` in the probe worktree, not a path under
`_ops/`: `OpsPrivateGuard` denies an `_ops` write with exit 2.

### Post-update check

Each command and flag is in the source at the PR head:

| Command or flag | Source |
|---|---|
| `bun add -g repo-harness@<v> --no-cache` | the 0.26.0 record; `CURRENT_PACKAGE_UPDATE`, `src/cli/installer/install-state.ts:104` |
| `update --version <version>` | `src/cli/index.ts:873`, `:876` |
| `install --state` (JSON: `protocol`, `selection`, `plugins[].id`, `drift.status`) | `src/cli/index.ts:725` |
| `repo-harness-hook <event> --route <route>` (stdin payload; exit 2 on bad usage) | `src/cli/hook-entry.ts:31-49`; `package.json` `bin` |
| `HOOK_HOST` (`claude`, `codex`, `pi`) | `src/cli/hook/runtime.ts:25`, `:121-124` |

```bash
# Protocol 3, selection "all", the 7 plugins at 0.26.1, no drift.
repo-harness install --state | jq -r '"protocol=\(.protocol) selection=\(.selection) plugins=\([.plugins[].id] | join(",")) drift=\(.drift.status)"'
# expect: protocol=3 selection=all plugins=architecture,cross-review,peer-runtime,pi,platform,product,strategy-memory drift=consistent
```

## Hosted CI

- Push CI on main: every run from `6f82add04` (#1675, the first PR after
  0.26.0) to `ee9b6d632` passed. The run on the base is 41779113334
  (`ee9b6d632`, success).
- Daily run: the last scheduled run is 41764739486 on `51119343e`
  (2026-11-04T03:04Z): success.
- The release-prep PR needs green `Required / CI` on its head before merge.

## Acceptance environment

- macOS 26.5 arm64 (Darwin 25.5.0), Bun 1.4.3, Node 24.18.0, npm 10.9.8.
- `bun install --frozen-lockfile` (518 packages) in the release worktree on
  `release/0.26.1`.
- Guard: `hc`, `herdr-app` and `herdr` shims that log the call and exit 97
  are first on PATH for every check. PATH holds only explicit directories
  (guard, `node_modules/.bin`, a directory with links to the `bun`, `node`,
  `npm` and `npx` binaries only, `/opt/homebrew/bin`, `/usr/bin`, `/bin`,
  `/usr/sbin`, `/sbin`), not `~/.local/bin` and not `~/.bun/bin`. `HC_*`,
  `HERDR_ENV`, `CLAUDECODE`, `CLAUDE_CODE_*` and `REPO_HARNESS_SOURCE_ROOT`
  are removed. No run called the owner's `hc`. No check started an archctx
  process from this worktree. One archctx daemon of the global install
  (`~/.bun/install/global/node_modules/archctx`, started 13:19:28 local
  time, cwd `/`) ran on the host; the guard PATH does not reach that
  install.
- Subject: commit `1138e22d8` (base `ee9b6d632` plus the version and the
  changelog edits). The record commit changes only this file.
- `bun run check:release`: exit 0 in 155 s. `[helpers] projection OK`;
  expensive release lane `tests/harness-benchmark-matrix.test.ts` 31 pass,
  0 fail; `[tarball-smoke] OK: repo-harness-0.26.1.tgz installs, serves the
  packaged Operator, and packaged CLI bins start.`; `[release] OK: npm
  package gate passed.` The tarball smoke includes the #1683 step: it writes
  a protocol 3 state (selection `all`, one managed surface) into its scratch
  HOME, then runs the installed `repo-harness-hook` for
  `PreToolUse --route edit` and `Stop --route default`; a non-zero exit or
  any stderr output fails it. Guard calls: 1 (`hc server status --json`).
- Prepublish gate, read-only: `bash scripts/check-npm-release.sh
  --prepublish`: exit 0, `[release] OK: prepublish fast gate passed`. It runs
  `check:helpers` and an `npm view` lookup that proves 0.26.1 is
  unpublished; it does not publish.
- `bun run check:type`: exit 0.
- Version-surface tests: `bun run test:files tests/skill-version.test.ts
  tests/installed-copy-sync.test.ts
  tests/operator-web/operator-architecture.test.tsx
  tests/operator-web/operator-bots-page.test.tsx --timeout 60000
  --max-concurrency 1`: 10, 30, 34 and 14 pass, 0 fail. Guard calls: 0.
- `grep -rln "0\.26\.0" tests` finds `tests/install-profiles.test.ts:346-347`
  and `tests/cli/doctor.test.ts:413-414` (literal version arguments) and the
  board fixture. No test pins the old package version.
- Hook probe shape, source hook with a temporary HOME: in a detached worktree
  of `origin/main`, `bun src/cli/hook-entry.ts PreToolUse --route edit`
  (Write `notes.txt`) and `Stop --route default` with `HOOK_HOST=claude`:
  exit 0, no stdout, no stderr; the temporary HOME and the worktree stayed
  unchanged.

### Advisor-run evidence

Advisor t11 ran a pre-publish probe of `ee9b6d632` (temporary worktree,
removed after the run). It built the hook bundle and ran it with a verbatim
copy of the owner's install state in a disposable HOME:

- Bundle: 0 `install-profile` sections, 1 `install-state` section, 0
  three-level joins.
- Hooks: `PreToolUse` bash, `Stop`, `SessionStart` and inbox exit 0, with no
  catalog or state error; the selection read works. `PreToolUse` edit exits
  2 because `OpsPrivateGuard` denies the `_ops` write target, as expected.
- The same probe on the installed 0.26.0 exits 1 on every event.
- t11 repeats the probe on the installed 0.26.1 after the owner upgrades.

### Yellow flags

The owner accepts or repairs each flag before publish.

1. Hooks are off on the owner's machine until the update: the installed
   0.26.0 hook exits 1 on every event. Run the post-update hook probe after
   step 1.
2. No rollback (M53). A fault found after publish needs a 0.26.2.
3. The npm web authentication link expires in about 5 minutes. The owner
   must be at the machine when the publish starts.

## Release readiness items

- Skill eval evidence: unavailable for 0.26.1. The only report,
  `evals/benchmark.md`, is from 2026-06-14 (0.5.1). 0.26.1 makes no
  skill-effectiveness claim.

## Publication

- Publish candidate: `c2da46997fbbb44e43273c63a1b3064dae40204b` (the #1693
  merge commit). Run 1 stopped at the upload: the stored npm session token
  was invalid (`npm whoami` gave E401), so npm sent it instead of starting
  web authentication, and the PUT failed at once with E404 and no web
  authentication link. Nothing was published. The owner logged in to npm
  again; run 2 published.
- npm version: `repo-harness@0.26.1`, dist-tag `latest`.
- Git tag: annotated `v0.26.1`, tag object
  `a0e7ecdb6cf545832f136640c11f35cd90ff0ffa`, on `c2da46997`; GitHub Release
  https://github.com/Ancienttwo/repo-harness/releases/tag/v0.26.1, published
  2026-11-04T05:54:37Z.
- Published tarball digest: shasum `84885b698e2cd97cd79bf31816eb49d325809596`,
  integrity `sha512-NR1OEGyJQmy95HOQdjMJgka0V2nOGMl3ePlbiYCMceiKXfZippRmmxjJsYbUvKUTofPMube3g1c8+i3xWzg9ow==`.
- `bun run check:release-published`: coordinator-run, read-only, in a
  detached worktree of `c2da46997` (removed after the run).
  `bash scripts/check-release-published.sh 0.26.1` at 2026-11-04T06:06Z:
  `runtime-evidence-receipt: valid published_tarball, clean_install,
  installed_hook_readback`; `[release-published] OK: registry, dist-tag,
  tarball, tag, and local version files agree.` (decision on #1703).
- Owner machine upgrade and hook probe: package swap,
  `repo-harness update --version 0.26.1`, install state consistent,
  `setup check` 38 ok and 0 fail. The hook probe with a recorded install
  state passes before and after the update. The Operator server on port 4318
  restarted on 0.26.1.

- Yellow flag for the next release: run `npm whoami` before the publish. An
  invalid stored token makes npm skip web authentication and fail with E404.
