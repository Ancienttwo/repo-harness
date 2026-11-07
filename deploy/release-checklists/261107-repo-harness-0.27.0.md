# repo-harness 0.27.0 publication record

## Scope and authority

- Final base: `ddadb347663e1d58ec254725a624af4e465462b1` on `main`.
- Previous release: `v0.26.6`. Range:
  `v0.26.6..ddadb347663e1d58ec254725a624af4e465462b1`.
- Release date and record prefix: UTC 2026-11-07, from `date -u`.
- The core package, console package, skill and template stamps, README and
  Operator fixture move to 0.27.0. This prep changes no dependency or lockfile.
- Publish status: pending. The owner publishes by hand with
  `npm publish --auth-type=web`, console first, then core (Q3a–Q3c, #1287).
  This draft authorizes no publication, tag or GitHub Release.

## Cause of the release

The Operator console now ships as a separate unscoped package. The CLI
installs the matching version when `operator` is selected. Release gates
check both packages at the same version. This release also adds quota-aware
seats routing and Operator language settings.

Each first-parent range commit was checked with `git show --stat` and its
CHANGELOG diff. None means the commit added no CHANGELOG entry.

| PR | Commit | Section in 0.27.0 | Change | Original CHANGELOG reference |
|---|---|---|---|---|
| #1882 | `0571e9b52` | Documentation | Architecture projection after 0.26.6 | None |
| #1908 | `eef4d81f8` | Changed, Rollback | Separate console package | #1891 |
| #1911 | `0d1ae80f5` | Changed | Relay selection uses hc core HOME | #1906 |
| #1913 | `691cc6fa3` | Documentation | Architecture map refresh | None |
| #1912 | `9f5a8d6a9` | Changed | Gate both packages as one release | #1893 |
| #1916 | `54a9d8330` | Changed, Upgrade | Install selected console | #1892 |
| #1922 | `3e7f002f9` | Fixed | Follow documentation language policy | None |
| #1915 | `57fdffa2e` | Documentation | 0.26.6 publication and upgrade evidence | None |
| #1923 | `e997b1087` | Fixed | Use explicit candidate projection environment | None |
| #1921 | `d3981e4c8` | Changed | Operator language settings routes | None |
| #1930 | `f27ddc483` | Documentation | G10 review isolation research | None |
| #1929 | `7c3a91208` | Fixed | Safe repository policy file access | None |
| #1937 | `369ec453b` | Changed | Console language controls | None |
| #1938 | `5d30b59c2` | Fixed | Exhaustive review runtime mappings | None |
| #1939 | `309ce4556` | Documentation | Null actual model behavior | None |
| #1910 | `eead702fb` | Documentation | Architecture projection refresh | None |
| #1940 | `0db6e9298` | Changed | Architecture cards with five signal slots | None |
| #1928 | `ddadb3476` | Changed, Upgrade | Quota-aware seats routing and migration | #1925 |

Every range PR appears in CHANGELOG `[0.27.0]`. The `[0.26.6]` and
older sections remain byte-identical to the final base.

## Publication steps for the owner

1. Pin the prep head. Run `bun run check:release` on the
   host after clearing `packages/operator-web/dist` and
   `node_modules/repo-harness-operator-web`. Record the result and require
   green hosted CI before merge.
2. Record the merge SHA. Run `bash scripts/check-npm-release.sh --prepublish`
   on the exact merge commit and record its result.
3. Pack both packages and record their local tarball values below. The owner
   publishes `repo-harness-operator-web` first, then `repo-harness`, by hand
   with `npm publish --auth-type=web`.
4. Read both versions from npm and compare their shasum, integrity and file
   counts with the local tarballs. Record the results below.
5. After owner approval, tag the publish candidate and create the GitHub
   Release from CHANGELOG `[0.27.0]`. Run the post-publish checks below.

## Upgrade steps for users

```bash
bun add -g repo-harness@0.27.0 --no-cache && repo-harness update --version 0.27.0
```

Update installs the matching console when `operator` is selected. Restart
the Operator server and reload the page. Update migrates a stored seats
config before seats or quota routes read it.

## Acceptance environment

- Subject: `ddadb3476` plus the prep diff. Offline Codex sandbox,
  Darwin 25.5.0 arm64, Bun 1.4.3, Node 24.22.1.
- `bun run check:type`: exit 0.
- `bun run test:files tests/skill-version.test.ts
  tests/operator-web/operator-bots-page.test.tsx --timeout 60000
  --max-concurrency 1`: exit 0; 24 pass, 0 fail, 299 assertions.
- `git diff --check`: exit 0. Historical CHANGELOG byte comparison from
  `[0.26.6]` through the end: identical to the final base.
- Test budget on the prep diff: 0 added test lines, 1 added product line
  in `src` and `scripts`, 0 new test files. No assertions changed.
- Host `bun run check:release`, hosted CI and merge-commit prepublish gate:
  pending. No publication or installed upgrade has run in this draft.

## Publication

Publish candidate merge SHA: pending.

| Order | Name | Shasum | Integrity | File count |
|---|---|---|---|---|
| 1 | `repo-harness-operator-web@0.27.0` | pending | pending | pending |
| 2 | `repo-harness@0.27.0` | pending | pending | pending |

Record local tarball values and registry readback for each field before
marking publication complete. Tag and GitHub Release: pending.

## Post-publish checks

- In an isolated environment, run `bunx repo-harness@0.27.0 install` and
  select `operator`. Run `repo-harness operator serve` and verify that
  `GET /` returns 200. Record the command, result and environment. This
  closes the installed-console probe gap from #1892. Result: pending.
- Run `bash scripts/check-release-published.sh 0.27.0`. Result: pending.

## Rollback

Before publication, close the prep PR or revert its merge. An older CLI
ignores the console package; `bun remove -g repo-harness-operator-web`
removes it. After publication, retain the published tag and use a new
patch release for a correction.
