# repo-harness 0.25.2 publication record

## Scope and authority

- Release-prep base: `origin/main`
  `8f40c07a5373366209e77bb647c85cde4382327c` (#1493, projection refresh
  for main `ead86532d`). The release-prep branch merges this base with a
  merge commit and no rebase. This is the final release base. The last
  product change in the range is #1470 (`a6732ecbd`).
- Source commit: the head of the release-prep PR. The publish candidate is
  the merge commit of that PR on `origin/main`. The owner records it below
  before publish.
- Previous release: 0.25.1 on npm and in Git. Tag `v0.25.1`, annotated tag
  object `2eeb8ae4e6330b5eeb543b9ab13efa9a27e76072`, target
  `0765762aa0ec3f494fe77ac10468c09735f55477`.
- Merged range: `v0.25.1..8f40c07a5`; 8 first-parent commits and
  29 commits in total (`git rev-list --count`). Batch merge #1498
  keeps the member commits of #1462, #1468, #1497 and #1467.
- The npm package goes from 0.25.1 to 0.25.2. `package.json`,
  `assets/skill-version.json` (version and template version), README and the
  operator bot fixture show 0.25.2.
- `archctx` and `archctx-contracts` stay at the locked exact 0.11.1. The
  release-prep PR changes no dependency version.
- Publish status: tagged and released on GitHub; not published to npm (owner
  choice, superseded by 0.25.3).
- Hold reason: none.

### Owner decision

