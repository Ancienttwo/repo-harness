# repo-harness 0.28.0 publication record

## Scope and authority

- Final base: `c76f220dd060d675318a8511071b811b1241146b` on `main`,
  frozen by t2.
- Previous release: `v0.27.0`. Range:
  `v0.27.0..c76f220dd060d675318a8511071b811b1241146b` (27 first-parent
  commits).
- Release date and record prefix: UTC 2026-11-08, from `date -u`. Update
  both when publication moves to another date.
- The core package, console package, skill and template stamps, README and
  Operator fixture move to 0.28.0. This prep changes no dependency or
  lockfile; #1984, #1994 and #1999 moved the dependencies, and #1992 moved
  the hc pin.
- Publish status: pending. The owner publishes both packages, console
  first, then core, with `npm publish --auth-type=web` (Q3a–Q3c, #1287).

## Cause of the release

Seat modes follow weekly quota, the Seats page edits every seat, route and
threshold, and seats with `net` get network access (M87 reversed).
Orchestrator and advisor seats reset through a checked handoff. The
release also pins herdr-core 0.1.19 and archctx 0.12.0, fixes the board
watcher wait on hc 0.1.18 and later, and ends a task agent's whole
provider process group on cancel and close.

Each first-parent range commit was checked with `git show --stat` and its
CHANGELOG diff. None means the commit added no CHANGELOG entry.

| PR | Commit | Section in 0.28.0 | Change | Original CHANGELOG reference |
|---|---|---|---|---|
| #1947 | `a8fcf867b` | Documentation | 0.27.0 publication and upgrade evidence | None |
| #1948 | `8513e68a7` | Changed | Gatekeeper only in a Herdr seat, global rules | None |
| #1942 | `177e792a2` | Documentation | Architecture projection refresh | None |
| #1949 | `52c9ecb5f` | Changed | `board seats --json` | None |
| #1956 | `ab8586464` | Changed | Pi seat provider and model | None |
| #1953 | `b577661b9` | Changed | `operator serve --exit-on-stdin-close` | None |
| #1952 | `870c0635a` | Changed, Upgrade | Managed archctx entry and PATH copy check | None |
| #1962 | `661ed4596` | Changed, Upgrade | Network for seats with `net` (M87 reversed) | None |
| #1960 | `0e24fce7f` | Changed, Upgrade, Rollback | Quota-derived seat modes and migration | #1954 (Unreleased) |
| #1964 | `77c93e445` | Changed, Upgrade | Seats page edits seats, routes, thresholds | None |
| #1965 | `cf748edc5` | Documentation | Seat docs network rule | None |
| #1966 | `8e9fa2185` | Documentation | Gatekeeper only in a Herdr seat, guidance | None |
| #1970 | `fdd67a036` | Tests | Mermaid projected twice | None |
| #1967 | `17ef074e2` | Tests | Install-state temp-HOME guard | None |
| #1974 | `2ac0c7946` | Documentation | Owner decision reaches the issue | None |
| #1984 | `8a2af0043` | Changed, Upgrade | Dependencies, OAR 0.95.0, archctx 0.11.4 | None |
| #1978 | `642d9fb35` | Changed | Pi seat runs the GPT family | None |
| #1981 | `45d9c41ee` | Fixed, Upgrade | hc 0.1.18 wait status and pin | None |
| #1986 | `0c58ca0e2` | Tests | Direct install-state writes through the guard | None |
| #1985 | `6b3c8def0` | Changed | Constraints report uses the published schema | None |
| #1975 | `44f6f3926` | Changed | Checked orchestrator and advisor reset | None |
| #1989 | `7e725f4f6` | Changed | Projection writer checkout at `origin/main` | #1983 (Unreleased) |
| #1993 | `870a6c1a2` | Changed | pi-gpt seats get their own fleet roles | None |
| #1994 | `ed981af0d` | Changed | happy-dom 21 and mermaid 12 | #1987 (Unreleased) |
| #1999 | `4d101ac7a` | Changed, Upgrade | archctx and archctx-contracts 0.12.0 | #1995 (Unreleased) |
| #1955 | `bd340ae1c` | Documentation | Architecture projection refresh | None |
| #1992 | `c76f220dd` | Changed, Upgrade | hc 0.1.19 pin and provider process-group cleanup | #1991 (Unreleased) |

The `[Unreleased]` entries from #1960 and #1989 move into `[0.28.0]`
unchanged. The #1994, #1999 and #1992 entries are rewritten or rewrapped and gain their PR
numbers. Every range PR appears in CHANGELOG `[0.28.0]`. The `[0.27.0]`
and older sections remain byte-identical to the final base.

## Publication steps for the owner

1. Pin the prep head. Run `bun run check:release` on the
   host after clearing `packages/operator-web/dist` and
   `node_modules/repo-harness-operator-web`. Record the result and require
   green hosted CI before merge.
2. Record the merge SHA and check out that exact commit. Pack both packages
   and record their local tarball values below.
3. The owner publishes by hand with `npm publish --auth-type=web`. npm runs
   each package's `prepublishOnly` gate (`check-npm-release.sh --prepublish`
   with `npm_package_name` set) through the npm lifecycle. Publish
   `repo-harness-operator-web` first and record its gate result. Then
   publish `repo-harness`; its gate requires the console version on npm.
   Record that gate result too.
