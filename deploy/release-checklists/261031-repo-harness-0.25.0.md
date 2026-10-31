# repo-harness 0.25.0 publication record

## Scope and authority

- Publish candidate: `30bca275e0fc8d58bebced78b5a98133da9a0fac` on
  `origin/main` (#1291, archimap refresh).
- Previous release: 0.24.3 on npm and in Git. Tag `v0.24.3`, annotated tag
  object `357673f5fd4e0686c59866496b573a22c5d4eacb`, target
  `bd3a40bd5c874a20c55916238f120e7cd884ca75` (#976).
- Merged range: `v0.24.3..30bca275`; 178 commits
  (`git rev-list --count v0.24.3..30bca275`). Each subject ends with a PR
  number.
- This record covers `30bca275`. PR #1290 (lessons evidence) is open at
  record time. If #1290 merges before publish, sync `origin/main`, update
  the candidate and the range, and re-run the count.
- The npm package goes from 0.24.3 to 0.25.0. `package.json`,
  `assets/skill-version.json` (version and template version), README and the
  operator bot fixture show 0.25.0.
- `archctx` and `archctx-contracts` stay at their locked versions.

### Owner decision

The owner authorized the backlog takeover and the 0.25.0 release preparation.
The owner runs `npm publish`; the agent does not publish.

## Cause of the minor

- IPDD cleanup: the local plan, sprint, contract, review, notes and workstream
  flow is removed; issue/PR state is the only task source. Init/upgrade stop
  seeding `plans/`, `tasks/todos.md`, `tasks/current.md`, `check:task-*`
  and the retired policy keys. Existing PRDs move to `docs/prds/`
  (#1177-#1184, #1225).
- Architecture: the issue/PR architecture map is added and the generated
  outputs are refreshed (#1184, #1209).
- IPDD single source: the issue-flow skill is the only flow source (#1223);
  the root rules are cross-layer invariants only (#1226); the duplicated flow
  reference docs are retired (#1227); the handoff session recovery is retired
  (#1228); init ships the IPDD root context and the registered upgrade
  migrates the retired copies (#1229); only the coordinator posts claims
  (#1278); review has one
  hazard list and a High tier on a hit (#1274); CI repair issues are keyed by
  the failing test identity (#1275); research and durable decisions have one
  home (#1250); the fleet known-gaps table is recorded (#1272); publication
  regenerates generated artifacts and its P1 fix requires the result on the PR
  head (#1257, #1288); the archimap is refreshed (#1291).
- DSH plugin: the package ships `dist/dsh-plugin.js` and
  `cordis.patch.yml`; `prepack` builds the plugin. Registry install
  verification and release-note claims are deferred (#1206).
- `contract-worktree start` and `cleanup` use one branch metadata source
  (#1230).

## Upgrade steps for users

- From 0.24.3: run `repo-harness update`. It refreshes the global runtime and
  skills. It prints a read-only registered-repo upgrade summary and does not
  change project files.
- Run `repo-harness upgrade --registered` to preview each registered
  repository and its registry revision.
- Confirm the repository and the revision, then run
  `repo-harness upgrade --registered --apply --expected-revision <revision>`
  to apply the IPDD root-context and reference-config migration (#1229). It
  writes `CLAUDE.md` and `AGENTS.md` from
  `assets/templates/root-context.md` only when their bytes match a shipped
  generated version. It removes the six retired flow reference docs and the
  empty `docs/architecture/domains` and `docs/architecture/snapshots`
  placeholders. A modified file is kept and reported.
- The local plan/sprint/contract/review/notes/workstream files are no longer
  read. Move any PRDs to `docs/prds/`; task identity now lives in GitHub
  issues and PRs.
- Remove local `check:task-*` scripts. The upgrade removes the exact legacy
  `repo-harness run check-task-workflow --strict` entry and does not seed
  `check:task-sync`.
- The Stop hook no longer writes, and Effective State no longer reads,
  `.ai/harness/handoff/current.md` and `resume.md` (#1228). Resume from Git
  state, the GitHub issue and the PR.

## Hosted daily CI

- Dispatch: `gh workflow run ci.yml --repo Ancienttwo/repo-harness --ref main`
  at 2026-10-31T18:58:10Z on `30bca275`.
- Run 41231939960. Result: success at 2026-10-31T19:08:31Z. Daily architecture
  freshness, both MCP path matrices, Daily full tests and package, Daily
  governance and Native OAR acceptance (macOS) passed. PR-only jobs were
  skipped by design.
- Daily mode runs Daily architecture freshness and both MCP path matrices.
  PR-only jobs are skipped by design.

## Acceptance environment

- macOS 26 arm64, Bun 1.4.3, Node 24.22.1.
- `bun install --frozen-lockfile` in a fresh worktree.
- `bash scripts/check-npm-release.sh --prepublish`: version must be unpublished
  and helpers must pass.
- `bash scripts/check-ci.sh architecture`: `noop`, `renderEquivalent: true`.
- Registered upgrade: `repo-harness update` leaves a registered project
  unchanged. `repo-harness upgrade --registered` lists the pending migration
  and the registry revision. `--apply --expected-revision` then migrates the
  project and reports each removed, refreshed or kept file.
- Package smoke: `npm pack --dry-run` includes `dist/oar-review-host.js` and
  the DSH plugin, and excludes `tasks/` and `plans/`. The docs host is closed
  (#1149), so its bundle is not in the package.

## Publication

- Owner command: `npm publish` from the release branch after the release PR
  merges.
- Run the #987 local upgrade test from 0.24.3. Registry install verification
  and release-note claims for the DSH plugin are deferred (#1206).
- The owner records the npm version, the Git tag, and the published tarball
  digest here. This record does not state a publish SHA or digest.

  - npm version: (owner)
  - Git tag: (owner)
  - published tarball digest: (owner)
