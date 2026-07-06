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
- Publish status: **prepared, not published**. No `v0.9.1` tag, GitHub release,
  or npm publish has been created in this prep slice.

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
- `git log v0.9.0..HEAD --oneline` showed eight commits after `v0.9.0`,
  centered on install/setup-check/delegation behavior.
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
- Still pending before publish: release-specific package dry-run, tarball
  install smoke, CI readback, npm publish, tag, GitHub release, and
  `bash scripts/check-release-published.sh 0.9.1`.

## Publish Checklist

- [ ] Push the release-prep commit to `origin/main`.
- [ ] Confirm CI for the pushed commit is green.
- [ ] Publish `repo-harness@0.9.1` to npm with the `latest` dist-tag.
- [ ] Push annotated tag `v0.9.1` at the published source commit.
- [ ] Create GitHub release `repo-harness 0.9.1`.
- [ ] Run `bash scripts/check-release-published.sh 0.9.1`.