4. Read both versions from npm and compare their shasum, integrity and file
   counts with the local tarballs. Record the results below.
5. After owner approval, tag the publish candidate and create the GitHub
   Release from CHANGELOG `[0.28.0]`. Run the post-publish checks below.

## Upgrade steps for users

```bash
bun add -g repo-harness@0.28.0 --no-cache && repo-harness update --version 0.28.0
```

Update migrates `seats.routing.mode` and `seats.routing.hyper` once to the
two quota thresholds and installs the managed archctx 0.12.0. When hc is
below 0.1.19, update runs `hc update --version 0.1.19`, which restarts the
core and ends programs in hc terminals; finish or stop agent sessions
first. On Linux and macOS, closing a pane no longer ends a detached
program; stop background servers before you close it.
Restart the Operator server and reload the page. For the default Pi
`worker-light`, `agents.enabled` must include `pi` and Pi must have the
`magpie` provider and model configured; otherwise set `worker-light` to
`null`. Seats with `net` now have network access.

## Acceptance environment

- Subject: `c76f220dd` plus the prep diff. Host Max, Darwin 25.5.0 arm64.
- Prep head `dba1591fc` on macOS 26.5 arm64, Bun 1.4.3, Node v24.22.1:
  the console dist and console `node_modules` link were absent before the
  run. `bun install --frozen-lockfile`, then `bun run check:release` exited
  0 with `[ci] OK` and `[release] OK: npm package gate passed.`
- The tarball smoke loaded 32 MCP modules with all selected and 0 with an
  empty selection. Operator loaded 86 modules with all selected and served;
  it refused an empty selection. Status, seats, quota and hook routes each
  loaded 0 modules. The 98-module hook bundle held 0; peer-runtime loaded 4
  when selected. `repo-harness-0.28.0.tgz` installed, served the packaged
  Operator, and started the packaged CLI bins.
- `git diff --check` against the final base: exit 0. Historical CHANGELOG
  byte comparison from `[0.27.0]` through the end: identical to the final
  base.
- Test budget on the prep diff: 0 test lines, 1 added product line in
  `src` and `scripts`, 0 new test files.
- Hosted CI and merge-commit prepublish gate: pending. No publication or
  installed upgrade has run.

## Publication

Publish candidate merge SHA: pending.

| Order | Name | Shasum | Integrity | File count |
|---|---|---|---|---|
| 1 | `repo-harness-operator-web@0.28.0` | pending | pending | pending |
| 2 | `repo-harness@0.28.0` | pending | pending | pending |

Record local tarball values and registry readback for each field before
marking publication complete. Tag and GitHub Release: pending.

## Post-publish checks

- In a disposable HOME and BUN_INSTALL, run `bun x repo-harness@0.28.0
  install --plugins operator`, start `repo-harness operator serve` and
  verify that `/healthz` reports 0.28.0 and `GET /` returns 200. Result:
  pending.
- Run `bash scripts/check-release-published.sh 0.28.0`. Result: pending.
- On the owner machine, run the upgrade command. Record the seats routing
  migration, the installed hc version and the archctx entry. Result: pending.

## Rollback

Before publication, close the prep PR or revert its merge. After
publication, retain the published tag and use a new patch release for a
correction. A 0.27.0 CLI refuses the migrated `seats.routing` keys with
`seats_config_invalid`.
