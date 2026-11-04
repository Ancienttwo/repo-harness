# repo-harness 0.26.2 publication record

## Scope and authority

- Release-prep base: `origin/main`
  `0996046c74d2ce1c826c4d3bbd82133a3397c2f0` (#1742, the #1741 quota fix).
  The first base was `21430323b` (#1739, the last must-ship merge, for
  #1689). Owner decision M63 added #1741 to 0.26.2, so the coordinator moved
  the base to `21430323b` plus #1742 only. The release-prep branch
  `chore/release-0.26.2` starts on this base and merges no later main.
- Source commit: the head of the release-prep PR #1744 (#1740). The publish
  candidate is the merge commit of that PR on `origin/main`. The owner
  records it below before publish.
- Previous release: 0.26.1, from the release-prep merge
  `c2da46997fbbb44e43273c63a1b3064dae40204b` (#1693). The owner published it
  to npm on 2026-11-04 (record `261104-repo-harness-0.26.1.md`, publication
  values from #1704).
  - Tag `v0.26.1`: annotated. Tag object:
    `a0e7ecdb6cf545832f136640c11f35cd90ff0ffa`. Target:
    `c2da46997fbbb44e43273c63a1b3064dae40204b`.
- Merged range: `c2da46997..0996046c7`: 24 first-parent commits and 24
  commits in total (`git rev-list --count`). Every PR in the range is a
  squash merge: #1704, #1708, #1706, #1711, #1707, #1712, #1714, #1715,
  #1600, #1709, #1710, #1713, #1723, #1729, #1726, #1732, #1724, #1733,
  #1727, #1736, #1735, #1734, #1739, #1742.
- The npm package goes from 0.26.1 to 0.26.2. `package.json`,
  `assets/skill-version.json` (version and template version), README
  ("Release & license", the section that #1709 made from "Current Release")
  and the operator bot fixture show 0.26.2. These are the four version
  surfaces that #1693 changed.
- The release-prep PR changes no product code and no dependency version.
  `archctx` and `archctx-contracts` stay at the locked exact 0.11.2.
- Milestone: 0.26.2 (number 4).
- Publish status: pending owner.
- Hold reason: none.

### Owner decision

Owner instruction relayed by advisor t11 on 2026-11-04 (#1740): the agent
prepares the release and the owner runs the publish when the release-prep PR
merges. The agent does not tag, publish, set a dist-tag or create a GitHub
release.

## Cause of the release

- Breaking (#1713): the `reverse-skill-router` integration is removed.
  `--with-reverse-skill` is an unknown option. The candidate reconciliation
  protocol goes from 2 to 3, so the 0.26.2 candidate refuses the protocol 2
  request of a 0.26.1 or 0.26.0 `update` with
  `candidate_request_protocol_retired`.
- Install (#1724): `install` and `update` install or update `hc` to the
  package pin floor 0.1.17. Windows adds the user PATH entry; Unix prints the
  PATH hint and uses the directory for the rest of the run.
- Quota (#1716): `repo-harness quota [--json]` (#1723), the Claude status
  line capture and the managed `statusLine` entry (#1733), the coordinator
  quota read in the issue-flow skill (#1732). The account state comes from
  the weekly window, and an absent non-weekly window is `absent` (#1741,
  #1742).
- hc pin (#1712): one package pin file; the policy key
  `external_tooling.herdr_core` is retired.
- Operator: architecture map contract v7 (#1729), Sequence view (#1734),
  History view (#1735), header (#1715), Skills page host state (#1714),
  worktree cleanup archive ports (#1726) and plan review (#1727), the adoption
  hint (#1710), the i18n split (#1708).
- Fleet and seats: `fleet remove` (#1691, #1706); a seat labels its own
  terminal (#1695, #1707).
- Architecture: archctx resolution by module resolution (#1711); the TLA+
  spec of the ship closeout claim (#1736); the archimap behavior board
  (#1739); the generated outputs refresh (#1600).
- Documentation: README landing page (#1709), 0.26.1 publication values
  (#1704).
- The full list is in `docs/CHANGELOG.md`, section `[0.26.2]`. The
  `[Unreleased]` entries of #1712 are now in `[0.26.2]` Changed, with the
  malformed-pin sentence fixed (gatekeeper P3 `gk1712-r1-01` on #1686).
  `[0.26.1]` and all older sections are byte-identical to `0996046c7`.

## Publication steps for the owner

1. Merge the release-prep PR only after green `Required / CI` on its head.
2. Be at the machine when the publish starts. The npm web authentication link
   expires in about 5 minutes (0.26.0 run 1 expired, record
   `261104-repo-harness-0.26.0.md`).
3. Publish with the advisor's publish script:

   ```bash
   publish-0.26.2.sh <merge sha> <release-prep PR>
   ```

   The advisor prepares and owns this script. It checks that the merge commit
   is on `origin/main`, that its tree equals the PR head tree, that
   `package.json` shows 0.26.2 and that `docs/CHANGELOG.md` has a `[0.26.2]`
   section. Before the upload it stops on an invalid stored npm token
   (`npm whoami` E401, the 0.26.1 run 1 fault). Then it runs the prepublish
   gate (`bash scripts/check-npm-release.sh --prepublish`), `npm pack`, and
   `npm publish --auth-type=web`. Open the link that npm prints.
4. npm read-back: the upload takes about 4 minutes to show in the registry
   (0.25.4). The script polls `npm view --prefer-online` for up to 8 minutes
   and stops before the tag when the registry shasum differs from the local
   tarball.
5. The script tags `v0.26.2` on the merge commit, creates the GitHub release
   from the `[0.26.2]` CHANGELOG section, and runs
   `bash scripts/check-release-published.sh 0.26.2`. Record the values that
   its step 9 prints below.

## Upgrade steps for users

The owner's machine runs the 0.26.1 CLI with an install state of protocol 3
and selection `"all"` (record `261104-repo-harness-0.26.1.md`, Publication).

1. Install the new CLI directly, then update:

   ```bash
   bun add -g repo-harness@0.26.2 --no-cache
   repo-harness update
   ```

   Without `--version`, `update` installs `repo-harness@latest`
   (`src/cli/index.ts:930-934`), so run it after npm shows 0.26.2 as
   `latest`. A plain `repo-harness update` from the 0.26.1 CLI fails: the
   0.26.2 candidate refuses its protocol 2 request with
   `candidate_request_protocol_retired`, and the message gives the commands
   above (`src/cli/commands/candidate-reconciliation.ts:473-480`). The
   install state stays protocol 3: no migration.
2. `--with-reverse-skill` exits non-zero with `unknown option`. Remove it
   from scripts.
3. The `update` step `ensure herdr-core (hc)` changes nothing when `hc` on
   PATH is at 0.1.17 or later. Below the floor it runs
   `hc update --version 0.1.17`; when `hc` is missing it downloads the pinned
   asset.
4. `update` adds the managed `statusLine` to `~/.claude/settings.json` only
   when none exists. An existing status line is not changed; `update` prints
   the pipe that sends the status line input to
   `repo-harness-hook statusline`. Without the managed entry or the pipe,
   `repo-harness quota` reports the Claude account as `unknown` with reason
   `no capture`.
5. From 0.25.4 or earlier: the `[0.26.0]` Upgrade steps in
   `docs/CHANGELOG.md` apply, with 0.26.2 in place of 0.26.0.
6. Rollback after publish: a fault in 0.26.2 gets a 0.26.3. Do not delete the
   tag.

### Post-upgrade probe

The advisor prepares and runs the post-upgrade probe after step 1. It reads
the real HOME and writes only to a disposable HOME and a scratch repository.
Pass:

- The installed package is 0.26.2, and the hook bundle has no
  `install-profile` section.
- With a verbatim copy of the recorded install state in the disposable HOME,
  the installed `repo-harness-hook` gives: `PreToolUse --route edit` on an
  `_ops/` write target exits 2 (`OpsPrivateGuard`); `Stop --route default`
  and `SessionStart --route default` exit 0. No run prints
  `invalid skill-surface catalog`, `MANIFEST_MISSING` or
  `invalid package version`.

### Post-update check

Each command and flag is in the source at the base:

| Command or flag | Source |
|---|---|
| `bun add -g repo-harness@<v> --no-cache` | `CandidateRequestProtocolRetiredError`, `src/cli/commands/candidate-reconciliation.ts:473-480` |
| `update` (installs `repo-harness@latest` without `--version`) | `src/cli/index.ts:874`, `:930-934` |
| `install --state` (JSON: `protocol`, `selection`, `plugins[].id`, `drift.status`) | `src/cli/index.ts` `install` command |
| `quota --json` | `src/cli/commands/quota.ts` (#1723) |

```bash
# Protocol 3, selection "all", the plugins at 0.26.2, no drift.
repo-harness install --state | jq -r '"protocol=\(.protocol) selection=\(.selection) plugins=\([.plugins[].id] | join(",")) drift=\(.drift.status)"'
# expect: protocol=3 selection=all drift=consistent, and the plugin list of 0.26.1
```

## Hosted CI

- Push CI on main: all 24 runs from `f656dc13d` (#1704, the first PR after
  0.26.1, run 41783880328) to `0996046c7` passed. The run on the base is
  41811256828 (`0996046c7`, success).
- Daily run: the last scheduled run is 41764739486 on `51119343e`
  (2026-11-04T03:04Z): success. It is older than the range.
- The release-prep PR needs green `Required / CI` on its head before merge.

## Acceptance environment

- macOS 26.5 arm64 (Darwin 25.5.0), Bun 1.4.3, Node 24.18.0, npm 10.9.8,
  TypeScript 7.0.2.
- `bun install --frozen-lockfile` (no changes) in the release worktree on
  `chore/release-0.26.2`.
- Guard: `hc`, `herdr-app` and `herdr` shims that log the call and exit 97
  are first on PATH for every check. PATH holds only explicit directories
  (guard, `node_modules/.bin`, a directory with links to the `bun`, `node`,
  `npm` and `npx` binaries only, `/opt/homebrew/bin`, `/usr/bin`, `/bin`,
  `/usr/sbin`, `/sbin`), not `~/.local/bin` and not `~/.bun/bin`. HOME is a
  scratch directory. `HC_*`, `HERDR_ENV`, `CLAUDECODE`, `CLAUDE_CODE_*` and
  `REPO_HARNESS_SOURCE_ROOT` are removed. No run called the owner's `hc`. No
  check started an archctx process from this worktree.
- Subject: commit `2efe8675c` (base `0996046c7` plus the version, changelog
  and record edits). The head did not move during the run, and the worktree
  stayed clean. The next commit changes only this section.
- `bun run check:type`: exit 0.
- `bun run check:release`: exit 0 in 97 s. `[helpers] projection OK`;
  expensive release lane `tests/harness-benchmark-matrix.test.ts` 31 pass,
  0 fail; `[tarball-smoke] OK: repo-harness-0.26.2.tgz installs, serves the
  packaged Operator, and packaged CLI bins start.`; `[release] OK: npm
  package gate passed.` Guard calls: 2 (`hc server status --json`).
- Prepublish gate, read-only: `bash scripts/check-npm-release.sh
  --prepublish`: exit 0, `[release] OK: prepublish fast gate passed`. It runs
  `check:helpers` and an `npm view` lookup that proves 0.26.2 is
  unpublished; it does not publish.
- An earlier `check:release` on the first base failed 1 of 31 tests with
  `benchmark source commit changed after isolated install one`, because a
  commit landed during the run. That run is not evidence for this subject.

### Advisor-run evidence

None yet. Advisor t11 runs the post-upgrade probe on the owner's machine
after the owner upgrades, and records the result in the Publication section.

### Yellow flags

The owner accepts or repairs each flag before publish.

1. Breaking update: a plain `repo-harness update` from 0.26.1 fails with
   `candidate_request_protocol_retired`. Run `bun add -g
   repo-harness@0.26.2 --no-cache` first.
2. Run `npm whoami` before the publish. An invalid stored token makes npm
   skip web authentication and fail with E404 (0.26.1 run 1). The publish
   script stops on E401.
3. The npm web authentication link expires in about 5 minutes. The owner
   must be at the machine when the publish starts.
4. `update` writes `~/.claude/settings.json` (`statusLine`) when no status
   line exists, and can download and install `hc` when `hc` is missing or
   below 0.1.17.

## Release readiness items

- Skill eval evidence: unavailable for 0.26.2. The only report,
  `evals/benchmark.md`, is from 2026-06-14 (0.5.1). 0.26.2 makes no
  skill-effectiveness claim.

## Publication

Pending owner. The owner records the publish candidate, the npm version and
dist-tag, the tag object, the GitHub release, the tarball digest and the
`check-release-published.sh` result here after the publish.