The owner set 0.25.2 to the small lanes only (decision F3 on #1309): #1450
(PR-1a #1469, PR-1b #1467), #1443, #1458, #1459, #1460 and #1461. #1287
step 2 and later, the herdr-app cutover and B2 (#1474) go into later 0.25.x
patches. The owner runs `npm publish`; the agent does not tag, publish or
create a GitHub release.

## Cause of the patch

- Install fixes: the Skills CLI lock by `XDG_STATE_HOME` (#1443, #1465) and
  the Waza shared rules on a fresh install (#1458, #1470).
- Doctor: `na` for skill paths that a single-target install never touched
  (#1459, #1464).
- Operator: Dot review threads from Slack at `GET /api/v1/bot-reviews` and
  on the Bots page (#1450, #1469, #1467); cleanup observation on Apple
  arm64 (#1461, #1468).
- Rules: the peer collaboration rules name only herdr-core (#1460, #1462,
  test #1500).
- CI report: the external label for a provider 5xx on the initial run read
  (#1471, #1495).
- #1497 (the 0.25.1 release record) and #1498 (batch integration) carry no
  user-visible change.
- The full list is in `docs/CHANGELOG.md`, section `[0.25.2]`.

## Upgrade steps for users

- From 0.25.1: run `repo-harness update`, then `repo-harness doctor`.
- The update refreshes the managed Global Working Rules blocks in
  `~/.claude/CLAUDE.md` and `~/.codex/AGENTS.md`. The Peer Harness
  Collaboration rules then name only herdr-core (`hc`, `herdr-app`).
  repo-harness keeps a copy of each changed file first (#1462).
- A relative `XDG_STATE_HOME` stops `install` and `uninstall` with
  `XDG_STATE_HOME must be an absolute path: <value>`, before any write. Set
  it to an absolute path or unset it, then run the command again (#1465).
  `update` still checks this value after it takes the runtime transaction
  lock (#1502).
- Optional: to see Dot reviews on the Bots page, write
  `~/.repo-harness/slack.local.json` with mode `0600` and register the Dot
  Bot with its `slack_bot_id` (#1469).

## Hosted CI

- Daily dispatch run 41503838293 on `0765762aa` (main after #1466):
  success at 2026-11-02T18:58:34Z. 14 jobs passed. 3 PR-only jobs were
  skipped by design.
- The Daily run did not run on `8f40c07a5`. The commits after `0765762aa`
  are #1464, #1469, #1498, #1495, #1500, #1465, #1470 and #1493. Push CI
  run 41523515770 on `a6732ecbd` passed. Push CI run 41526662942 on
  `8f40c07a5` passed.
- The release-prep PR needs green `Required / CI` on its head before merge.

## Acceptance environment

- macOS 26.5 arm64, Bun 1.4.3, Node 24.18.0.
- `bun install --frozen-lockfile` in a fresh release worktree on
  `chore/release-0.25.2`.
- First subject: commit `a92eb46a6` on base `a6732ecbd`, with the version and
  changelog edits of the release-prep PR.
- `bun run check:release`: exit 0. `[helpers] projection OK`; expensive
  release lane `tests/harness-benchmark-matrix.test.ts` 31 pass, 0 fail;
  `[tarball-smoke] OK: repo-harness-0.25.2.tgz installs, serves the packaged
  Operator, and packaged CLI bins start`; `[release] OK: npm package gate
  passed.` 0.25.2 is unpublished.
- `bun run check:type`: exit 0.
- Version-surface tests: `bun run test:files tests/skill-version.test.ts
  tests/installed-copy-sync.test.ts
  tests/operator-web/operator-architecture.test.tsx
  tests/operator-web/operator-bots-page.test.tsx --timeout 60000
  --max-concurrency 1`: 10, 29, 32 and 14 pass, 0 fail. `grep -rln
  "0\.25\.1" tests` has no hit, so no test pins the old version.
- Architecture projection: on `a6732ecbd`, `bash scripts/check-ci.sh
  architecture` exited 1 with `human-action-required` for
  `docs/architecture/modules/runtime-harness/operator.md`
  (`unresolved-major-change`, model change of #1469). Boundary question
  https://github.com/Ancienttwo/repo-harness/issues/1309#issuecomment-6588447325;
  decision option A: #1493 merges first. After the merge of `8f40c07a5`,
  the same check exits 0: `renderEquivalent: true`, `differingPaths: []`,
  `[ci] OK`.
- Final subject: merge commit `5cc27e449` of `8f40c07a5` into the branch.
  `bun run check:release`: exit 0, `[release] OK`; expensive lane 31 pass,
  0 fail; tarball smoke OK. #1493 changes only
  `docs/architecture/.projection-manifest.json` and `operator.md`, so the
  other first-subject results still apply.

## Release readiness items

- Consumer architecture smoke: `bun run test:files tests/hook-runtime.test.ts
  -t "#850"`: 2 pass, 0 fail. This includes the test "a registry consumer
  without code facts or a projection manifest gets one architecture line
  (#850)".
- Skill eval evidence: unavailable for 0.25.2. The only report,
  `evals/benchmark.md`, is from 2026-06-14 (0.5.1): `full_test_count` 4,
  `dry_run_ratio` 0.0%, `grader_pass_rate` 56.3% (9/16),
  `effectiveness_authority` authoritative for that old subject only. It does
  not cover 0.25.2. 0.25.2 makes no skill-effectiveness claim.
- Readiness yellow flags: see "Readiness check".
- Known open follow-ups, not in 0.25.2:
  - #1496: an `update` rollback leaves archctx at the candidate version, so
    the restored CLI refuses to run.
  - #1501: the affected-test selection skips the peer-harness test when the
    global working rules change (the cause of the red main that #1500
    fixed).
  - #1502: `update` validates `XDG_STATE_HOME` after it takes the runtime
    transaction lock.

## Readiness check

### Subject and commands

- Candidate: the release worktree at `a92eb46a6`, after `bun install
  --frozen-lockfile` and the CodeGraph index of the architecture check.
- Real HOME, read-only by contract, with `CLAUDECODE`, `AI_AGENT`, `AGENT`,
  `REPL_ID` and `REPO_HARNESS_SOURCE_ROOT` removed and `TMPDIR=/tmp`:
  - `bun src/cli/index.ts setup check --target both --check-updates --json`:
    exit 1, `status: blocked`; 35 ok, 3 warn, 1 fail, 2 na, 4 needs_agent.
    The fail is `doctor.pi-herdr-integration` (flag 1).
  - `bash scripts/check-agent-tooling.sh --json --host both
    --check-updates`: exit 0.
  - `bun src/cli/index.ts security scan --json`: exit 0, `status: warn`,
    2 findings.
  - `bun src/cli/index.ts upgrade --json` (no `--apply`): exit 1 by design,
    because leftovers exist; 41 items, 23 refresh and 18 report. With a
    temporary HOME: exit 0, 0 items.
- Temporary HOME: `bun src/cli/index.ts run check-deploy-sql-order`:
  exit 0, `[deploy-sql] OK`.
- `git check-ignore -v _ops/`: `.gitignore:46:_ops/`. `git ls-files _ops`:
  0 tracked files.

### Yellow flags

Each flag is host state of the acceptance host, not package content. The
owner accepts or repairs each flag before publish.

1. `doctor.pi-herdr-integration` fails: `PI_HERDR_INTEGRATION_OUTDATED`
   (v8 < v9) in `~/.pi/agent/extensions/herdr-agent-state.ts`. Repair, an
   explicit user step: `herdr integration install pi`.
2. Global rules managed blocks are stale (`global-rules.claude`,
   `global-rules.codex`). #1462 changes these rules. Repair after
   publication: `repo-harness update`.
3. Security config: 2 warn findings, the first `unmanaged-hook-command` in
   `~/.claude/settings.json`. Repair: a reviewed exception for each in
   `~/.repo-harness/config.json`.
4. `runtime.herdr` is unavailable and `tooling.herdr_skill` differs from the
   binary CLI reference. The host uses herdr-core (`hc`). Repair: install or
   repair classic Herdr, then `repo-harness install`.
5. Waza update available and Skills CLI missing. These are external,
   optional tools. Repair: the Waza upgrade command from
   `check-agent-tooling.sh`, then `repo-harness install --target both`.
6. Leftovers: 41 items, 23 refresh and 18 report. 0 with a temporary HOME.
   Repair after publication: `repo-harness update`, then
   `repo-harness upgrade`.
7. Skill eval evidence unavailable for 0.25.2 (see above).

## Publication

- Merge the release-prep PR only after green `Required / CI` on its head.
- Owner command: `npm publish` from the merge commit after the PR merges.
- The owner records the publish candidate, the npm version, the Git tag and
  the published tarball digest here, then runs
  `bun run check:release-published`.

  - Publish candidate: `801506036505c8f561723459466b4962557297e6` (main after #1511).
  - npm version: none. The owner did not run `npm publish` for 0.25.2.
    `npm view repo-harness versions` goes from 0.25.1 to 0.25.3. 0.25.3
    contains the 0.25.2 changes.
  - Git tag: annotated `v0.25.2`, tag object
    `f4fb79894f57cc54dbbb83bdeb3e9ebb03a58350`, on `801506036`; GitHub Release
    https://github.com/Ancienttwo/repo-harness/releases/tag/v0.25.2, created
    2026-11-03T09:06:39Z, published 2026-11-03T09:06:43Z. The release body
    starts "Not published to npm. Its changes ship in 0.25.3. Install 0.25.3."
  - Published tarball digest: none, because no npm package exists.
  - `bun run check:release-published`: not applicable, because the check
    reads the npm registry.

### Yellow flag acceptance

- Flags 1, 2, 3, 5, 6 and 7: the owner accepted them as host state
  ("全部接受，照命令发布", at about 2026-11-03T04:31Z).
- Flag 4: accepted by decision M5 on #1309
  (https://github.com/Ancienttwo/repo-harness/issues/1309#issuecomment-6594688563).
  Until G37 #1480 merges, the 0.25.2 readiness check still checks classic
  Herdr.
- Repairs after publication, the owner's choice: `repo-harness update` and
  `repo-harness upgrade` for flags 2 and 6. The two hook exceptions of flag 3
  get their own review later.
