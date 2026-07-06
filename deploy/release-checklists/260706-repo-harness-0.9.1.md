# repo-harness 0.9.1 Release Filing

- Date: 2026-07-06
- Package: `repo-harness@0.9.1`
- Base release: `v0.9.0`
- Release scope: patch release for the Bun-first install/setup surface after
  `0.9.0`: shell/PowerShell install-script next-step and PATH readback
  guidance, `bunx skills` Waza/Geju setup probes, global Codex
  `delegation.mode` selection, hook-side auto-mode honoring, and the
  `repo.adopt-refresh` setup-check advisory for adopted repos, plus the
  `archctx-contracts@0.2.1` schema-authority test migration for
  `archcontext-boundaries-v1` export.
- Publish status: **published**. `repo-harness@0.9.1` is published to npm with
  the `latest` dist-tag, annotated tag `v0.9.1` is pushed, and GitHub release
  `repo-harness 0.9.1` is published.

## Scope

- Updated `install.sh` and `install.ps1` so the post-install next step is
  `repo-harness install`, not the compatibility `repo-harness init` alias.
- Added install-script PATH guidance when the user's original shell did not
  already include Bun's bin directory.
- Replaced Waza/Geju setup-check and docs usage of `npx -y skills ...` with
  `bunx skills ...`, and updated runtime capability reporting so `npx` is no
  longer described as a repo-harness dependency.
- Added `repo-harness install --delegation-mode auto|explicit` for Codex/both
  global installs, preserving existing `~/.repo-harness/config.json` keys.
- Made the Codex delegation advisor honor `delegation.mode=auto` from global
  user config or repo policy, while leaving explicit mode quiet unless the
  prompt contains explicit delegation wording.
- Added a read-only `repo.adopt-refresh` setup-check row and Agent action when
  `setup check --check-updates` sees pending `repo-harness adopt` dry-run
  operations in the current adopted repo.
- Added `.archcontext/` to self-host and generated-repo ignore surfaces so
  local arch-context scaffold/cache state is not committed by default.
- Added exact devDependency `archctx-contracts@0.2.1` and updated
  `tests/capability-archcontext-export.test.ts` to derive the bridge subset
  from the package's authoritative `architecture-node` schema and validate
  `agent-context` support in the package's `projection-target` schema.
- Removed the vendored `tests/fixtures/archcontext/architecture-node.subset.schema.json`
  fixture.

## Preflight Evidence

- `git fetch --tags origin` completed before this filing.
- `git log v0.9.0..HEAD --oneline` showed twelve commits after `v0.9.0`,
  centered on install/setup-check/delegation behavior, the
  `repo.adopt-refresh` advisory, and release-prep workflow filing.
- `npm view repo-harness version dist-tags --json --registry
  https://registry.npmjs.org/` returned `version: 0.9.0` and
  `dist-tags.latest: 0.9.0`, so `0.9.1` was not the current published package.
- `archctx-contracts@0.2.1` package readback found
  `schemas/repo/architecture-node.schema.json`,
  `schemas/runtime/projection-target.schema.json`, package
  `exports["./schemas/*"]`, and `agent-context` in both the projection-target
  schema and `src/ledger.ts`.

## Verification

- Completed after the `archctx-contracts@0.2.1` dependency/test migration:
  `bun run check:type`,
  `bun test tests/capability-archcontext-export.test.ts`,
  `bun test tests/capability-archcontext-export.test.ts tests/scaffold-parity.test.ts tests/workflow-contract.test.ts`,
  `bash scripts/check-deploy-sql-order.sh`,
  `bash scripts/check-architecture-sync.sh`,
  `bash scripts/check-task-sync.sh`,
  `repo-harness run check-task-workflow --strict`,
  `bun scripts/inspect-project-state.ts --repo . --format text`,
  `bash scripts/migrate-project-template.sh --repo . --dry-run`,
  `git diff --check`, and `bun test`.
- Completed after the `repo.adopt-refresh` setup-check advisory landed:
  `bun test tests/cli/init-hook.test.ts tests/cli/adoption-plan.test.ts tests/readme-dx.test.ts`
  (53 pass), `bun run check:type`, `git diff --check`, and docs/assets
  external-tooling mirror comparison.
- Release package readback completed:
  `npm pack --dry-run --json --ignore-scripts` reported
  `repo-harness@0.9.1` with 365 package files.
- Real setup-check readback completed:
  `bun src/cli/index.ts setup check --target codex --check-updates --json`
  returned `status: attention` with `repo.adopt-refresh` as `needs_agent` and
  Agent command `repo-harness adopt --repo '/Users/kito/Projects/repo-harness'`.
  The matching `adopt --dry-run --json --repo .` planned one managed
  `.gitignore` block refresh and made no writes.
- Full release gate passed on 2026-07-06:
  `bun run check:release` completed with 1094 tests passing, 1 skipped, 0
  failed; workflow checks, repository inspection, package dry-run, and tarball
  smoke passed. The smoke line reported:
  `repo-harness-0.9.1.tgz installs and packaged CLI bins start`.
- CI readback completed for the source commit:
  `c27a36e858b99776e84bdca5ce25b4acf122ba5b` passed GitHub Actions CI run
  `28781757374`, including the main Test job and Windows/Ubuntu/macOS MCP path
  matrix.
- Publish readback completed:
  `npm publish` ran the package gate again before upload with 1096 tests
  passing, 1 skipped, 0 failed; the package gate, package dry-run, and tarball
  smoke passed.
- npm registry readback completed:
  `npm view repo-harness version dist-tags --json --registry https://registry.npmjs.org/`
  returned `version: 0.9.1` and `dist-tags.latest: 0.9.1`.
- npm package metadata readback completed:
  `npm view repo-harness@0.9.1 version gitHead dist.tarball dist.integrity --json`
  returned `gitHead: c27a36e858b99776e84bdca5ce25b4acf122ba5b` and tarball
  `https://registry.npmjs.org/repo-harness/-/repo-harness-0.9.1.tgz`.
- Annotated tag readback completed:
  `v0.9.1` points to `c27a36e858b99776e84bdca5ce25b4acf122ba5b` and is pushed
  to `origin`.
- GitHub release readback completed:
  `https://github.com/Ancienttwo/repo-harness/releases/tag/v0.9.1` is
  published, not draft, not prerelease, and targets
  `c27a36e858b99776e84bdca5ce25b4acf122ba5b`.
- Final release readback passed:
  `bash scripts/check-release-published.sh 0.9.1` reported registry,
  dist-tag, tarball, tag, and local version files agree.

## Publish Checklist

- [x] Push the release-prep commit to `origin/main`.
- [x] Confirm CI for the pushed commit is green.
- [x] Publish `repo-harness@0.9.1` to npm with the `latest` dist-tag.
- [x] Push annotated tag `v0.9.1` at the published source commit.
- [x] Create GitHub release `repo-harness 0.9.1`.
- [x] Run `bash scripts/check-release-published.sh 0.9.1`.
