# repo-harness 0.25.0 publication record

## Scope and authority

- Base: `280fcbcaf9be54b96ea32b51f5788de58905971a` (#1209, architecture refresh) on `origin/main`.
  Its parent is `8916d116a09fd11a4c74e2cf3e921204b1b10d03` (#1233, #1225 residue cleanup).
- Previous release: 0.24.3 on npm and in Git. Tag `v0.24.3`, annotated tag
  object `357673f5fd4e0686c59866496b573a22c5d4eacb`, target
  `bd3a40bd5c874a20c55916238f120e7cd884ca75` (#976).
- Merged range: `v0.24.3..280fcbca`; 141 commits. Each subject ends with a PR number.
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
- DSH plugin: the plugin is built by `prepack` and included in the package
  (#1206).
- `contract-worktree start` and `cleanup` use one branch metadata source
  (#1230).

## Upgrade steps for users

- From 0.24.3: run `repo-harness update`.
- The local plan/sprint/contract/review/notes/workstream files are no longer
  read. Move any PRDs to `docs/prds/`; task identity now lives in GitHub
  issues and PRs.
- Remove local `check:task-*` scripts. The upgrade removes the exact legacy
  `repo-harness run check-task-workflow --strict` entry and does not seed
  `check:task-sync`.
- Downstream root context and reference-configs migration is #1229; this
  release does not claim it.

## Hosted daily CI

- Dispatch: `gh workflow run ci.yml --repo Ancienttwo/repo-harness --ref main`
  at 2026-10-31T04:47:17Z on `280fcbca`.
- Run 41169982862. Result: pending at release-preparation time; fill in before
  publishing.
- Daily jobs must include Daily architecture freshness and both MCP path
  matrices. PR-only jobs are skipped by design in daily mode.

## Acceptance environment

- macOS 26 arm64, Bun 1.4.3, Node 24.22.1.
- `bun install --frozen-lockfile` in a fresh worktree.
- `bash scripts/check-npm-release.sh --prepublish`: version must be unpublished
  and helpers must pass.
- `bash scripts/check-ci.sh architecture`: `noop`, `renderEquivalent: true`.
- Package smoke: `npm pack --dry-run` includes `dist/oar-review-host.js` and
  the DSH plugin, and excludes `tasks/` and `plans/`. The docs host is closed
  (#1149), so its bundle is not in the package.

## Publication

- Owner command: `npm publish` from the release branch after the release PR
  merges.
- Then verify the published tarball for #1206 and run the #987 local upgrade
  test from 0.24.3.
- Record the npm version, the Git tag, and the published tarball digest here.
