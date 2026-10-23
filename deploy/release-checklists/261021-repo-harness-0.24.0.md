# repo-harness 0.24.0 publication record

## Scope and authority

- Base: `19832259e57de81fe7644f91b10cabe6a321d1b5` (#864) on `origin/main`.
- Previous release: `v0.23.1` (`d763868f1696bfa84e42f7cc02d4e75f1ab3ae2c`).
- The release contains all 28 main commits after that tag:
  #828, #827, #825, #830, #832, #833, #834, #835, #836, #837, #838,
  #840, #841, #846, #847, #852 (#850), #849, #843, #845, #853 (#851),
  #855, #854, #857, #858, #859 (#856), #861, #860 and #864 (#736 R3).
- #847 prepared 0.24.0 but did not publish it. The notes were expanded on
  2026-10-23 through #864. The changelog keeps its 2026-10-21 date.
- The owner chose 0.24.0 for the dependency upgrade and feat/refactor changes
  in #837 and #834. #834 removes CLI commands, MCP tools and JSON fields.
- Authorized scope: release documentation, version mirror checks, local
  pre-publish gates and a commit. No push, PR, merge, npm publish, tag or
  GitHub Release.
- This batch changes the changelog and this record. `package.json`,
  `assets/skill-version.json` and README references stay at 0.24.0.
  `archctx` and `archctx-contracts` stay at exact 0.9.1.

## Acceptance environment

- macOS arm64, Bun 1.4.3, Node 24.18.0.
- `bun install --frozen-lockfile`: exit 0; 339 packages installed.
- Each gate uses a new temporary HOME and `REPO_HARNESS_HOME` under `/tmp`.
  `TMPDIR=/tmp`. The wrapper removes `CLAUDECODE`, `AI_AGENT`, `AGENT`,
  `REPL_ID` and `REPO_HARNESS_SOURCE_ROOT`.
- The test runner also creates isolated HOME and temp directories under
  `/tmp`. Tool caches and gate logs stay on `/Volumes/D`.
- Local command logs and exit codes: `/Volumes/D/rh-release-0240-al5f8joe/`.

## Acceptance status

- Subject: base `19832259e57de81fe7644f91b10cabe6a321d1b5` plus this
  release documentation diff. Only this acceptance record was completed
  after the gates. Runtime files and test inputs did not change afterward.
- Changelog SHA-256 at verification:
  `d24dd693943c44140c44233fc18bb56b6c64db98604e7ab695cf2ceb4d32bb06`.
- `bun run check:type`: exit 0.
- `bun run check:helpers`: exit 0; helper projection matches.
- `bun run check:reference-configs`: exit 0; 25 documents match.
- `bun run test:files tests/installed-copy-sync.test.ts
  tests/readme-dx.test.ts tests/skill-version.test.ts
  tests/effective-state.test.ts tests/hook-runtime.test.ts --timeout 60000
  --max-concurrency 1`: exit 0; 107 pass, 0 fail across five files.
- `bash scripts/check-npm-release.sh --prepublish`: exit 0; the registry
  lookup confirms that repo-harness 0.24.0 is unpublished.
- `bun run check:release`: exit 0 in 218 seconds. Benchmark matrix:
  31 pass, 0 fail. Its `npm pack --json --pack-destination <temp-dir>` and
  `bash scripts/check-tarball-install-smoke.sh` steps pass. The smoke installs
  `repo-harness-0.24.0.tgz`, serves the packaged Operator and starts the
  packaged CLI bins. Coding OAuth E2E: 1 pass, 0 fail, 15 filtered out.
- The package build reports a Vite chunk-size warning above 500 kB.
  It does not fail the gate. Bundle changes are outside this docs-only batch.
- Version and changelog coverage check: exit 0; all 28 main PRs and the
  specified linked issues are present. Current version mirrors agree.
- `git diff --check`: exit 0.
- No test assertion, timeout or release tool changed.
- The full suite is outside this gate sequence. Hosted CI has not started.

## Rollback evidence

- Before publication, revert the release preparation commit to withdraw this
  documentation batch.
- After an authorized squash merge: `git revert <squash-commit>`.
- A Git revert does not undo an npm publication.

## Publication status

- Status: preparation only. No push, PR, merge or publication is authorized.
- No tag or GitHub Release was created. No npm package was published.
