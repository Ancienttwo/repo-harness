> **Archived**: 2026-08-20 18:10
> **Related Plan**: plans/archive/plan-20260613-2245-v05-command-boundary-refactor.md
> **Outcome**: Superseded
> **Lifecycle**: notes
> **Parent Run ID**: orphan-family-sweep

# Implementation Notes: v0.5 Command Boundary Refactor

> **Status**: Active slice notes
> **Plan**: `plans/archive/plan-20260613-2245-v05-command-boundary-refactor.md`
> **Local Ref**: `plans/repo-harness-v0.5-refactor-plan.md`
> **Issue**: https://github.com/Ancienttwo/repo-harness/issues/2

## P1 Map

- CLI entrypoint: `src/cli/index.ts`
- Existing repo workflow implementation: `src/cli/commands/init.ts::runInit`
- User runtime bootstrap: `src/cli/commands/global-runtime.ts::runGlobalRuntimeSetup`
- Read-only readiness checklist: `src/cli/commands/init-hook.ts::runInitHook`
- Shell migration entrypoint: `scripts/migrate-project-template.sh`
- Legacy context discovery and mirroring: `scripts/lib/project-init-lib.sh`
- Focused tests: `tests/cli/init.test.ts`, `tests/cli/global-runtime-init.test.ts`, `tests/cli/init-hook.test.ts`, `tests/migration-script.test.ts`

## P2 Trace

Issue path before the change:

```text
repo-harness update
  -> src/cli/index.ts update action
  -> runInit(common)
  -> inspect-project-state.ts --repo <cwd or --repo>
  -> migrate-project-template.sh --repo <target> --apply
  -> pi_legacy_context_block_candidates()
  -> raw find over <target>
  -> pi_install_directory_context_files()
  -> cp AGENTS.md <-> CLAUDE.md in discovered dirs
```

When `<target>` is `$HOME`, discovery crosses project ownership boundaries and can enter read-only vendored caches such as `go/pkg/mod`. The failing `cp` is a symptom of the command boundary being too broad.

## P3 Decision

The accepted refactor is to make command ownership explicit now:

- `update` is user-level runtime refresh.
- `update --check` and `update --no-runtime-refresh` are read-only setup
  readiness aliases.
- `update` does not bootstrap third-party skills or CodeGraph by default; those
  require explicit opt-in flags.
- `adopt` is repo-level workflow refresh and migration.
- `adopt` rejects user-level CodeGraph and brain configuration flags instead of
  quietly writing HOME through a repo command.
- `setup check` is the productized read-only readiness check.

The shell hardening remains necessary because `migrate-project-template.sh` is still callable directly and v0.4 users may have old wrapper paths. The shell change is defensive, not the primary fix.

## Tradeoff

This is a breaking CLI surface change for users of `repo-harness update --repo`. The command now emits a direct migration hint instead of silently refreshing repo files. That is intentional because the old behavior can mutate `$HOME` before failing.
