# repo-harness 0.24.1 publication record

## Scope and authority

- Base: `599d492c802cf7a265e7f1d515b74f3ef5988b91` (#886) on `origin/main`.
  Its parent is `3a2124341a3be7cd9e775dd421e63c4bf0dafefe` (#884). This is
  the final release base.
- Previous npm release: 0.23.1. Previous Git release: `v0.24.0`, annotated
  tag object `8bc8b79e2f296dc9c8abe0f5b614a5c3e5e5d8d2`, target
  `2d5ac2a034956dfd546d8b288144bfb7fa22fa82` (#877 squash).
- The release contains all 7 main commits after the `v0.24.0` target:
  #878 (#875), #863 (#862), #879 (refs #871), #882 (#881), #883 (#880),
  #884 (#873) and #886 (#871).
- #886 is the rolling PR from the archctx rolling writer. It refreshes the
  generated architecture outputs for main `3a2124341`. The changelog lists
  it under "Documentation", as the 0.24.0 section lists the rolling PR #872.
- The npm package goes from 0.23.1 to 0.24.1. npm never published 0.24.0.
  So 0.24.1 also carries every 0.24.0 change to npm users.
- `archctx` and `archctx-contracts` stay at exact 0.9.1.
- The release preparation commits have no PR number. Their changelog rule:
  - The version bump, the changelog and these records have no entry, as
    with #847, #865 and #876 for 0.24.0.
  - The writer-location change in both `external-tooling.md` copies has an
    entry under "Documentation" with no PR number. It changes shipped
    guidance. The 0.23.1 section lists its release-branch changes to
    shipped files in the same way. The 0.24.0 line rewrap had no entry,
    because it changed only formatting.
- The #884 entry is under "Fixed" and is not breaking. It removes the
  source-repo script `bun run architecture:writer`. That script was never a
  CLI command, MCP tool or JSON field. #864 added it after `v0.23.1`, so no
  npm release had it.
- The changelog keeps its 2026-10-23 date, as the 0.24.0 section kept its
  preparation date.

### Owner decisions (2026-10-23)

- Hold: "按 B：npm 先不发，等 4 个 issue 和 2 个 PR 都收完再说。"
- Later: "把 #863 的两个后续问题开成 issue，发版前也要修完。" These are
  #880 and #881. Both issue bodies name #863 as their source.
- Later: "两个issues也修完再发吧".
- Version: "#871 关闭后发 0.24.1：保留 v0.24.0 的 tag 和 Release 不动，npm
  从 0.23.1 直接到 0.24.1。"

### Hold

- Gate issues: #862, #871, #873, #875, #880 and #881. All are closed.
- #871 closed as completed at 2026-10-23T16:07:38Z. Before that, the owner
  moved the archctx rolling writer to a supervised low-priority launchd job
  on the owner's host, and the first rolling PR (#886) merged.
- The hold reason is gone. Publication still needs the owner's GO.

### Authorized scope

- Phase 1: the version bump, the changelog, this record, one dated status
  entry in the 0.24.0 record, a push and a draft PR.
- Phase 2: the rebase onto the final base, #886 in the changelog, the
  writer-location guidance fix, one daily CI dispatch on `main`, the local
  release gates, the readiness check and a ready-for-review PR.
- Merge, tag `v0.24.1`, the GitHub Release and `npm publish` need the
  owner's explicit GO.
- The `v0.24.0` tag and GitHub Release do not change.

## Upgrade step for users

- From 0.23.1: do every 0.24.0 upgrade step first. See the 0.24.0 section of
  `docs/CHANGELOG.md` and "Upgrade step for users" in
  `261021-repo-harness-0.24.0.md`:
  - run `repo-harness update`;
  - authorize the archctx `daemon upgrade` when `update` reports
    "Daemon readiness pending; verified packages retained.";
  - for legacy global rules without a recorded language, run
    `repo-harness update --report-language <x>` once;
  - read the breaking removals of #834.
- New remedies in 0.24.1:
  - A refused evidence log append names a recovery read. Run one, for
    example `repo-harness run decision-trail render`, then retry. (#863,
    #883)
  - A refused attempt ledger append, or the `attempt_ledger_unreadable`
    halt from a torn last line, needs
    `repo-harness state attempt-repair --json`. (#882)
  - The rolling writer is `repo-harness architecture-projection publish
    <status|once|follow>`. Run it in the target repository. It accepts
    proven observed major changes; the rolling PR merge is the acceptance.
    Keep its checkout and `ARCHCONTEXT_STATE_DIR` in one stable path that
    survives a reboot. (#879, #884)

## Historical and parent evidence

Each item is evidence for its own SHA and source.

- Architecture at `599d492c8`, from the parent session, with a CI-style
  private HOME that enables the archctx provider:
  `architecture-projection render-check --json` returned `noop` with
  `renderEquivalent: true`. `architecture-projection check --json` returned
  `noop` with `freshness.ok: true` and no stale nodes. This batch did not
  run them again. It did not create a CodeGraph index in the release
  worktree.
- Each merged PR passed its own CI.

## Hosted daily CI

- `.github/workflows/ci.yml` runs on `workflow_dispatch`, and
  `scripts/select-ci-coverage.ts` line 33 selects the `daily` mode for that
  event. Daily mode requires `refs/heads/main`.
- This batch dispatched one run: `gh workflow run ci.yml --repo
  Ancienttwo/repo-harness --ref main` at 2026-10-23T16:09:34Z.
- Run 39984430882, head `599d492c802cf7a265e7f1d515b74f3ef5988b91`
  (#886): conclusion `success`. Read with `gh run watch` and
  `gh run view`.
- Daily jobs, each `success`: Select test coverage, Daily full tests and
  package, Daily architecture freshness, Daily governance, Daily MCP path
  matrix (macos-latest), Daily MCP path matrix (windows-latest), Native OAR
  acceptance (macOS), Test HOME isolation (ubuntu-latest), Test HOME
  isolation (macos-latest) and Test HOME isolation (windows-latest).
- Skipped by design in daily mode: PR architecture freshness (advisory),
  Affected tests and Required / CI.
- The CI subject is the release base. The release branch adds only the
  version bump, release documentation and the guidance fix. The PR CI
  covers the release branch head.

## Acceptance environment

- macOS 26.5 arm64, Bun 1.4.3, Node 24.22.1.
- `bun install --frozen-lockfile`: exit 0. It installed `archctx` 0.9.1
  and `archctx-contracts` 0.9.1 into the worktree.
- Each gate used a new temporary HOME and `REPO_HARNESS_HOME` under `/tmp`,
  and `TMPDIR=/tmp`. The wrapper removed `CLAUDECODE`, `AI_AGENT`, `AGENT`,
  `REPL_ID` and `REPO_HARNESS_SOURCE_ROOT`, and deleted the HOME after the
  gate.
- The gates ran one at a time. No other test run was active on the host.
- Logs, exit codes, the gate wrapper and the coverage script:
  `/tmp/rh-release-0241-3Pwj8P/`.

## Acceptance status

- Subject: commit `b934374222cdf6990965f5cba002c6544f3d6891`, tree
  `30c4c8e9047b6f4f7451719631968eac469bb0f7`. It is the final base plus the
  three release preparation commits. After the gates, only this record
  changed. The changelog, the shipped files and the test inputs did not
  change.
- Changelog SHA-256 at verification:
  `6de19af0e42c1188042b6582c68c2e2f311f20de28a058ee87ecb8c62d322e69`.
- `bun run check:type`: exit 0.
- `bun run check:helpers`: exit 0; helper projection matches.
- `bun run check:reference-configs`: exit 0; 25 documents match.
- `bun run test:files tests/installed-copy-sync.test.ts
  tests/readme-dx.test.ts tests/skill-version.test.ts
  tests/effective-state.test.ts tests/hook-runtime.test.ts
  tests/action-command-skills.test.ts
  tests/reference-configs-projection.test.ts --timeout 60000
  --max-concurrency 1`: exit 0 in 72 seconds; 133 pass, 0 fail across seven
  files (29, 4, 10, 46, 18, 24 and 2).
- `bash scripts/check-npm-release.sh --prepublish`: exit 0; the registry
  lookup for repo-harness 0.24.1 fails, so it is unpublished.
- `bun run check:release`: exit 0 in 147 seconds. Benchmark matrix:
  31 pass, 0 fail. `check-tarball-install-smoke.sh` installs
  `repo-harness-0.24.1.tgz`, serves the packaged Operator and starts the
  packaged CLI bins. Coding OAuth E2E: 1 pass, 0 fail, 15 filtered out.
- The package build reports a Vite chunk-size warning above 500 kB, as for
  0.24.0. It does not fail the gate.
- Version and changelog coverage check: exit 0. The script is
  `coverage.sh` in the log directory.
  - Count check: `git rev-list --count v0.24.0..origin/main` is 7, and 7
    subjects end with a PR number. So no main commit lacks one.
  - All 7 PR numbers and the 6 linked issues #875, #862, #871, #881, #880
    and #873 are in the 0.24.1 section.
  - `package.json`, `assets/skill-version.json` (version and template
    version) and README show 0.24.1. `package.json` and `bun.lock` pin
    `archctx` and `archctx-contracts` at exact 0.9.1.
- `git diff --check`: exit 0, run last on the final text.
- No test assertion, timeout or release tool changed.
- The full suite is outside this gate sequence. The hosted daily CI above
  ran it on the base.

## Release readiness items

- Consumer architecture smoke: `tests/hook-runtime.test.ts` test
  "a registry consumer without code facts or a projection manifest gets
  one architecture line (#850)". It passed in the `test:files` gate above.
- Skill eval evidence: unavailable. See flag 7.
- Readiness yellow flags: see "Readiness check (2026-10-23)" below.

## Readiness check (2026-10-23)

### Subject and commands

- Candidate: the release worktree at `b93437422`, after
  `bun install --frozen-lockfile`. `doctor.cli-version` reports 0.24.1. The
  installed global runtime on this host is 0.23.1.
- Rules: `release-deploy.md` "Release Filings", the `repo-harness-check`
  skill and its `references/deploy-readiness.md`.
- Real HOME, read-only by contract, with `CLAUDECODE`, `AI_AGENT`, `AGENT`,
  `REPL_ID` and `REPO_HARNESS_SOURCE_ROOT` removed and `TMPDIR=/tmp`:
  - `bun src/cli/index.ts setup check --target both --check-updates --json`:
    exit 0, `status: attention`; 31 ok, 4 warn, 0 fail, 1 n/a, 2
    needs_agent.
  - `bash scripts/check-agent-tooling.sh --json --host both
    --check-updates`: exit 0.
  - `bun src/cli/index.ts security scan --json`: exit 0, `status: warn`.
  - `bun src/cli/index.ts upgrade --json` (no `--apply`): exit 1 by design,
    because leftovers exist; 30 items. With a temporary HOME: 0 items.
- Temporary HOME: `bun src/cli/index.ts run check-deploy-sql-order`.
- Real-HOME side effects: a write detector compared file times after a
  marker in `~/.repo-harness`, `~/.claude`, `~/.codex`, `~/.agents` and
  `~/.config`. No repo-harness managed file changed. The doctor probe runs
  `codex --version`, and the Codex CLI made its own
  `~/.codex/tmp/arg0-macos/codex-arg0*` directory. One
  `~/.claude/sessions/*.json` file changed; Claude Code sessions own that
  directory. These files were not removed.
- Logs: `/tmp/rh-0241-readiness-k0l8Gq/`.

### Signals

| Signal | Source | Observed result | Flag |
| --- | --- | --- | --- |
| Waza staging drift | `check-agent-tooling.sh` | Claude and Codex: 4/4 skills and 4/4 shared rules synced; `update_status: up-to-date` against `tw93/Waza` | no |
| CodeGraph version drift | same | local 1.6.2, global 1.6.2, npm latest 1.6.2; `drift: null`; MCP configured on both hosts | no |
| CodeGraph project index | `setup check`, `codegraph status .` | `doctor.codegraph-index` is `ok` with `index=up-to-date` and the path `<release worktree>/.codegraph`. That directory does not exist. `codegraph status .` warns that the index belongs to the main checkout, which is a parent directory of the worktree. | yes |
| Claude adapter projection | `setup check` | `status.adapter.claude`: 5/6 managed entries; `PreToolUse.bash` missing. #861 added this route in 0.24.0; the host runs 0.23.1. | yes |
| Global rules markers | same | `global-rules.claude` and `global-rules.codex`: legacy repo-harness rules without markers | yes |
| Security config | `security scan --json` | `status: warn`; 2 active `unmanaged-hook-command` findings, the SessionStart hook `herdr-agent-state.sh` in `~/.claude/settings.json` and in `~/.codex/hooks.json`. 2 other hooks are reviewed exceptions. | yes |
| Skills CLI | `setup check` | `runtime.skills_cli`: missing, optional | yes |
| PATH archctx | `check-agent-tooling.sh` | `~/.bun/bin/archctx` (unknown version) is on PATH and is not the managed archctx 0.9.1. The tool reports a warning. | yes |
| Leftovers | `upgrade --json` | 30 items in the real HOME. 18 refresh unchanged owned skill copies from the candidate package. The others are old backups to keep and dangling skill links without an install record. | yes |
| Deploy SQL order | `run check-deploy-sql-order` | exit 0, `[deploy-sql] OK`; no `operations.deploy_sql`, so `deploy/sql/` with `ordered4` applies | no |
| Deploy surface | read `deploy/` | README, runbooks, scripts, submissions and release checklists are present. `deploy/env/` holds only `.gitkeep`; `deploy/env/.env.example` is absent. | yes |
| `_ops/` boundary | `git check-ignore`, `git ls-files _ops` | `_ops/` is ignored; 0 tracked files; the main checkout has `_ops/`; contents not read. The only tracked `.env*` file is a test fixture. | no |
| Skill eval evidence | read `evals/` | No change since `v0.24.0`. `evals/benchmark.md` is from 2026-06-14. `evals/harness/reports/profile-comparison.*` has no skill eval fields. | yes |

### Yellow flags

The owner's 0.24.0 acceptances do not carry over. Each flag needs the
owner's decision for 0.24.1.

1. CodeGraph project index: a false `ok`. repo-harness reports the index of
   the parent main checkout as the index of the nested release worktree.
   Proposed acceptance: the index is not in the package, and no gate or
   package file depends on it. Proposed follow-up: an issue for the
   readiness probe, which must not report a parent checkout's index as
   ready. A worktree-local index needs the owner's approval:
   `bash scripts/ensure-codegraph.sh --init` in the release worktree.
2. Claude adapter projection drift. Host drift before the upgrade, not a
   candidate defect. Repair after publication: `repo-harness update`.
   Direct repair: `repo-harness install --target claude --location global`.
   Both write user-level config, so the owner runs or approves them.
3. Global rules without markers. Repair:
   `repo-harness update --report-language <follow|zh-CN|en>`. It writes the
   real HOME, so it is the owner's action. Proposed acceptance: the owner
   maintains these files by hand, and the package does not read them.
4. Security config: 2 active findings, unresolved since 0.24.0. Repair: the
   owner reviews the two `herdr-agent-state.sh` SessionStart commands and
   adds a reviewed exception for each (`filePath`, `ruleId`, `command`,
   `reason`, `reviewedAt`, `reviewedBy`) to `~/.repo-harness/config.json`.
   Then `repo-harness security scan --json` must report `status: ok`. The
   hooks are host config and are not in the package.
5. Skills CLI missing. Proposed acceptance: the tool is optional, and Waza
   reports synced and up to date without it. Repair: install the external
   Skills CLI, then run
   `repo-harness setup check --target both --check-updates --json`.
6. PATH archctx and `deploy/env/.env.example`:
   - PATH archctx. Proposed acceptance: repo-harness runs only the managed
     archctx, and the guidance forbids a bare `archctx`. Repair, the
     owner's action outside the worktree: `bun remove -g archctx`.
   - `deploy/env/.env.example` absent. Proposed acceptance: the package has
     no deploy runtime and no deploy environment variables; npm publication
     uses web authentication. Repair if the owner wants the file: add a
     shape-only `deploy/env/.env.example`.
7. Skill eval evidence unavailable. Proposed acceptance: 0.24.1 makes no
   skill-effectiveness claim. Repair: run `bun run benchmark:skills --
   --home <temp-dir> --require-disposable` without `--dry-run`, then record
   `full_test_count`, `dry_run_ratio`, `grader_pass_rate` and
   `effectiveness_authority`.
8. Leftovers. Host state before the upgrade. Proposed acceptance: the 18
   refresh items are expected while the host runs 0.23.1. Repair after
   publication: `repo-harness update`, then `repo-harness upgrade` to
   review the rest. `repo-harness upgrade --apply` backs up and removes
   verified owned leftovers, so it is the owner's action.

## Publication checklist

- Merge only after the owner's explicit GO and green hosted CI on the PR
  head.
- Create tag `v0.24.1` and the GitHub Release only after the owner's GO.
- The owner runs `npm publish` with web authentication personally, in the
  foreground. For 0.23.1, a background web-auth publish waited until the
  authentication link expired, and npm failed with `E404`.
- After publication, run `npm view repo-harness dist-tags`. Expect
  `latest: '0.24.1'`. Before publication the registry shows
  `{ latest: '0.23.1' }`.
- Then run `bun run check:release-published 0.24.1` with a temporary HOME.

## Rollback evidence

- Before publication, revert the release preparation commits.
- After an authorized squash merge: `git revert <squash-commit>`.
- A Git revert does not undo an npm publication.

## Publication status

- Status on 2026-10-23: phase 2 complete. No `v0.24.1` tag, no GitHub
  Release and no npm publication.
