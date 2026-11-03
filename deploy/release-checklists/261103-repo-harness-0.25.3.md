# repo-harness 0.25.3 publication record

## Scope and authority

- Release-prep base: `origin/main`
  `7ed64f8489d12069dba7b0f4bfadb1d57b0ad675` (#1575, the #1571 render of
  generated architecture docs). The release-prep branch merges this base with
  merge commit `a9491c3d9` and no rebase. This is the final release base. The
  last product change in the range is #1574 (`240f56153`).
- Source commit: the head of the release-prep PR. The publish candidate is
  the merge commit of that PR on `origin/main`. The owner records it below
  before publish.
- Previous release: 0.25.2, from the release-prep merge
  `801506036505c8f561723459466b4962557297e6` (#1511). The owner tagged and
  released 0.25.2 on GitHub and did not publish it to npm (owner choice,
  superseded by 0.25.3).
  - Tag `v0.25.2`: annotated. Tag object:
    `f4fb79894f57cc54dbbb83bdeb3e9ebb03a58350`. Target:
    `801506036505c8f561723459466b4962557297e6`.
- Merged range: `801506036..7ed64f848`: 35 first-parent commits and
  54 commits in total (`git rev-list --count`). Batch merge #1517 keeps the
  member commits of #1491 and #1492.
- The npm package goes from 0.25.1 to 0.25.3. npm never published 0.25.2,
  so 0.25.3 also carries every 0.25.2 change to npm users. `package.json`,
  `assets/skill-version.json` (version and template version), README and the
  operator bot fixture show 0.25.3.
- `archctx` and `archctx-contracts` stay at the locked exact 0.11.1. The
  release-prep PR changes no dependency version.
- Publish status: published 2026-11-03 by the owner. The `prepublishOnly`
  gate passed first. Then the registry upload ran with `--ignore-scripts`
  after npm web authentication. dist-tag `latest`.
  `bun run check:release-published` passed.
- Hold reason: none.

### Owner decision

0.25.3 is the G37 release (decision M12 on #1309,
https://github.com/Ancienttwo/repo-harness/issues/1309#issuecomment-6594688563):
G37 first, then board v2. Milestone 0.25.3 holds #1474 and its 11 children,
all closed, plus #1573 (merged in #1574) and #1571 (architecture render,
merged before this PR). The 0.25.4 work is held and is not in this release:
#1519 (#1504) and #1541 (#1533) are not merged. The owner runs
`npm publish`; the agent does not tag, publish or create a GitHub release.

## Cause of the patch

- herdr-core migration (G37, #1474): one typed hc transport (#1491); task
  sessions on hc terminals (#1499); review hosts with `--launch herdr-app`
  (#1525); the operator console reads hc (#1529); notify through an hc relay
  (#1494); the herdr skill from `hc --skill` (#1559); readiness requires
  `hc` and the classic Herdr pin is removed (#1555, #1574); the hc 0.1.17
  pin with checksum-pinned release assets (#1492); distributed guidance and
  the architecture model name only herdr-core (#1560, #1563, #1557).
- Board and seats: the board projection and CLI (#1518), the board endpoint
  and Main board (#1536), the seats config and Seats page (#1513, #1547),
  `seats argv` (#1521), pane and tab names (#1554, #1567), and
  `publication batch build` (#1515).
- MCP: typed `latest_checks` records (#1548), no executor `.ai/harness`
  write grants and realpath glob checks (#1562), dangling parent links
  refused (#1566).
- Fixes: update rollback restores hoisted archctx (#1522), notify secret keys
  stay out of hc children (#1524), relative `XDG_STATE_HOME` refused before
  the runtime lock (#1526), capture signal listeners before spawn (#1551),
  CI test selection for the global working rules (#1520).
- Tests and CI: #1528, #1569, #1572, #1545.
- #1512 and #1575 (projection refreshes) and #1517 (batch integration of #1491 and
  #1492) carry no user-visible change.
- The full list is in `docs/CHANGELOG.md`, section `[0.25.3]`. The
  release-prep PR also moves the three #1494 entries out of the shipped
  `[0.25.1]` section into `[0.25.3]`, and restores the 0.25.1 text "minimum
  0.1.16" that #1494 had changed.

## Upgrade steps for users

- Install herdr-core `hc` 0.1.17 or later, through Herdr.app or a
  herdr-core release, and check it with `hc --version`. Readiness
  (`check-agent-tooling.sh --strict-readiness`, `setup check`) fails when
  `hc` is missing, unusable or below
  `external_tooling.herdr_core.min_version` (#1555). The
  `external_tooling.herdr` pin is removed; delete that key from a downstream
  policy.
- From 0.25.2 or 0.25.1: run `repo-harness update`, then
  `repo-harness doctor`. The update builds the herdr skill from `hc --skill`
  (#1559) and refreshes the managed Global Working Rules blocks, which now
  name only herdr-core (#1560). repo-harness keeps a copy of each changed
  file first.
- Herdr notify: run `repo-harness herdr notify install` again. Remove the old
  classic plugin with `herdr plugin unlink aimpact.webhook-notify` while
  classic Herdr is still installed (#1494).
- A task session from classic Herdr fails with
  `task_agent_classic_herdr_record_retired`. Archive the record and start the
  session again (#1499).
- Operator runtime config: write `"kind": "herdr-core"`, and update the
  browser and the server together (#1529).

## Hosted CI

- Daily run 41560045649 on `eeb43d27b` (main after #1529), attempt 2:
  failure. Only the job "Daily architecture freshness" failed. #1571 owns
  that render. The last green Daily run is 41503838293 on `0765762aa`
  (before 0.25.2).
- Push CI run 41601998066 on `240f56153` passed. Push CI run 41603308041
  on `7ed64f848` passed. Every push CI run on main from `4660e4b86` to
  `7ed64f848` passed. The Daily run did not run after #1575.
- The release-prep PR needs green `Required / CI` on its head before merge.

## Acceptance environment

- macOS 26.5 arm64, Bun 1.4.3, Node 24.18.0.
- `bun install --frozen-lockfile` in a fresh release worktree on
  `chore/release-0.25.3`.
- Guard: `hc`, `herdr-app` and `herdr` shims that log the call and exit 97
  are first on PATH for every test, release and readiness run. PATH holds
  only explicit directories (guard, `node_modules/.bin`, a Bun link,
  `/opt/homebrew/opt/node@24/bin`, `/opt/homebrew/bin`, `/usr/bin`, `/bin`,
  `/usr/sbin`, `/sbin`), not `~/.local/bin`. No run called the owner's
  `hc`.
- First subject: commit `a74d046b4` on base `240f56153`, with the version and
  changelog edits of the release-prep PR.
- `bun run check:release`: exit 0. `[helpers] projection OK`; expensive
  release lane `tests/harness-benchmark-matrix.test.ts` 31 pass, 0 fail;
  `[tarball-smoke] OK: repo-harness-0.25.3.tgz installs, serves the packaged
  Operator, and packaged CLI bins start`; `[release] OK: npm package gate
  passed.` Guard calls: 1 (`hc server status --json`, from the packaged
  Operator execution-state read). The gate does not need a real `hc`.
- `bun run check:type`: exit 0.
- Version-surface tests: `bun run test:files tests/skill-version.test.ts
  tests/installed-copy-sync.test.ts
  tests/operator-web/operator-architecture.test.tsx
  tests/operator-web/operator-bots-page.test.tsx --timeout 60000
  --max-concurrency 1`: 10, 29, 32 and 14 pass, 0 fail. Guard calls: 0.
- `grep -rln "0\.25\.2" tests` finds 3 files: `tests/board.test.ts` and two
  board fixtures. Each hit is issue or PR text that names the 0.25.2
  release. No test pins the old package version.
- Final subject: merge commit `a9491c3d9` of `7ed64f848` into the branch.
  - `bash scripts/check-ci.sh architecture`: exit 0, `renderEquivalent:
    true`, `differingPaths: []`, `[ci] OK`. Guard calls: 0.
  - `bun run check:release`: exit 0, `[release] OK`; expensive lane 31 pass,
    0 fail; tarball smoke OK. Guard calls: 1 (`hc server status --json`).
  - `bun run check:type`: exit 0. Version-surface tests: 10, 29, 32 and 14
    pass, 0 fail. Guard calls: 0.
  - #1575 changes only `docs/architecture/.projection-manifest.json` and
    `hook-adapters.md`.

## Release readiness items

- Consumer architecture smoke: `bun run test:files tests/hook-runtime.test.ts
  -t "#850" --timeout 60000 --max-concurrency 1`: 2 pass, 0 fail. This
  includes the test "a registry consumer without code facts or a projection
  manifest gets one architecture line (#850)". Final-subject run at head
  `7d9809b4a` (`a9491c3d9` plus filing commits only). Guard calls: 0.
- Skill eval evidence: unavailable for 0.25.3. The only report,
  `evals/benchmark.md`, is from 2026-06-14 (0.5.1): `full_test_count` 4,
  `dry_run_ratio` 0.0%, `grader_pass_rate` 56.3% (9/16),
  `effectiveness_authority` authoritative for that old subject only. It does
  not cover 0.25.3. 0.25.3 makes no skill-effectiveness claim.
- Readiness yellow flags: see "Readiness check".
- Known open follow-ups, not in 0.25.3:
  - #1568: the closeout supervisor hard-timeout test times out while it
    waits for `supervisor-pid` on ubuntu-26.04.
  - #1519 (#1504): issue-flow plan data on GitHub native fields. Held for
    0.25.4.
  - #1541 (#1533): one registry repository list and removal of the Fleet
    snapshot. Held for 0.25.4.

## Readiness check

### Subject and commands

- Candidate: the release worktree at `a9491c3d9` (final subject) for
  `setup check`, after `bun install --frozen-lockfile` and the CodeGraph
  index of the architecture check, with the guard first on PATH. The other
  commands ran at `a74d046b4`; #1575 changes no input of them.
- Real HOME, read-only by contract, with `CLAUDECODE`, `AI_AGENT`, `AGENT`,
  `REPL_ID`, `REPO_HARNESS_SOURCE_ROOT`, `HC_*` and `HERDR_ENV` removed and
  `TMPDIR=/tmp`:
  - `bun src/cli/index.ts setup check --target both --check-updates --json`:
    exit 0, `status: attention`; 33 ok, 4 warn, 0 fail, 3 na,
    4 needs_agent. Guard calls: 2 (`hc --version`). At `a74d046b4`, before
    the CodeGraph index, it exited 1 with one fail, `doctor.codegraph-index`
    (`index=not-initialized`).
  - `bash scripts/check-agent-tooling.sh --json --host both
    --check-updates`: exit 0.
  - `bun src/cli/index.ts security scan --json`: exit 0, `status: warn`,
    2 findings.
  - `bun src/cli/index.ts upgrade --json` (no `--apply`): exit 1 by design,
    because leftovers exist; 41 items, 23 refresh and 18 report. With a
    temporary HOME: exit 0, 0 items.
  - Guard calls at `a74d046b4`: 3 (`hc --version`).
- Temporary HOME: `bun src/cli/index.ts run check-deploy-sql-order`:
  exit 0, `[deploy-sql] OK`.
- `git check-ignore -v _ops/`: `.gitignore:46:_ops/`. `git ls-files _ops`:
  0 tracked files.

### Yellow flags

Each flag is host state of the acceptance host or of the guard, not package
content. The owner accepts or repairs each flag before publish.

1. `runtime.herdr_core` is `unavailable (required)` and `tooling.herdr_skill`
   is `unavailable`. The guard `hc` answers every call with exit 97, so these
   rows do not describe the owner's `hc`. Repair, an owner step: run
   `setup check` with the real `hc` 0.1.17 or later, then
   `repo-harness update`.
2. Global rules managed blocks are stale (`global-rules.claude`,
   `global-rules.codex`). #1560 changes these rules. Repair after
   publication: `repo-harness update`.
3. `repo-harness` and `repo-harness-hook` are not on PATH
   (`doctor.cli-on-path`). The guard PATH leaves out the global install by
   design. Repair: none for the release; the owner's PATH has them.
4. Security config: 2 warn findings, the first `unmanaged-hook-command` in
   `~/.claude/settings.json`. Repair: a reviewed exception for each in
   `~/.repo-harness/config.json`.
5. Waza update available and Skills CLI missing. These are external,
   optional tools. Repair: the Waza upgrade command from
   `check-agent-tooling.sh`, then `repo-harness install --target both`.
6. Leftovers: 41 items, 23 refresh and 18 report. 0 with a temporary HOME.
   Repair after publication: `repo-harness update`, then
   `repo-harness upgrade`.
7. Skill eval evidence unavailable for 0.25.3 (see above).

## Publication

- Merge the release-prep PR only after green `Required / CI` on its head.
- Publish 0.25.2 from `801506036` first and record its tag above.
- Owner command: `npm publish` from the merge commit after the PR merges.
- The owner records the publish candidate, the npm version, the Git tag and
  the published tarball digest here, then runs
  `bun run check:release-published`.

  - Publish candidate: `77abe62d5b96f81d210fc3db4b0d60957aadea62` (main after #1576).
    Its tree equals the release-prep PR head `189448212`. The `prepublishOnly`
    gate passed on this candidate. The registry upload ran with
    `--ignore-scripts` after npm web authentication. The upload tarball has the
    same shasum as the gated tarball.
  - npm version: `repo-harness@0.25.3`, gitHead `77abe62d5b96`, published
    2026-11-03T09:17:08.433Z, 878 files. dist-tag `latest` is 0.25.3.
  - Git tag: annotated `v0.25.3`, tag object
    `8881a80d2ba97375a9a42a891daaeeb3690fd705`, on `77abe62d5`; GitHub Release
    https://github.com/Ancienttwo/repo-harness/releases/tag/v0.25.3, created
    2026-11-03T09:13:07Z, published 2026-11-03T09:13:12Z.
  - Published tarball digest: shasum `1ba984da59f8961adee83c2b5509cc8f0fb02c75`,
    integrity `sha512-9rRlO+BMx7BRglMNRsmTXciwyarwzVa4hFYPmCrM4luBZ7P8bQm6QpbtKtzMVBxeQ1LZqDTjFJjjA/FXhpxN+Q==`.
  - `bun run check:release-published`: exit 0 in 106 s, from
    2026-11-03T09:26:48Z. Last lines: `runtime-evidence-receipt: valid
    published_tarball, clean_install, installed_hook_readback` and
    `[release-published] OK: registry, dist-tag, tarball, tag, and local
    version files agree.`
  - Environment: clean detached worktree at `77abe62d5` after
    `bun install --frozen-lockfile` (540 packages); macOS 26.5 arm64,
    Bun 1.4.3, Node 24.18.0, npm 11.16.0. Guard `hc` and `herdr-app` shims
    (log, exit 97) are first on PATH; the guard log has 0 calls.
