# repo-harness 0.25.1 publication record

## Scope and authority

- Release-prep base: `origin/main` `f95d816d7bdb3aedb517d66f0f74d72fabc23aae`
  (#1463, the #1452 fix round). The release-prep branch merges this base
  with a merge commit and no rebase. This is the final 0.25.1 scope.
- Source commit: the head of the release-prep PR. The publish candidate is
  the merge commit of that PR on `origin/main`. The owner records it below
  before publish.
- Previous release: 0.25.0 on npm and in Git. Tag `v0.25.0`, annotated tag
  object `1a188c7e3998af0409e06352019259d05a41be40`, target
  `aa01147103647326e70829046d244b4b111a33b2`.
- Merged range: `v0.25.0..f95d816d7`; 54 first-parent commits and 128
  commits in total (`git rev-list --count`). Batch merges keep the member
  commits. Each first-parent subject ends with a PR number.
- The npm package goes from 0.25.0 to 0.25.1. `package.json`,
  `assets/skill-version.json` (version and template version), README and the
  operator bot fixture show 0.25.1.
- `archctx` and `archctx-contracts` stay at the locked exact 0.11.1 (#1430).
  The release-prep PR changes no dependency version.
- Publish status: pending owner publish.
- Hold reason: none.

### Owner decision

The owner approved the 0.25.1 release after the gate (#1309). The owner runs
`npm publish`; the agent does not tag, publish or create a GitHub release.

## Cause of the patch

- Removals: the ChatGPT, HTTP, OAuth, coding and orchestrator MCP surface
  (#1354); the engineer, integration and agent-runtime clusters (#1345); the
  manual handoff helpers and MCP `latest_handoff` (#1292).
- Install and update fixes: `update` from any working directory (#1409),
  the `owner/repo#<sha>` pin form (#1445), staging through the `codex`
  provider agent (#1425), Waza host links through `repo-harness install`
  (#1442).
- Publication and CI report: batch merge with a merge commit (#1329), the
  batch rollback boundary (#1373), the batch proof output size (#1383),
  batch member PRs in the daily report (#1360), no false repair issue on a
  provider 5xx (#1452, #1463), bot review threads advisory (#1396).
- Upgrade and init fixes: #1304, #1305, #1307, #1308, #1335, #1410.
- Architecture boundary gate in `check:state-boundaries` (#1357) and the
  archctx 0.11.0 and 0.11.1 pins (#1339, #1430).
- The full list is in `docs/CHANGELOG.md`, section `[0.25.1]`.

## Upgrade steps for users

- From 0.25.0: run `repo-harness update`, then `repo-harness doctor`. The
  doctor lists each retired ChatGPT file, host skill link and
  `[mcp_servers.repo_harness]` block as `retired_chatgpt_state` with a
  removal command. It deletes nothing (#1354).
- Remove the keys that `MCP_CONFIG_RETIRED_FIELD` lists from
  `mcp.local.json`, and the `mcp_client_id` key that
  `BOT_RECORD_RETIRED_FIELD` names in a bot record (#1354).
- Remove or archive by hand a task `binding.json` with `engineer_profile`
  and an inbox receipt with the `agent_runtime_effect` channel. The error
  names each path (#1345).
- Remove local scripts that call `prepare-handoff`,
  `prepare-codex-handoff`, `codex-handoff-resume` or `recovery-view-cli`.
  `repo-harness upgrade` reports such scripts (#1292, #1305).
- Optional: `repo-harness upgrade --apply --include-state-artifacts` removes
  the retired merge-gate state and 0.10.0 archives under `~/.repo-harness/`
  (#1410).

## Hosted CI

- Daily dispatch run 41481770680 on `a5595b15d` (#1368): success at
  2026-11-02T16:38:37Z. 14 jobs passed, including Daily architecture
  freshness, Daily full tests and package, both Daily MCP path matrices,
  Daily governance and the four Native OAR acceptance (macOS) legs. 3
  PR-only jobs were skipped by design.
- The Daily run did not run on `f95d816d7`. The four commits after
  `a5595b15d` are #1454, #1455, #1457 and #1463. Push CI run 41491211995 on
  `14b3ae92b` passed. Push CI run 41497719707 on `f95d816d7` passed.
- The release-prep PR needs green `Required / CI` on its head before merge.

## Acceptance environment

- macOS 26.5 arm64, Bun 1.4.3, Node 24.18.0.
- `bun install --frozen-lockfile` in a fresh release worktree on
  `chore/release-0.25.1`.
- Subject: base `f95d816d7` merged into the release-prep branch, with the
  version, changelog and filing edits of the release-prep PR.
- `bun run check:release`: exit 0. `[helpers] projection OK`; expensive
  release lane `tests/harness-benchmark-matrix.test.ts` 31 pass, 0 fail;
  `[tarball-smoke] OK: repo-harness-0.25.1.tgz installs, serves the packaged
  Operator, and packaged CLI bins start`; `[release] OK: npm package gate
  passed.` 0.25.1 is unpublished.
- `bun run check:type`: exit 0.
- `check:release` and `check:type` ran again after the merge of
  `f95d816d7`, with the same results. `bun run test:files
  tests/ci-report.test.ts --timeout 60000 --max-concurrency 1` (the test
  that #1463 changes): 78 pass, 0 fail. The other results below are from the
  first subject on base `14b3ae92b`. #1463 changes only
  `scripts/report-ci.ts` and its test, so they still apply.
- Version-surface tests: `bun run test:files tests/skill-version.test.ts
  tests/installed-copy-sync.test.ts
  tests/operator-web/operator-architecture.test.tsx --timeout 60000
  --max-concurrency 1`: 10, 29 and 32 pass, 0 fail. No test pins the string
  `0.25.0` as the current version; the remaining `0.25.0` references in
  `src/effects/bot-registry.ts`, `tests/effects/bot-registry.test.ts` and
  `tests/cli/adoption-plan.test.ts` name the 0.25.0 record shape and stay.

## Release readiness items

- Consumer architecture smoke: `tests/hook-runtime.test.ts` test
  "a registry consumer without code facts or a projection manifest gets one
  architecture line (#850)": 1 pass, 0 fail.
- Skill eval evidence: unavailable for 0.25.1. The only report,
  `evals/benchmark.md`, is from 2026-06-14 (0.5.1): `full_test_count` 4,
  `dry_run_ratio` 0.0%, `grader_pass_rate` 56.3% (9/16),
  `effectiveness_authority` authoritative for that old subject only. It does
  not cover 0.25.1. 0.25.1 makes no skill-effectiveness claim.
- Readiness yellow flags: see "Readiness check".

## Readiness check

### Subject and commands

- Candidate: the release worktree, after `bun install --frozen-lockfile`.
- Real HOME, read-only by contract, with `CLAUDECODE`, `AI_AGENT`, `AGENT`,
  `REPL_ID` and `REPO_HARNESS_SOURCE_ROOT` removed and `TMPDIR=/tmp`:
  - `bun src/cli/index.ts setup check --target both --check-updates --json`:
    exit 1, `status: blocked`; 31 ok, 4 warn, 2 fail, 2 n/a, 6 needs_agent.
    The fails are `doctor.codegraph-index` (`index=not-initialized` in the
    new worktree) and `doctor.pi-herdr-integration`.
  - Repair: `bash scripts/ensure-codegraph.sh --init` in the worktree. The
    index is worktree-local and not in the package.
  - The same `setup check` after the repair: exit 1, `status: blocked`;
    34 ok, 4 warn, 1 fail, 2 n/a, 4 needs_agent. The fail is
    `doctor.pi-herdr-integration` (flag 1).
  - `bash scripts/check-agent-tooling.sh --json --host both
    --check-updates`: exit 0.
  - `bun src/cli/index.ts security scan --json`: exit 0, `status: warn`,
    2 findings.
  - `bun src/cli/index.ts upgrade --json` (no `--apply`): exit 1 by design,
    because leftovers exist; 40 items, 23 refresh and 17 report. With a
    temporary HOME: 0 items.
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
   `global-rules.codex`). Repair after publication: `repo-harness update`.
3. Security config: 2 warn findings, the first `unmanaged-hook-command` in
   `~/.claude/settings.json`. Repair: a reviewed exception for each in
   `~/.repo-harness/config.json`.
4. `runtime.herdr` is unavailable and `tooling.herdr_skill` differs from the
   binary CLI reference. The host uses herdr-core (`hc`). Repair: install or
   repair classic Herdr, then `repo-harness install`.
5. Waza update available, Skills CLI missing, and `doctor.skill-projection`
   warns. These are external, optional tools. Repair: the Waza upgrade
   command from `check-agent-tooling.sh`, then `repo-harness install
   --target both`.
6. Leftovers: 40 items, 23 refresh and 17 report. 0 with a temporary HOME.
   Repair after publication: `repo-harness update`, then
   `repo-harness upgrade`.
7. Skill eval evidence unavailable for 0.25.1 (see above).

## Publication

- Merge the release-prep PR only after green `Required / CI` on its head.
- Owner command: `npm publish` from the merge commit after the PR merges.
- The owner records the publish candidate, the npm version, the Git tag and
  the published tarball digest here, then runs
  `bun run check:release-published`.

  - Publish candidate: pending.
  - npm version: pending.
  - Git tag: pending.
  - Published tarball digest: pending.
