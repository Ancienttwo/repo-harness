# repo-harness 0.24.3 publication record

## Scope and authority

- Base: `5bc79eea4c6024478ce1415e1fc9414efa66fd61` (#975) on `origin/main`.
  Its parent is `882817207b50aa448f81ce7569142853d98461fe` (#974). This is
  the final release base.
- Previous release: 0.24.2 on npm and in Git. Tag `v0.24.2`, annotated tag
  object `dcadec0c0dc5ff578d030180b8541b81e0928dde`, target
  `7310993bc170fa2960287af6856e7e5ab02100e6` (#965 squash).
- Merged range: `v0.24.2..5bc79eea4`. `git rev-list --count` is 4. Each of
  the 4 subjects ends with a PR number: #969, #972, #974 and #975.
- The npm package goes from 0.24.2 to 0.24.3. `package.json`,
  `assets/skill-version.json` (version and template version) and README show
  0.24.3. `archctx` and `archctx-contracts` stay at exact 0.9.3.
- Changelog rules, as for 0.24.2: the release preparation commits have no
  entry; the rolling PRs #969 and #975 and the release record #972 are under
  "Documentation".

### Owner decisions (2026-10-26)

Owner's words:

> Prepare and release 0.24.3 with the #973 fix, same flow as 0.24.2; I will
> run npm publish.

Result:

- GO for the 0.24.3 patch release. The owner runs `npm publish`.
- The 0.24.2 yellow flag acceptances do not carry over. The 0.24.3 readiness
  flags need the owner's decision. See "Readiness check".

### Cause of the patch

- #973: `repo-harness update` from 0.24.1 to 0.24.2 failed at candidate
  reconciliation and rolled back to 0.24.1. The 0.24.1 parent's lock owner
  record has no `start_time`, and the 0.24.2 candidate refused it.
- #974 fixed it, squash `882817207b50aa448f81ce7569142853d98461fe`. High
  tier: the read-only gatekeeper passed, its Low finding was fixed before the
  merge, and the Codex review found no major issues on both heads.
- A 0.24.1 parent runs the new package's candidate during `update`, so
  0.24.1 hosts get the fix through a normal `repo-harness update` to 0.24.3.

## Upgrade steps for users

- From 0.24.1: run `repo-harness update`. Then do the 0.24.2 upgrade steps in
  `docs/CHANGELOG.md` and `261025-repo-harness-0.24.2.md`.
- From 0.24.2: run `repo-harness update`. There are no new steps.

## Hosted daily CI

PENDING. The orchestrator records the daily CI run on the release base.

## Acceptance environment

- macOS 26.5 arm64, Bun 1.4.3, Node 24.18.0. The installed global runtime
  on this host is 0.24.1.
- `bun install --frozen-lockfile`: exit 0. It installed `archctx` 0.9.3
  and `archctx-contracts` 0.9.3 into the worktree.
- Each gate used a new temporary HOME and `REPO_HARNESS_HOME` under `/tmp`,
  and `TMPDIR=/tmp`. The wrapper removed `CLAUDECODE`, `AI_AGENT`, `AGENT`,
  `REPL_ID` and `REPO_HARNESS_SOURCE_ROOT`, and deleted the HOME after the
  gate.
- The gates ran one at a time. No other test run was active on the host.

## Acceptance status

- Subject: commit `a33d1d9261e0306ed961de8b933008faabc22335`, tree
  `6889df10d8349181a8155052ad387b40e99d341a`. It is the final base plus the
  version bump and the changelog. After the gates, only this record changed.
- Changelog SHA-256 at verification:
  `d7ee509227e403b35ff0a42aac976c0d59abb44203c9e37aafcef972b34a0c50`.
- `bun run check:type`: exit 0.
- `bun run check:helpers`: exit 0; helper projection matches.
- `bun run check:reference-configs`: exit 0; 25 documents match.
- `bun run test:files tests/installed-copy-sync.test.ts
  tests/readme-dx.test.ts tests/skill-version.test.ts
  tests/effective-state.test.ts tests/hook-runtime.test.ts
  tests/action-command-skills.test.ts
  tests/reference-configs-projection.test.ts
  tests/unit/exclusive-directory-lock-owner-identity.test.ts
  tests/unit/candidate-bound-global-runtime-reconciliation.test.ts
  --timeout 60000 --max-concurrency 1`: exit 0 in 84 seconds; 155 pass,
  0 fail across nine files (29, 4, 10, 46, 19, 24, 2, 7 and 14). The last two
  files hold the #973 regression tests.
- `bash scripts/check-npm-release.sh --prepublish`: exit 0; repo-harness
  0.24.3 is unpublished.
- `bun run check:release`: exit 0 in 136 seconds. Benchmark matrix:
  31 pass, 0 fail. `check-tarball-install-smoke.sh` installs
  `repo-harness-0.24.3.tgz`, serves the packaged Operator and starts the
  packaged CLI bins. Coding OAuth E2E: 1 pass, 0 fail, 15 filtered out. The
  Vite chunk-size warning above 500 kB is the same as for 0.24.2.
- Version and changelog coverage: 4 of 4 PRs and #973 are in the 0.24.3
  section. The three version files show 0.24.3.
- `git diff --check origin/main...HEAD`: exit 0.
- No test assertion, timeout or release tool changed in the release
  preparation commits.

## Release readiness items

- Consumer architecture smoke: `tests/hook-runtime.test.ts` test
  "a registry consumer without code facts or a projection manifest gets
  one architecture line (#850)". It passed in the `test:files` gate above.
- Skill eval evidence: unavailable. See flag 6.
- Readiness yellow flags: see "Readiness check".

## Readiness check

### Subject and commands

- Candidate: the release worktree at `a33d1d926`, after
  `bun install --frozen-lockfile` and
  `bash scripts/ensure-codegraph.sh --init` (a worktree-local index).
- Real HOME, read-only by contract, with `CLAUDECODE`, `AI_AGENT`, `AGENT`,
  `REPL_ID` and `REPO_HARNESS_SOURCE_ROOT` removed and `TMPDIR=/tmp`:
  - `bun src/cli/index.ts setup check --target both --check-updates --json`:
    `status: attention`; 31 ok, 4 warn, 0 fail, 1 n/a, 2 needs_agent.
  - `bash scripts/check-agent-tooling.sh --json --host both
    --check-updates`: exit 0.
  - `bun src/cli/index.ts security scan --json`: exit 0, `status: warn`.
  - `bun src/cli/index.ts upgrade --json` (no `--apply`): exit 1 by design,
    because leftovers exist; 36 items. With a temporary HOME: 0 items.
- Temporary HOME: `bun src/cli/index.ts run check-deploy-sql-order`:
  exit 0, `[deploy-sql] OK`.
- `_ops/` is ignored, with 0 tracked files.

### Yellow flags

The signals are the same as for 0.24.2. Each flag needs the owner's decision
for 0.24.3.

1. Global rules managed blocks are stale (`global-rules.claude`,
   `global-rules.codex`). Repair after publication:
   `repo-harness update --report-language <follow|zh-CN|en>`.
2. Install ledger drift on `~/.claude/settings.json`. Repair after
   publication: `repo-harness update`.
3. Security config: the same 2 `herdr-agent-state.sh` findings. Repair: a
   reviewed exception for each in `~/.repo-harness/config.json`.
4. Waza update available and Skills CLI missing. Both are external,
   optional tools.
5. Leftovers: 36 items, 18 refresh and 18 report. 0 with a temporary HOME.
   Repair after publication: `repo-harness update`, then
   `repo-harness upgrade`.
6. Skill eval evidence unavailable. 0.24.3 makes no skill-effectiveness
   claim.
7. `deploy/env/.env.example` absent and practices not enabled. The package
   has no deploy runtime, and practice evaluation stays advisory.

## Publication checklist

- Merge the release PR only after green hosted CI on its head.
- Create tag `v0.24.3` on the release squash commit, then the GitHub
  Release with the tarball packed from that commit.
- The owner runs `npm publish <tarball> --auth-type=web` in the foreground.
- After publication, `npm view repo-harness dist-tags` must show
  `latest: '0.24.3'`. Then run `bun run check:release-published 0.24.3`
  with a temporary HOME.
- This host still runs 0.24.1. The owner's `repo-harness update` here is the
  real proof of the #973 fix.

## Rollback evidence

- Before publication, revert the release preparation commits.
- After the squash merge: `git revert <squash-commit>`.
- A Git revert does not undo an npm publication.

## Publication status

- Status on 2026-10-26: not published. No `v0.24.3` tag, no GitHub Release
  and no npm publication.
