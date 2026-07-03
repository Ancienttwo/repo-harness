# Sprint Backlog Global Runtime Root Notes

## Context

`repo-harness run sprint-backlog` was reported reading and writing sprint state
under the installed Bun global package assets directory instead of the caller's
target repository.

## Root Cause

The workspace source and tarball output already contained the fixed
`REPO_HARNESS_TARGET_REPO_ROOT` path, but the local Bun global install still had
stale copies of `sprint-backlog.sh` under both `assets/templates/helpers/` and
`scripts/`. That stale helper derived the repo root from its own package path,
so `status` read the package orphan sprint and `init` wrote new sprint files
under package assets.

## Fix Boundary

- Added a tarball smoke check that installs the packed CLI, creates a 5-row
  target-repo sprint fixture, and verifies packaged `sprint-backlog status`
  reads the target repo state.
- Synchronized the local Bun global `sprint-backlog.sh` helper copies from the
  workspace source so the currently installed CLI uses the same target-root
  contract.
- Did not change sprint file semantics, active sprint selection, backlog
  parsing, or product compatibility behavior.

## Verification

- `repo-harness run sprint-backlog status` in a temporary 5-row repo reports
  `tasks_total: 5`.
- `repo-harness run sprint-backlog init` in a temporary repo creates the sprint
  under that repo's `plans/sprints/` and does not create a same-slug file under
  the global package assets directory.
- `bash scripts/check-tarball-install-smoke.sh` verifies the packaged CLI path.

## Dependency Loop Follow-Up

The stale global helper was repairable by synchronizing files manually, but the
CLI-owned refresh path also needed a fix: `repo-harness install` from the
workspace calls `bun add -g <sourceRoot>`, and Bun can report
`DependencyLoop` when the global manifest already contains `repo-harness`.

The runtime installer now handles only that exact local-source `repo-harness`
case by packing the workspace with `npm pack --json` into the stable user cache
`~/.repo-harness/packages/`, then running `bun remove -g repo-harness` followed
by `bun add -g <cached-tarball>`. Package-channel installs such as
`repo-harness@latest` and `repo-harness@9.9.9` keep their existing fail-closed
behavior.

Verification:

- `bun test tests/cli/global-runtime-init.test.ts --timeout 30000`
- `bun src/cli/index.ts install --target codex --no-sync-skill --no-hooks --no-external-skills --no-codegraph --json`
- `repo-harness --version` reports `0.8.4`.
- The Bun global manifest now points `repo-harness` at
  `/Users/ancienttwo/.repo-harness/packages/repo-harness-0.8.4.tgz`.
- The installed global `scripts/sprint-backlog.sh` and
  `assets/templates/helpers/sprint-backlog.sh` match the workspace source.
