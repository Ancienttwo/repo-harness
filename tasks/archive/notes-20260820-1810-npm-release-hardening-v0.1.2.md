> **Archived**: 2026-08-20 18:10
> **Related Plan**: (none)
> **Outcome**: Superseded
> **Lifecycle**: notes
> **Parent Run ID**: orphan-family-sweep

# npm-release-hardening-v0.1.2 Notes

## Context

The next npm publish cannot reuse `repo-harness@0.1.1`; npm already reports that version as the `latest` dist-tag. The current release slice also had a half-wired `repo-harness init` CodeGraph CLI surface: `runInit` already understood CodeGraph options, but the public commander entrypoint, tests, and release gate did not yet close the path.

## Decisions

- Bump only the npm/CLI package line to `0.1.2`; keep the generated workflow compatibility line at `5.2.3`.
- Keep CodeGraph MCP registration explicit behind `--configure-codegraph`. Default `init` can ensure the index and report missing MCP registration, but it must not silently mutate global Codex/Claude MCP config.
- Add a single `scripts/check-npm-release.sh` prepublish gate instead of relying on manual release memory. The script rejects duplicate npm versions, then runs the repo's existing test/workflow/migration/pack gates.
- Have the release gate materialize dependencies with `bun install --frozen-lockfile` first, because isolated release worktrees do not necessarily share `node_modules`.
- Raise `doctor` test timeouts for read-only environment probes to 10s. The assertions are unchanged; the previous 5s default was tight enough to make release checks flaky under full-suite load.

## Verification Surface

- `bun test tests/cli/init.test.ts tests/bootstrap-files.test.ts`
- `bun test tests/cli/doctor.test.ts`
- `bash scripts/check-task-sync.sh`
- `bash scripts/check-task-workflow.sh --strict`
- `npm run check:release`
