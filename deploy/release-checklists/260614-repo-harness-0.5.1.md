# Release Filing: repo-harness 0.5.1

Date: 2026-06-14
Status: Prepared for release

## Scope

- Package target: `repo-harness@0.5.1`
- Base release: `v0.5.0`
- Release branch: `main`
- Registry: `https://registry.npmjs.org/`

## Version Decision

Use `0.5.1` as a patch release. The public command lifecycle remains the
`0.5.0` boundary; this release fixes CodeGraph readiness detection and syncs the
same resolver into the generated helper template.

## Required Alignment

- `package.json`
- `.claude/.skill-version`
- `assets/skill-version.json`
- README current release/stamp references
- `docs/CHANGELOG.md`
- version expectation tests
- `scripts/check-agent-tooling.sh`
- `assets/templates/helpers/check-agent-tooling.sh`

## Preflight Evidence

- `npm view repo-harness version dist-tags --json --registry https://registry.npmjs.org/`
  returned current latest `0.5.0` before the version bump.
- `npm view repo-harness@0.5.1 version --json --registry https://registry.npmjs.org/`
  returned `E404`, proving the target package is unpublished before publish.
- `repo-harness setup check --target codex --check-updates --json` reported
  CodeGraph `update=up-to-date`, no `fail`, and no `needs_agent` after the
  bounded CodeGraph update.

## Verification

- `bun src/cli/index.ts --version` returned `0.5.1`.
- `bun src/cli/index.ts status --json` returned CLI version `0.5.1` and `8`
  managed routes with event breakdown `SessionStart=1`, `PreToolUse=2`,
  `PostToolUse=3`, `UserPromptSubmit=1`, and `Stop=1`.
- Focused affected suite passed:
  - `bun test tests/bootstrap-files.test.ts tests/skill-version.test.ts tests/check-agent-tooling.test.ts tests/cli/codegraph.test.ts tests/cli/codegraph-resolver.test.ts tests/tooling/codegraph-integration.test.ts`
  - Result: `41 pass`, `0 fail`, `598` expectations.
- First `bun run check:release` reached full `bun test` and reported one
  transient subprocess-signal failure in
  `ship-worktrees should put dirty main closeout on a PR branch`; direct focused
  reproduction passed immediately.
- Final `BUN_TEST_TIMEOUT_MS=180000 BUN_TEST_MAX_CONCURRENCY=1 bun run check:release`
  passed:
  - npm registry uniqueness for `repo-harness@0.5.1`
  - `bun install --frozen-lockfile`
  - `bun test` (`744 pass`, `0 fail`, `7260` expectations across `71` files)
  - `bash scripts/check-deploy-sql-order.sh`
  - `bash scripts/check-architecture-sync.sh`
  - `bash scripts/check-task-sync.sh`
  - `REPO_HARNESS_SKIP_RESUME_REFRESH=1 bash scripts/prepare-handoff.sh "ci gate"`
  - `bash scripts/codex-handoff-resume.sh --cwd . --reason "ci gate"`
  - `bash scripts/check-task-workflow.sh --strict`
  - `bun scripts/inspect-project-state.ts --repo . --format text`
  - `bash scripts/migrate-project-template.sh --repo . --dry-run`
  - `npm pack --dry-run --json`
  - Result: `[release] OK: npm package gate passed.`
- Visible `npm pack --dry-run --json` inspection reported
  `repo-harness-0.5.1.tgz`, `280` files, package size `4680843`, unpacked size
  `6509904`, shasum `4bd65926c5516ff1b461ea9ec272c407250a7957`, and included
  both `scripts/check-agent-tooling.sh` and
  `assets/templates/helpers/check-agent-tooling.sh`.
