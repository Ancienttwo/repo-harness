# repo-harness 0.24.0 publication record

## Scope and authority

- Base: `df70208c16d21cae9a36e353d21ff90eeab7a339` (#846) on `origin/main`.
- Previous release: `v0.23.1` (`d763868f1696bfa84e42f7cc02d4e75f1ab3ae2c`).
- The release contains all 14 main commits after that tag:
  #828, #827, #825, #830, #832, #833, #834, #835, #836, #837, #838,
  #840, #841 and #846.
- The owner chose 0.24.0 for the dependency upgrade and feat/refactor changes
  in #837 and #834. #834 removes CLI commands, MCP tools and JSON fields.
- Authorized scope: version files, changelog, this record, pre-publish gates,
  branch push and a Draft PR. No merge, npm publish, tag or GitHub Release.
- The release branch changes `package.json`, `assets/skill-version.json` and
  the README version references. It adds the 0.24.0 changelog and this record.

## Acceptance environment

- macOS arm64, Bun 1.4.3. `bun install --frozen-lockfile`: exit 0.
- Each gate uses a new temporary HOME and `REPO_HARNESS_HOME` under `/tmp`.
  `TMPDIR=/tmp`. The wrapper removes `CLAUDECODE`, `AI_AGENT`, `AGENT`,
  `REPL_ID` and `REPO_HARNESS_SOURCE_ROOT`.
- Local command logs and exit codes: `/tmp/rh-release-0240-evidence/`.

## Acceptance status

- Subject: base `df70208c16d21cae9a36e353d21ff90eeab7a339` plus the
  version and changelog diff in this PR. Only this record was completed
  after the gates. Runtime files and test inputs did not change afterward.
- `bun run check:type`: exit 0.
- `bun run check:helpers`: exit 0.
- `bun run check:reference-configs`: exit 0; 25 documents match.
- `bun run test:files tests/installed-copy-sync.test.ts
  tests/readme-dx.test.ts tests/skill-version.test.ts
  tests/effective-state.test.ts tests/hook-runtime.test.ts --timeout 60000
  --max-concurrency 1`: exit 0; 102 pass, 0 fail across five files.
- `bash scripts/check-npm-release.sh --prepublish`: exit 0.
- `bun run check:release`: exit 0. Benchmark matrix: 31 pass, 0 fail.
  Its `npm pack --json --pack-destination <temp-dir>` step exits 0.
  `bash scripts/check-tarball-install-smoke.sh` exits 0. It installs
  `repo-harness-0.24.0.tgz`, serves the packaged Operator and starts the
  packaged CLI bins. Its coding OAuth E2E has 1 pass, 0 fail.
- Version and changelog coverage check: exit 0; all 14 PRs are present.
- `git diff --check`: exit 0.
- The real `~/.repo-harness/registered-repos.json` SHA-256 is unchanged.
- Fresh-context read-only review found no diff defects. Its pending-evidence
  item is resolved by the completed release gate and this record.
- The optional source CLI `architecture-projection check --json` probe exits
  1: `architecture projection provider is disabled` in the isolated HOME.
  This worktree has no CodeGraph index. The #826 release lane does not require
  the projection check. No model responsibility changed. No projection stamp
  was edited by hand, and no index was created.
- The full suite is not part of the requested #826 gate sequence. It did not
  run here. Hosted CI must pass on the final head before any later merge.
- No test assertion or timeout changed. No release tooling changed.

## Rollback evidence

- Before merge, close the Draft PR to withdraw the release preparation.
- After an authorized squash merge: `git revert <squash-commit>`.
- A Git revert does not undo an npm publication.

## Publication status

- Status: preparation only. No merge or publication is authorized.
- No tag, GitHub Release or npm package was created by this task.
