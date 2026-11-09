# repo-harness 0.29.0 publication record

## Scope and authority

- Final base: `9a42fd12116b8c60dc147ed00509583e94e6de7d` on `main`. The
  release PR branched from `766e0e32b` and merged `origin/main` once, on
  t2's request, to take the #2068 review-publish fix (J40).
- Previous release: `v0.28.0`. Range:
  `v0.28.0..9a42fd12116b8c60dc147ed00509583e94e6de7d` (33 first-parent
  commits).
- Release date and record prefix: UTC 2026-11-09, from `date -u`. Update
  both when publication moves to another date.
- The core package, console package, skill and template stamps, README and
  Operator fixture move to 0.29.0. This prep changes no dependency, lockfile
  or hc pin; no range PR changed them.
- Owner GO on the plan (J38, recorded on #2000): the release PR starts
  after #2059 merged and a dispatched daily is green.
- Publish status: pending. Owner authorization on #2065 (comment
  6734527876, 2026-11-09) covers the 0.29.0 production release only: the
  advisor seat t5 runs the publish, tag and Release steps after this PR
  merges with green CI. t5 gives the owner each npm web-auth URL, and the
  owner completes the npm 2FA in the browser. The owner keeps control of
  publication, the tag and the GitHub Release. Order: console first, then
  core, with `npm publish --auth-type=web` (Q3a–Q3c, #1287).

## Daily evidence

- Daily run https://github.com/Ancienttwo/repo-harness/actions/runs/42577018596
  at `a99fc44cd` (#2059 merge): success.
- The base moved four commits after that run: #2055, #2063, #2062 and
  #2068, ending at `9a42fd121`. The release PR's own `Required / CI`
  covers the delta from `a99fc44cd` to the
  branch point.

## Cause of the release

The board runs the issue flow: `board dispatch` starts worker seats for
ready sub-issues, `board review` starts the gatekeeper and Claude reviewer
seats, and `board closeout` closes seat terminals and removes the merged
worktree. The owner delegates merge, dispatch and fix-round decisions to
the life cycle (#2008). The Operator protocol moves to 3. A repository can
open listed `_ops/` directories to agent edits, and the Bash tripwire
denies more glob and symlink forms. The release also fixes the daily
package and ContextScan failures.

Each first-parent range commit was checked with `git show --stat` and its
CHANGELOG diff. None means the commit added no CHANGELOG entry.

| PR | Commit | Section in 0.29.0 | Change | Original CHANGELOG reference |
|---|---|---|---|---|
| #2012 | `04af12afa` | Documentation | Architecture projection refresh | None |
| #1990 | `cd9a808b3` | Added, Changed, Upgrade, Rollback | `worktrees path`, desktop open controls, protocol 3 | #1968 (Unreleased) |
| #2017 | `f55f97a8d` | Added, Upgrade | `board dispatch` | #2004 (Unreleased) |
| #2015 | `1367db55f` | Fixed | Out-of-diff finding in the review body | #2009 (Unreleased) |
| #2018 | `628be0863` | Changed | Host test queue | #2001 (Unreleased) |
| #2020 | `6bf01ef3a` | Added | `board closeout` | #2005 (Unreleased) |
| #2027 | `dccc0bca6` | Fixed | Attention rules see every worker seat kind | #2016 (Unreleased) |
| #2026 | `13ef1a049` | Added | Closeout removes finished seat terminals | #2021 (Unreleased) |
| #2028 | `408f09e92` | Fixed | codegraph init with the trusted node | #2023 (Unreleased) |
| #2019 | `e9d127b33` | Documentation | Architecture projection refresh | None |
| #2035 | `2f84d6474` | Fixed | R2 ignores `docs/CHANGELOG.md` | #2034 (Unreleased) |
| #2024 | `3426462db` | Changed | Review seat with `net` publishes its round | #1996 (Unreleased) |
| #2031 | `09c29c178` | Added, Upgrade, Rollback | `schedule` tool group | #2014 (Unreleased) |
| #2038 | `944eef21f` | Changed, Upgrade, Rollback | Advisor range allows `edit` | #2032 (Unreleased) |
| #2030 | `b201e68a3` | Added | Closeout stops the bound CodeGraph MCP server | #2029 (Unreleased) |
| #2037 | `929f86111` | Added, Upgrade, Rollback | Policy-listed writable `_ops/` directories | None |
| #2036 | `e5541c58b` | Documentation | Architecture projection refresh | None |
| #2040 | `d9190d528` | Added, Upgrade | Bash allowance withdrawn; canonical targets only | None |
| #2022 | `e25fd8bd4` | Added | `board review` starts the gatekeeper seat | #2002 (Unreleased) |
| #2043 | `0ecdca0b9` | Documentation | Architecture projection refresh | None |
| #2046 | `f818709f6` | Fixed | Tarball smoke `/healthz` constants | #2033 (Unreleased) |
| #2044 | `b6807bb9e` | Changed | `board review` starts the Claude reviewer seat | #2025 (Unreleased) |
| #2048 | `aea34b425` | Fixed, Upgrade | Bash tripwire globs and symlinks | #2041 (Unreleased) |
| #2042 | `4681bcbdd` | Changed, Upgrade | #2008 delegation rules | #2008 (Unreleased) |
| #2045 | `566dce155` | Added, Upgrade | Review bot is a reference | #2007 (Unreleased) |
| #2047 | `57a44e132` | Added | Opt-in Delegation profile | #2011 (Unreleased) |
| #2054 | `fe9dbdf1b` | Tests | Half-written pid file | #2052 (Unreleased) |
| #2050 | `831d080f4` | Documentation | Architecture projection refresh | None |
| #2059 | `a99fc44cd` | Fixed, Upgrade | ContextScan whole words | None |
| #2055 | `766e0e32b` | Changed, Upgrade | Seat line on seat comments | #2051 (Unreleased) |
| #2063 | `e9e490bff` | Fixed | ContextScan workflow on PRs that change rule files | None |
| #2062 | `cb8c2873b` | Documentation | Architecture projection refresh | None |
| #2068 | `9a42fd121` | Fixed | One acceptance claim per reviewer agent on a head | #2061 (Unreleased) |

The `[Unreleased]` entries move into `[0.29.0]` and are sorted into Added,
Changed, Fixed and Tests. Two entries change: the #2002 entry drops the
hand start of the Claude reviewer and `second_reviewer_required`, which
#2025 replaced, and the #2041 entry names the open gaps in #2060. New
entries cover #2037/#2040, #2056, #2063 and the projection refreshes. Every range
PR appears in CHANGELOG `[0.29.0]`. The `[0.28.0]` and older sections
remain byte-identical to the final base.

## Known gap

The Bash tripwire misses a case-variant `_OPS` path on a case-insensitive
APFS volume, a glob segment that can match `..`, and brace and `~+` forms.
These gaps existed before 0.29.0; #2048 added no regression. They stay
open in #2060 and need an owner-approved hook change.

## Publication steps

t5 runs these steps under the owner authorization in Scope and authority.
The owner completes each npm web authentication.

1. Pin the prep head. Run `bun run check:release` on the
   host after clearing `packages/operator-web/dist` and
   `node_modules/repo-harness-operator-web`. Record the result and require
   green hosted CI before merge.
2. Record the merge SHA and check out that exact commit. Pack both packages
   and record their local tarball values below.
3. t5 runs `npm publish --auth-type=web` and gives the owner the web-auth
   URL; the owner completes the 2FA in the browser. npm runs each package's
   `prepublishOnly` gate (`check-npm-release.sh --prepublish` with
   `npm_package_name` set) through the npm lifecycle. Publish
   `repo-harness-operator-web` first and record its gate result. Then
   publish `repo-harness`; its gate requires the console version on npm.
   Record that gate result too.
4. Read both versions from npm and compare their shasum, integrity and file
   counts with the local tarballs. Record the results below.
5. t5 tags `v0.29.0` on the merge SHA and creates the GitHub Release from
   CHANGELOG `[0.29.0]`. Run the post-publish checks below.

## Upgrade steps for users

```bash
bun add -g repo-harness@0.29.0 --no-cache && repo-harness update --version 0.29.0
```

Restart the Operator server and reload the page. Update the desktop app
together with the CLI: `/healthz.protocol` is now 3, and a protocol-2
desktop app refuses the server. To use `board dispatch`, create the
`route:<class>` and `touches:credentials` labels in the repository.
`schedule` and advisor `edit` stay off until you turn them on in the Seats
page. No config migration runs.

## Acceptance environment

- Subject: `9a42fd121` plus the prep diff. Host Max, Darwin 25.5.0 arm64.
- Prep head `0130aa52f` on `766e0e32b`, macOS 26.5 arm64, Bun 1.4.3, Node v24.22.1:
  the console dist and console `node_modules` link were absent before the
  run. `bun install --frozen-lockfile`, then `bun run check:release` exited
  0 with `[ci] OK` and `[release] OK: npm package gate passed.`
- The tarball smoke loaded 32 MCP modules with all selected and 0 with an
  empty selection. Operator loaded 86 modules with all selected and served;
  it refused an empty selection. Status, seats, quota and hook routes each
  loaded 0 modules. The 98-module hook bundle held 0; peer-runtime loaded 4
  when selected. `repo-harness-0.29.0.tgz` installed, served the packaged
  Operator, and started the packaged CLI bins.
- `bun run check:type`: exit 0. `bun run test:files
  tests/bootstrap-files.test.ts tests/skill-version.test.ts
  tests/operator-web/operator-bots-page.test.tsx`: 15, 10 and 14 pass,
  0 fail.
- After the merge of `origin/main` at `9a42fd121`: `bun run check:type`
  exit 0; `bun run test:files tests/cli/review.test.ts
  tests/bootstrap-files.test.ts tests/skill-version.test.ts`: 22, 15 and
  10 pass, 0 fail. The merge adds no package or lockfile change, so the
  `check:release` result above stays valid for the package contents.
- `git diff --check` against the final base: exit 0. Historical CHANGELOG
  byte comparison from `[0.28.0]` through the end: identical to the final
  base.
- Test budget on the prep diff: 0 test lines, 1 added product line in
  `src` and `scripts`, 0 new test files.
- Hosted CI and merge-commit prepublish gate: pending. No publication or
  installed upgrade has run.

## Publication

Publish candidate merge SHA: pending.

| Order | Name | Shasum | Integrity | File count |
|---|---|---|---|---|
| 1 | `repo-harness-operator-web@0.29.0` | pending | pending | pending |
| 2 | `repo-harness@0.29.0` | pending | pending | pending |

Record local tarball values and registry readback for each field before
marking publication complete. Tag and GitHub Release: pending.

## Post-publish checks

- In a disposable HOME and BUN_INSTALL, run `bun x repo-harness@0.29.0
  install --plugins operator`, start `repo-harness operator serve` and
  verify that `/healthz` reports 0.29.0, protocol 3, and `GET /` returns
  200. Result: pending.
- Run `bash scripts/check-release-published.sh 0.29.0`. Result: pending.
- On the owner machine, run the upgrade command and record the installed
  version and the desktop app protocol. Result: pending.

## Rollback

Before publication, close the prep PR or revert its merge. After
publication, retain the published tag and use a new patch release for a
correction. A 0.28.0 CLI refuses a stored seats config that lists
`schedule` or advisor `edit`, and ignores
`operations.agent_writable_private_dirs`.
