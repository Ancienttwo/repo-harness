# repo-harness 0.27.0 publication record

## Scope and authority

- Final base: `ddadb347663e1d58ec254725a624af4e465462b1` on `main`.
- Previous release: `v0.26.6`. Range:
  `v0.26.6..ddadb347663e1d58ec254725a624af4e465462b1`.
- Release date and record prefix: UTC 2026-11-07, from `date -u`.
- The core package, console package, skill and template stamps, README and
  Operator fixture move to 0.27.0. This prep changes no dependency or lockfile.
- Publish status: both packages were published on 2026-11-07, console first,
  then core, with `npm publish --auth-type=web` (Q3a–Q3c, #1287).

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
- Prep head `75032082c`: on macOS 26.5 / Darwin 25.5.0 arm64, Bun 1.4.3
  and Node 24.22.1, `bun install --frozen-lockfile` and
  `bun run check:release` exited 0. The console dist and console
  `node_modules` link were absent before the run. The gate reported
  `[ci] OK` and `[release] OK: npm package gate passed.`
- The tarball smoke loaded 32 MCP modules with all selected and 0 with an
  empty selection. Operator loaded 86 modules with all selected and served;
  it refused an empty selection. Status, seats, quota and hook routes each
  loaded 0 modules. The 91-module hook bundle held 0; peer-runtime loaded 4
  when selected. `repo-harness-0.27.0.tgz` installed, served the packaged
  Operator, and started the packaged CLI bins.
- CI Affected tests shard 2/3 failed on `75032082c` (run 42345387577):
  #1912 pinned 0.26.6 in `tests/bootstrap-files.test.ts`. Prep head
  `0d3ecd234ecdeeaf70da732d588bd3b75b3c79f3` changed the test to read the
  copied `package.json` version. On that head, the test had 15 pass and
  0 fail, `bun run check:type` exited 0, and Required / CI succeeded.
  Codex read-only review (t8c, gpt-6.1-terra high, same-family) passed
  with no findings. PR #1943 records a test budget exception: 11 test
  lines and 1 product line.
- On a clean checkout of `541df3689` after `bun install --frozen-lockfile`,
  the console prepublish gate exited 0 with
  `npm_package_name=repo-harness-operator-web`. Before console publication,
  the core gate refused with `unable to verify
  repo-harness-operator-web@0.27.0, required before repo-harness publication.`
  This was the expected order check.

## Publication

Publish candidate: PR #1943 merge `541df3689a4fef496e766000e33c71c82af04a98`,
with single parent `ddadb347663e1d58ec254725a624af4e465462b1`.

| Order | Name | Shasum | Integrity | File count |
|---|---|---|---|---|
| 1 | `repo-harness-operator-web@0.27.0` | `4185bf375e83dc0df3484c66fe962d57229f642e` | `sha512-mn+k0M6dNBJsVg11XKQqS12O61CMSFJ64kn/3GZTktizoaF8wluoIi8yRdHTy+4CXNhLrGwZl+sNWb1LYHlp7Q==` | 127 |
| 2 | `repo-harness@0.27.0` | `d2e837bbf3514c64535fb43118918e24b914f2d3` | `sha512-NNWPmAUCPLkln/SjordqcDGNaq+VPetRk4pvXxUmO7ocAs/LSPvzXo6z66iEbj9BznL/c3prHgaXOXb6HKccWQ==` | 704 |

The table values match both local `npm pack` tarballs and registry readback.
The console tarball was 1.45 MB packed and 5.48 MB unpacked; core was
5.87 MB packed and 11.42 MB unpacked. Both registry `latest` tags are 0.27.0.

The owner was logged in as `ancienttwo`. The first console publish without
a TTY exited EOTP and published nothing. Under `script`, npm displayed the
web approval link; the owner approved it and the console publish succeeded
after its prepublish gate passed. The console appeared on npm about 135
seconds later. Core publication reused the web session, passed its gate and
succeeded without a second link. Both publish outputs matched the table
shasum and file count.

Annotated tag `v0.27.0`, object `44f08ebf2adbf05aac1c675d50e3fb6765b78df6`,
points to `541df3689` and was pushed after owner approval. The
[GitHub Release](https://github.com/Ancienttwo/repo-harness/releases/tag/v0.27.0)
is titled `repo-harness 0.27.0` and uses CHANGELOG `[0.27.0]` from that commit.

## Post-publish checks

- In a disposable HOME and BUN_INSTALL with a neutral working directory,
  `bun add -g repo-harness@0.27.0 --no-cache` and `repo-harness install
  --plugins operator --no-cli --no-external-skills --no-codegraph` succeeded.
  Install state recorded protocol 3, selection `[operator]` and Operator
  0.27.0; the installed console was 0.27.0. On port 4417, `/healthz`
  returned `{"ok":true,"service":"repo-harness-operator","protocol":2,"version":"0.27.0"}`;
  `GET /` and `/assets/index-B3Xkwmft.js` returned 200. The asset was in
  the installed console `dist/assets/`. This run skipped the CLI install
  step, so it does not cover the bunx bootstrap path that #1892 names.
  A first attempt from a repository working directory refused before writing:
  that repository policy required the architecture plugin.
- The #1892 bunx path, run separately: disposable HOME and BUN_INSTALL, a
  neutral working directory, and a PATH with only a `bun` 1.4.3 link and
  system directories (`repo-harness` not on PATH before the run).
  `bun x repo-harness@0.27.0 install --plugins operator --no-external-skills
  --no-codegraph` exited 0 with `install repo-harness CLI -
  spec=repo-harness@0.27.0` and `ensure operator console - version=0.27.0`.
  The global CLI link was `<BUN_INSTALL>/bin/repo-harness` ->
  `../install/global/node_modules/repo-harness/src/cli/index.ts` (not a
  TMPDIR path); `repo-harness --version` read 0.27.0. Both installed
  package manifests read 0.27.0. Install state recorded protocol 3, selection
  `[operator]` and Operator 0.27.0. On port 4418, `/healthz` reported 0.27.0,
  `GET /` and `/assets/index-B3Xkwmft.js` returned 200, and the asset was in
  the installed console `dist/assets/`. The server was stopped after the
  probe. This closes the #1892 probe gap.
- On the `541df3689` checkout, `bash scripts/check-release-published.sh
  0.27.0` exited 0. It checked both packages, validated the
  `published_tarball`, `clean_install` and `installed_hook_readback` runtime
  evidence receipt, and reported registry, dist-tag, tarball, tag and local
  version files agree.
- The owner approved and t2 ran `bun add -g repo-harness@0.27.0 --no-cache &&
  repo-harness update --version 0.27.0`; it exited 0. It wrote the complete
  seats configuration and refreshed global working rules. Install state
  recorded protocol 3, selection `all`, transaction
  `2b59bcc5-3e40-4d90-84bb-7825dba707d5`, applied
  `2026-11-07T07:18:37Z`. Architecture, cross-review, mcp, operator,
  peer-runtime, pi, platform, product and strategy-memory plugins and the
  console were 0.27.0. Status reported 0.27.0, Codex 5/5 and Claude 6/6
  managed entries; seats routing mode was `standard`.
- The rules refresh reverted an owner-edited Sub-agent Delegation line.
  The line was restored from the update backup. Follow-up: #1945.
- In a scratch HOME and opted-in repository with non-login PATH
  `/usr/bin:/bin:/usr/sbin:/sbin`, Claude `Stop --route default` exited 0;
  `PreToolUse --route edit` for a Write to `_ops/x.md` exited 2 with
  `[OpsPrivateGuard]`. With the real HOME, Operator `/healthz` reported
  0.27.0 and `GET /` returned 200. The server was stopped after the probe.

## Rollback

Before publication, close the prep PR or revert its merge. An older CLI
ignores the console package; `bun remove -g repo-harness-operator-web`
removes it. After publication, retain the published tag and use a new
patch release for a correction.
