# repo-harness 0.24.0 publication record

## Scope and authority

- Base: `b6d272cf0796598b01fd614fb818c455ccd1cb48` (#874) on `origin/main`.
- Previous release: `v0.23.1` (`d763868f1696bfa84e42f7cc02d4e75f1ab3ae2c`).
- The release contains all 33 main commits after that tag:
  #828, #827, #825, #830, #832, #833, #834, #835, #836, #837, #838,
  #840, #841, #846, #847, #852 (#850), #849, #843, #845, #853 (#851),
  #855, #854, #857, #858, #859 (#856), #861, #860, #864 (#736 R3), #865,
  #869, #870 (#867), #872 (#866) and #874.
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
- Readiness yellow flags: this batch did not run `repo-harness-check`.
  No yellow flag is recorded.

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

## Rollback evidence

- Before publication, revert the release preparation commit to withdraw this
  documentation batch.
- After an authorized squash merge: `git revert <squash-commit>`.
- A Git revert does not undo an npm publication.

## Publication status

- Status: preparation only. No merge or publication is authorized.
- No tag or GitHub Release was created. No npm package was published.
