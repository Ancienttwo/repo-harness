# repo-harness 0.24.0 publication record

## Scope and authority

- Base: `b6d272cf0796598b01fd614fb818c455ccd1cb48` (#874) on `origin/main`.
- Previous release: `v0.23.1` (`d763868f1696bfa84e42f7cc02d4e75f1ab3ae2c`).
- The release contains all 33 main commits after that tag:
  #828, #827, #825, #830, #832, #833, #834, #835, #836, #837, #838,
  #840, #841, #846, #847, #852 (#850), #849, #843, #845, #853 (#851),
  #855, #854, #857, #858, #859 (#856), #861, #860, #864 (#736 R3), #865,
  #869, #870 (#867), #872 (#866) and #874.
- The tag target adds only release preparation commits to these 33. See
  "Readiness check (2026-10-23)", section "Subject".
- #847 prepared 0.24.0 but did not publish it. #865 expanded the notes
  through #864 at base `19832259e57de81fe7644f91b10cabe6a321d1b5`. This batch expands them through #874.
  The changelog keeps its 2026-10-21 date.
- #847 and #865 are release preparation. The intro names them. They have no
  changelog entry, as with #826 for 0.23.1.
- PR #863 (fix for #862) is not in 0.24.0. The owner excluded it. It is
  still an open draft.
- The owner chose 0.24.0 for the dependency upgrade and feat/refactor changes
  in #837 and #834. #834 removes CLI commands, MCP tools and JSON fields.
- Authorized scope: release documentation, version mirror checks, local
  pre-publish gates, one commit, a push and a ready-for-review PR. No merge,
  npm publish, tag or GitHub Release.
- This batch changes the changelog, this record and one line wrap in both
  `external-tooling.md` copies. `package.json`,
  `assets/skill-version.json` and README references stay at 0.24.0.
  `archctx` and `archctx-contracts` stay at exact 0.9.1.

## Upgrade step for users

- After `repo-harness update`, a running archctx background daemon stays on
  the old version. The user must authorize `daemon upgrade`.
- On a daemon version mismatch, `update` exits 0. In the candidate runtime,
  the `check shared ArchContext daemon` step reports `skipped` with
  "Daemon readiness pending; verified packages retained." The detail adds
  the version difference, the authorization reminder and
  `action: upgrade-archctx-runtime`. The candidate writes it to its stderr.
- The parent `update` puts that candidate stderr into the `ok` detail of the
  `reconcile installed candidate runtime` step. That step prints on stdout.
  The stderr of `update` carries only failed steps, so the reminder is not
  there.
- Until the upgrade, `repo-harness architecture-projection status --json`
  in an adopted repository shows `mismatch` in `projectionProvider.state`
  and `daemonRuntime.state`.
- The agent runs `daemon upgrade` through the managed package-local archctx
  and its Node runtime, after user authorization. The upgrade interrupts
  other daemon clients. The agent then verifies the daemon status and checks
  the repository CodeGraph index.
- Sources: `docs/reference-configs/external-tooling.md` lines 1146-1167,
  `src/cli/commands/global-runtime.ts` lines 282-298, 813-818 and
  1479-1485, `src/cli/index.ts` lines 320-324 and
  `src/effects/architecture/archctx-provider.ts` lines 486-501.
- The changelog `### Upgrade` section gives the same step.

## Historical evidence

Each item is evidence for its own SHA. It is not a pass for `b6d272cf0`.

- Hosted daily CI run 39913921652 (`workflow_dispatch`) at
  `ba54d28a93ebd92e404f1991c1877771cf311e79` (#872): conclusion `success`.
  These daily jobs passed: architecture freshness, full tests and package,
  MCP path matrix on Windows and macOS, governance, native OAR acceptance
  and HOME isolation on Ubuntu, macOS and Windows. This batch read the run
  with `gh run view`.
- Disposable downstream archctx 0.9.1 evaluation at
  `eea1f1d260b8c2dd85c0bbffc47d96c92ea9be1a` (#869):
  PASS for self check, fresh adoption, a change cycle with a major-change
  accept, update from v0.23.1 (archctx 0.8.1; no model or doc migration) and
  refactor suggestions. Source: the parent release session report. This
  batch did not run it again.
- Open follow-up issues: #871 (daily architecture freshness stays red after
  each model edit until an operator accepts it), #873 (worker.md names a
  rolling writer that downstream repos do not have) and #875
  (`architecture-projection` prints a bare `archctx flows check --json`
  next step). They do not block 0.24.0.

## Acceptance environment

- macOS arm64, Bun 1.4.3, Node 24.22.1.
- `bun install --frozen-lockfile`: exit 0; 339 packages installed.
- Each gate uses a new temporary HOME and `REPO_HARNESS_HOME` under `/tmp`.
  `TMPDIR=/tmp`. The wrapper removes `CLAUDECODE`, `AI_AGENT`, `AGENT`,
  `REPL_ID` and `REPO_HARNESS_SOURCE_ROOT`.
- The gates ran one at a time. No other test run was active on the host.
- Local command logs, exit codes and the coverage script:
  `/tmp/rh-release-0240-refresh-IVoJ9i/`.

## Acceptance status

- Subject: base `b6d272cf0796598b01fd614fb818c455ccd1cb48` plus this
  release documentation diff. Only this record was completed after the
  gates. The changelog, runtime files and test inputs did not change
  afterward.
- Why the gates ran twice: hosted CI on the first PR head `381c1cac1`
  failed `tests/action-command-skills.test.ts` ("shipped guidance runs
  archctx only through the managed command"). The cause is a line wrap from
  #874 in `external-tooling.md`: a line started with `archctx on PATH`, and
  the bare-command check matched it. A Codex review also found that the
  upgrade text put the daemon reminder on stderr. The parent `update` prints
  it on stdout. This batch rewrapped the line in both `external-tooling.md`
  copies and corrected the upgrade text. The changelog and a shipped file
  changed, so every gate ran again. The first run is historical evidence for
  the first head only.
- Changelog SHA-256 at verification, the same before and after the second
  gate run:
  `36f5b855ee82770177640fef4a024ad172ef74830266dd82240f3f70b3e58126`.
  The first run hashed
  `a129563640ae937ffb568f9e4d0f087eef3e5e5b93cffef739b56be4ebea9263`.
- `bun run check:type`: exit 0.
- `bun run check:helpers`: exit 0; helper projection matches.
- `bun run check:reference-configs`: exit 0; 25 documents match.
- `bun run test:files tests/installed-copy-sync.test.ts
  tests/readme-dx.test.ts tests/skill-version.test.ts
  tests/effective-state.test.ts tests/hook-runtime.test.ts
  tests/action-command-skills.test.ts
  tests/reference-configs-projection.test.ts --timeout 60000
  --max-concurrency 1`: exit 0; 133 pass, 0 fail across seven files
  (29, 4, 10, 46, 18, 24 and 2). The last two files cover the CI failure
  and the two document copies.
- `bash scripts/check-npm-release.sh --prepublish`: exit 0; the registry
  lookup returns 404 for repo-harness 0.24.0, so it is unpublished.
- `bun run check:release`: exit 0 in 175 seconds. Benchmark matrix:
  31 pass, 0 fail. The package and install smoke uses one shared tarball.
  `check-tarball-install-smoke.sh` installs `repo-harness-0.24.0.tgz`,
  serves the packaged Operator and starts the packaged CLI bins.
  Coding OAuth E2E: 1 pass, 0 fail, 15 filtered out.
- The package build reports a Vite chunk-size warning above 500 kB.
  It does not fail the gate. Bundle changes are outside this docs-only batch.
- Version and changelog coverage check: exit 0. The repo has no script for
  this check, so this batch wrote `coverage.sh` in the log directory.
  It finds all 33 PR numbers from `git log v0.23.1..HEAD` and 15 linked
  issues in the 0.24.0 section, including #866 and #867. #863 is absent.
  `package.json`, `assets/skill-version.json` (version and template
  version) and README show 0.24.0. `package.json` and `bun.lock` pin
  `archctx` and `archctx-contracts` at exact 0.9.1.
- `git diff --check`: exit 0, run last on the final text.
- Logs of the second run: `/tmp/rh-release-0240-refresh-IVoJ9i/rerun-1/`.
- No test assertion, timeout or release tool changed.
- The full suite is outside this gate sequence. Hosted CI for the new PR
  head is pending.

## Release readiness items

- Consumer architecture smoke: `tests/hook-runtime.test.ts` test
  "a registry consumer without code facts or a projection manifest gets
  one architecture line (#850)". It passed in the `test:files` gate above.
- Skill eval evidence: unavailable. This batch has no `full_test_count`,
  `dry_run_ratio`, `grader_pass_rate` or `effectiveness_authority` data.
  The flag table below records why the tracked eval reports do not apply.
- Readiness yellow flags: recorded in "Readiness check (2026-10-23)" below.

## Readiness check (2026-10-23)

### Subject

- Release candidate: `origin/main` `949b8b7498aee84ebfe66a0d0900fc183e72f53c`
  (squash of #876). Its tree is `be30bb56cdd0d925809a9c5d97b4c76eb4930c6d`.
- The gated head `fc068ae72` has the same tree `be30bb56`. The gates in
  "Acceptance status" apply to this tree.
- The readiness PR changes only this record. After it merges, the tree of
  `main` is not `be30bb56`. The gate evidence carries over because the diff
  is this record only.
- On 2026-10-23 the owner selected the squash commit of the readiness PR
  (#877) as the tag target. The two options were:
  - `949b8b749`: `git log v0.23.1..949b8b749` has 34 commits. They are the
    33 commits in "Scope and authority" and #876. #876 is the release
    preparation batch that this record describes as "this batch": the
    changelog, this record and the `external-tooling.md` line wrap.
  - The squash commit of the readiness PR: those 34 commits and the
    readiness commit. The readiness commit changes only this record.
  - #876 and the readiness commit are release preparation. They have no
    changelog entry, as with #847 and #865. The coverage receipt counts the
    33 commits through `b6d272cf0`. It remains exact for both options,
    because the extra commits are only these preparation commits.
- The check ran in a disposable worktree of `949b8b749` after
  `bun install --frozen-lockfile` (exit 0; 339 packages). It used the
  candidate source: `doctor.cli-version` reports 0.24.0. The installed global
  runtime on this host is 0.23.1.

### Sources and commands

- Rules: `release-deploy.md` "Release Filings", the `repo-harness-check`
  skill and its `references/deploy-readiness.md`.
- Repo commands used a temporary HOME and `REPO_HARNESS_HOME` under `/tmp`,
  `TMPDIR=/tmp`, and removed `CLAUDECODE`, `AI_AGENT`, `AGENT`, `REPL_ID`
  and `REPO_HARNESS_SOURCE_ROOT`.
- Waza staging and CodeGraph drift exist only in the owner's real install.
  These commands ran against the real HOME. They are read-only by contract:
  - `bun src/cli/index.ts setup check --target both --check-updates --json`
  - `bash scripts/check-agent-tooling.sh --json --host both --check-updates`
  - `bun src/cli/index.ts security scan --json`
- Real-HOME side effects: a write detector compared file times after a marker.
  No repo-harness managed file changed. The doctor probe runs
  `codex --version` (`src/cli/commands/doctor.ts` line 154). The Codex CLI
  then made its own `~/.codex/tmp/arg0-macos/codex-arg0*` directory.
  Two `~/.codex/*.sqlite-wal` files also changed. The running Codex app is
  the probable cause; this is not confirmed. These files were not removed.
- The same `setup check` with a temporary HOME reported only the gaps of an
  empty host. It is not a flag source.
- Logs: `/tmp/rh-0240-readiness-logs/`.

### Signals

| Signal | Command | Observed result | Flag |
| --- | --- | --- | --- |
| Waza staging drift | `check-agent-tooling.sh --json --host both --check-updates` | Claude and Codex: 4/4 skills and 4/4 shared rules; `staging_sync: synced`; `update_status: up-to-date` against upstream `tw93/Waza` | no |
| CodeGraph version drift | same | local 1.6.2, global 1.6.2, npm latest 1.6.2; `drift: null`; MCP configured on both hosts | no |
| CodeGraph project index | `setup check --target both --check-updates --json` | Exit 1, `status: blocked`. The only `fail` is `doctor.codegraph-index`: `index=not-initialized` in the release worktree. The owner's main checkout has `.codegraph/`. | yes |
| Claude adapter projection | same | `status.adapter.claude`: 5/6 managed entries; `PreToolUse.bash` missing. #861 adds this route in 0.24.0; the host runs 0.23.1. | yes |
| Global rules markers | same | `global-rules.claude` and `global-rules.codex`: legacy repo-harness rules without markers | yes |
| Security config | `security scan --json` | `status: warn`; 2 active `unmanaged-hook-command` findings: the SessionStart hook `herdr-agent-state.sh` in `~/.claude/settings.json` and in `~/.codex/hooks.json`. No reviewed exception matches them. 2 other hooks are reviewed exceptions in `reviewedFindings`. | yes |
| Skills CLI | `setup check` | `runtime.skills_cli`: missing, optional; Waza bootstrap runs through `bunx` | yes |
| Deploy SQL order | `repo-harness run check-deploy-sql-order` | exit 0, `[deploy-sql] OK`; no `operations.deploy_sql` in policy, so `deploy/sql/` with `ordered4` applies | no |
| Deploy surface | read `deploy/` | README, runbooks and release checklists are present. `deploy/env/` holds only `.gitkeep`; `deploy/env/.env.example` is absent. | yes |
| `_ops/` boundary | `git check-ignore`, `git ls-files _ops` | `_ops/` is ignored; 0 tracked files; the main checkout has `_ops/`; contents not read. No tracked real env file; the only `.env*` file is a test fixture. | no |
| Skill eval evidence | read `evals/` | `evals/benchmark.md` is from 2026-06-14 (0.5.1 iteration): 1 eval, 4 full tests, 9/16 graders. `evals/harness/reports/profile-comparison.*` is a profile benchmark from 2026-07-21 (source `b32b3282`) with no skill eval fields. No current evidence. | yes |

### Yellow flags

These proposals came before the owner's decision. "Owner decisions
(2026-10-23)" records the result.

1. CodeGraph project index. Proposed acceptance, pending owner acceptance:
   the index belongs to one checkout and is not in the packaged tree.
   The release worktree is disposable. Repair, only with owner approval for
   an index: `bash scripts/ensure-codegraph.sh --init` in the release
   worktree.
2. Claude adapter projection drift. Host drift before the upgrade, not a
   candidate defect. Repair after publication: `repo-harness update`, which
   installs hooks by default. Direct repair:
   `repo-harness install --target claude --location global`. Both write
   user-level config, so the owner runs or approves them.
3. Global rules without markers. Repair:
   `repo-harness update --report-language <follow|zh-CN|en>`. It writes the
   real HOME, so it is the owner's action. Proposed acceptance, pending owner
   acceptance: the owner maintains these files by hand, and the release
   package does not read them.
4. Security config: 2 active findings. They are unresolved and have no
   recorded review. Repair: the owner reviews the two `herdr-agent-state.sh`
   SessionStart commands. For each command, the owner adds a reviewed
   exception (`filePath`, `ruleId`, `command`, `reason`, `reviewedAt`,
   `reviewedBy`) to `~/.repo-harness/config.json`, where the other two
   reviewed exceptions are. Then `repo-harness security scan --json` must
   report `status: ok`. The hooks are host config and are not in the
   release package.
5. Skills CLI missing. Proposed acceptance, pending owner acceptance: the
   tool is optional and Waza reports synced and up to date without it.
   Repair: install the external Skills CLI, then run
   `repo-harness setup check --target both --check-updates --json`.
6. `deploy/env/.env.example` absent. Proposed acceptance, pending owner
   acceptance: the package has no deploy runtime and no deploy environment
   variables; npm publication uses Web Auth. Repair if the owner wants the
   file: add a shape-only `deploy/env/.env.example`.
7. Skill eval evidence unavailable. Proposed acceptance, pending owner
   acceptance: 0.24.0 makes no skill-effectiveness claim. Repair: on this
   candidate, run `bun run benchmark:skills -- --home <temp-dir>
   --require-disposable` without `--dry-run`, then record `full_test_count`, `dry_run_ratio`, `grader_pass_rate` and
   `effectiveness_authority`.

### Owner decisions (2026-10-23)

Owner's words: "接受 4 个建议接受的黄灯（CodeGraph 索引、Skills CLI、deploy
env、skill eval）。adapter 和规则标记在发布后本机 update 时处理；安全 hook
我另行审查，不阻塞发布。#877 CI 绿后合并，tag 打在 #877 的 squash 提交上，
然后建 Release、npm publish，我在浏览器批准。"

- Accepted, each with its reason in "Yellow flags": flag 1 (CodeGraph
  project index), flag 5 (Skills CLI), flag 6 (`deploy/env/.env.example`)
  and flag 7 (skill eval evidence unavailable).
- Flags 2 and 3 (Claude adapter projection, global rules markers): the owner
  repairs them with the local `repo-harness update` after publication.
- Flag 4 (security config): still unresolved. The owner reviews the two
  `herdr-agent-state.sh` hooks separately. This host-level finding does not
  block the package publication.
- Tag target: the squash commit of #877.
- GO: merge #877 after green CI, then tag, GitHub Release and
  `npm publish`. The owner approves the npm web authentication in the
  browser.

## Publication checklist

- Merge only after the owner's explicit GO and green hosted CI on the PR head.
- `npm publish` must move the npm `latest` dist-tag to 0.24.0. Plain
  `repo-harness update` resolves `latest`. A stale tag installs 0.23.1 again.
- After publication, run `npm view repo-harness dist-tags`. Expect
  `latest: '0.24.0'`. Before this batch the registry shows
  `{ latest: '0.23.1' }`.
- Then run `bun run check:release-published`. It fails when `latest` is not
  the package version. It also checks the tarball, the tag and the local
  version files.
- Create tag `v0.24.0` and the GitHub Release only after the owner's GO.
- Tag target: the squash commit of #877 (owner decision, 2026-10-23).

## Rollback evidence

- Before publication, revert the release preparation commit to withdraw this
  documentation batch.
- After an authorized squash merge: `git revert <squash-commit>`.
- A Git revert does not undo an npm publication.

## Publication status

- Status: on 2026-10-23 the owner authorized the merge of #877, tag
  `v0.24.0`, the GitHub Release and the npm publication.
- At this commit, no tag or GitHub Release exists, and no npm package is
  published.
- 2026-10-23, Git and GitHub publication verified, npm held:
  - Annotated tag `v0.24.0`: object
    `8bc8b79e2f296dc9c8abe0f5b614a5c3e5e5d8d2`, target
    `2d5ac2a034956dfd546d8b288144bfb7fa22fa82` (#877 squash). Read with
    `git cat-file` and `git rev-parse`.
  - GitHub Release `v0.24.0`: published 2026-10-23T09:43:18Z, not a draft,
    not a prerelease. Asset `repo-harness-0.24.0.tgz`, 10503697 bytes.
  - SHA-256 `72cbcd0279dfdcc0c338e367394636d708e1996a8da658f5e5f681a719f1eac9`:
    verified through the API. The asset `digest` from
    `gh api repos/Ancienttwo/repo-harness/releases/tags/v0.24.0` is equal to
    it. The asset was not downloaded.
  - Tarball entry count 645: recorded by the release session at
    publication, not verified here.
  - npm: the owner held the publication until the gate issues #862, #871,
    #873, #875, #880 and #881 closed. `npm view repo-harness dist-tags`
    shows `{ latest: '0.23.1' }`, and 0.24.0 is not in the version list.
  - The owner decided that npm skips 0.24.0. 0.24.1 supersedes 0.24.0 on
    npm. The `v0.24.0` tag and GitHub Release stay as they are. See
    `261023-repo-harness-0.24.1.md`.
