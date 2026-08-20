> **Archived**: 2026-08-20 18:10
> **Related Plan**: (none)
> **Outcome**: Superseded
> **Lifecycle**: notes
> **Parent Run ID**: orphan-family-sweep

# npx init stdio Notes

## Context

`repo-harness init` previously delegated to `scripts/setup-plugins.sh` for
global Claude plugin and hook-profile bootstrap. The CLI wrapper used
`spawnSync` with captured stdout/stderr, so users running
`npx -y repo-harness init` saw a blank terminal until the whole setup script
exited.

## Decision

- Replace the public `init` shell wrapper with typed global bootstrap steps:
  install the current package as the global CLI, sync repo-harness skill aliases,
  install user-level hook adapters, configure Waza
  `think`/`hunt`/`check`/`health`, persist the brain root, and configure
  CodeGraph MCP.
- Keep `runGlobalRuntimeSetup` returning bounded `stdout`/`stderr` fields for
  tests and programmatic callers, but render step lines directly from the CLI.
- Remove the Superpowers Claude marketplace installer path entirely.

## Verification

- `bun test tests/cli/global-runtime-init.test.ts`
- `bun src/cli/index.ts init --help`
- `bun src/cli/index.ts update --help`
- `HOME="$(mktemp -d)" bun src/cli/index.ts init` streamed the banner and clone
  progress immediately, then completed successfully against the temporary home.
- `repo-harness@0.2.2` was published to the official npm registry after the
  release gate passed twice; clean-temp `npx` smoke confirmed default `init`
  creates no Superpowers output or files.
- Follow-up hardening removes the Superpowers installer path entirely from
  `repo-harness init`, `scripts/setup-plugins.sh`, and current plugin guidance;
  the next npm patch is `repo-harness@0.2.3`.
- The active `init` path no longer calls `scripts/setup-plugins.sh`; that script
  is legacy-only and should not be treated as the current setup authority.
