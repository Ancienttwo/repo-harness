# repo-harness 0.9.1 Release Prep Notes

## Context

The `0.9.1` patch line packages the install/setup-check/delegation commits
landed after `v0.9.0`:

- `install.sh` and `install.ps1` now point users to `repo-harness install`
  after bootstrap and print a PATH hint when Bun's bin directory was not
  visible in the original shell.
- Waza/Geju setup-check probes and docs use `bunx skills ...` instead of
  `npx -y skills ...`.
- `repo-harness install --target codex|both --location global` can persist
  `delegation.mode` as `auto` or `explicit` in the global user config.
- The Codex delegation advisor honors auto mode from global config or repo
  policy, with explicit=false state and stop-fallback disabled for implicit
  auto-mode prompts.
- `repo-harness setup check --check-updates` now includes a read-only
  `repo.adopt-refresh` advisory and Agent action when the current adopted repo's
  `repo-harness adopt` dry-run plan has pending operations.
- `archctx-contracts@0.2.1` is now an exact devDependency and the
  `archcontext-boundaries-v1` tests read the package's authoritative schema
  and validator surface instead of a vendored local subset fixture.
- `.archcontext/` is treated as local arch-context scaffold/cache state in
  self-host and generated-repo ignore surfaces.

## Release Boundary

This slice prepares version surfaces and release filing only. It does not
publish to npm, create `v0.9.1`, push a GitHub release, or refresh the local
PATH-visible global install.

Version surfaces updated:

- `package.json`
- `assets/skill-version.json`
- `.claude/.skill-version`
- README current-release lines, including localized READMEs
- `docs/CHANGELOG.md`
- `.gitignore`
- `scripts/init-project.sh`
- `scripts/lib/project-init-lib.sh`
- `scripts/migrate-project-template.sh`
- `deploy/release-checklists/260706-repo-harness-0.9.1.md`
- `package.json`/`bun.lock` now pin self-host-only
  `archctx-contracts@0.2.1` as a devDependency for authoritative schema
  readback in the capability export tests
- `tests/capability-archcontext-export.test.ts`
- `tests/create-project-dirs.runtime.test.ts`
- `src/cli/commands/init-hook.ts`
- `tests/cli/init-hook.test.ts`
- `assets/reference-configs/external-tooling.md`
- `docs/reference-configs/external-tooling.md`
- `tests/migration-script.test.ts`
- `tests/workflow-contract.test.ts`
- `tests/fixtures/archcontext/architecture-node.subset.schema.json` (deleted)

The existing archcontext readback update under
`docs/researches/20260705-archcontext-capability-filing-handover.md` and
the capability export test is a tracked decision-evidence update plus a
dev-time schema verification surface. The generated `.archcontext/` default
scaffold is intentionally not part of this release-prep commit surface.

## Verification

- `bun run check:type`
- `bun test tests/capability-archcontext-export.test.ts`
- `bun test tests/capability-archcontext-export.test.ts tests/scaffold-parity.test.ts tests/workflow-contract.test.ts`
- `bash scripts/check-deploy-sql-order.sh`
- `bash scripts/check-architecture-sync.sh`
- `bash scripts/check-task-sync.sh`
- `repo-harness run check-task-workflow --strict`
- `bun scripts/inspect-project-state.ts --repo . --format text`
- `bash scripts/migrate-project-template.sh --repo . --dry-run`
- `git diff --check`
- `bun test`

Still pending before publish: the release-specific package dry-run, tarball
install smoke, CI readback, npm publish, tag, GitHub release, and
`bash scripts/check-release-published.sh 0.9.1`.
