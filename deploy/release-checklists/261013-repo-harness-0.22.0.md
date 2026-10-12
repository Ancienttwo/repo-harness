# repo-harness 0.22.0 publication record

## Scope and authority

- Gate base: `25ca115e700b98e6001c3b47f1c4f2f28ea1aabb` (#646) on `main`.
  Parent: `b5f017dc816a69df32c6505e94821aaa47aca687` (#647).
- #648 base: `0760959ee2022b5d64d981cc8e3570fe8f5a5fc5` (#648 squash merge).
  Parent: `25ca115e700b98e6001c3b47f1c4f2f28ea1aabb`. The owner chose to ship
  #648 in 0.22.0. #648 adds the read-only architecture projection check to
  the governance lane and the CodeGraph step to the worker guidance.
- #649 merged to main during review: `98c66adf73379c48f5530103fdbc77c7b1e84ecf`.
  Parent: `0760959ee2022b5d64d981cc8e3570fe8f5a5fc5`. The release branch
  merged it to resolve the conflict, so 0.22.0 includes it. #649 makes
  ArchContext the only path ownership authority under
  `capability_source: archcontext` (part 1 of #631).
- The release contains every main commit after `v0.21.2`
  (`942f3fca4195facb298ffc48dc5c7f3c804de8ce`), from #617 to #649.
- Pin `archctx` and `archctx-contracts` to exact version `0.7.1` (#647).
- Set package, skill, template and README versions to `0.22.0`.
- The version is a minor release. #617 retires the automatic projection
  settings. `update` and `init` migrate them once. Readers refuse them until
  then.
- Refresh `docs/architecture/.projection-manifest.json`. Four capability
  source digests changed after #632. The rendered pages did not change.
  `architecture-projection check` returns `noop` at the release commit.
- On 2026-10-12 the owner authorized the release with the archctx 0.7.1
  dependency: the release PR merge, the `v0.22.0` tag, npm and GitHub
  publication, and the local runtime update. npm publication needs the
  owner's browser authentication.

## Acceptance environment

- macOS arm64, Bun 1.4.3, Node 24.21.0, locked dependencies.
- Each run used a new temporary HOME under `/tmp`.
- The first gate run used Node 26.10.0 from PATH. `package.json` requires
  `node >=24 <26`. On 2026-10-12 the owner linked Homebrew `node@24` as the
  machine default.
- Claude Code sets `CLAUDECODE=1` and `AI_AGENT`. Bun then omits passing test
  lines. One test reads those lines from a child `bun test`. The gate rerun
  removed these variables.

## Acceptance status

- `bash scripts/check-npm-release.sh --prepublish`: exit 0.
- `bun run check:type`: exit 0.
- First full `bun run check:release` (Node 26 on PATH, agent variables set):
  exit 1, 4 failed files.
  - `tests/generic-review.test.ts`: 8 OAR cases refused Node 26
    (`OAR fixture requires the resolved PATH executable to be Node 24`).
    One case missed `(pass)` lines because of the agent variables.
  - `tests/cli/codegraph.test.ts`, `tests/contract-worktree.test.ts`,
    `tests/effects/dev-activity-collector.test.ts`: one timeout each under
    eight parallel file workers.
  - With Node 24 and without the agent variables, each file passed alone:
    20/20, 3/3, 25/25 and 12/12.
- Second full `bun run check:release` (Node 24, agent variables removed):
  382 test files ran. 381 passed. `tests/herdr-task-lifecycle.test.ts` case
  `MCP goals use visible persistent Herdr peers, redact history and clean
  success and timeout panes` timed out at 30276 ms. The file passed alone,
  11/11. Daily timeout failures of this kind are tracked in #644.
- The gate stops before the shared tarball smoke when a test file fails. The
  smoke ran alone at the release commit:
  `bash scripts/check-tarball-install-smoke.sh` exit 0.
  `repo-harness-0.22.0.tgz` installs, serves the packaged Operator, and the
  packaged CLI bins start.
- Delta checks after the #648 merge (Node 24, temporary HOME, agent
  variables removed):
  - `bash scripts/check-ci.sh governance`: exit 0. The new architecture
    projection step returned `noop` after the manifest refresh.
  - 10 affected test files (#648 consumers and `skill-version`): 132 passed,
    0 failed.
  - Tarball install smoke: exit 0.
  - `bun run check:type`: exit 0.
- No assertion or timeout was changed for this release.

## Rollback evidence

- Release squash merge: pending.
- A Git revert does not undo an npm publication.

## Publication status

- Status: prepared. Not published.
