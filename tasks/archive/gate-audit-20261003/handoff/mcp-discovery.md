# repo-harness MCP Discovery

Updated: 2026-06-17
Sprint: `plans/sprints/20260617-repo-harness-mcp-sprint.md`
PRD: `plans/prds/20260617-repo-harness-mcp-prd.md`

## P1 Map

- CLI entrypoint is `src/cli/index.ts`; top-level commands are registered in `buildProgram()` with small command builders imported from `src/cli/commands/*`.
- Existing command-builder pattern is represented by `buildRunCommand()`, `buildToolsCommand()`, `buildBrainCommand()`, and `buildDocsCommand()`.
- Runtime helper execution is centralized in `src/cli/runtime/helper-runner.ts`; fixed workflow checks should reuse `runHelper()` instead of exposing arbitrary shell.
- Repo-local workflow authority for this sprint is `plans/**`, `tasks/**`, `.ai/context/**`, `.ai/harness/**`, `docs/spec.md`, and root agent context files.
- Reference repo `_ref/local-dev-mcp` is read-only input. It proves useful patterns for MCP transport, denied paths, redaction, OAuth/passphrase, and audit logs, but its broad local-dev filesystem/shell surface is explicitly out of scope for repo-harness MVP.

## P2 Trace

Concrete CLI route:

`bun src/cli/index.ts <command>` -> `runCli()` -> `buildProgram().parseAsync()` -> command builder action -> command module implementation -> process exit code.

Expected MCP route:

`repo-harness mcp serve --repo . --transport stdio|http --profile planner` -> `buildMcpCommand()` -> `startMcpServer()` -> policy-scoped tools -> workflow artifact read/write helpers -> JSON MCP content or structured CLI result.

Fixed workflow check route:

MCP tool `run_workflow_check` -> repo root resolution -> `runHelper({ helper: "check-task-workflow", args: ["--strict"], stdio: "pipe" })` -> redacted stdout/stderr -> audit metadata.

## P3 Decision

- Add `src/cli/commands/mcp.ts` for command registration, mirroring existing command-builder style.
- Put reusable MCP policy, path, redaction, audit, tool, and setup logic under `src/cli/mcp/` so command parsing stays thin.
- Use least-privilege workflow artifacts as the compatibility boundary. Planner profile can write planning and handoff files only; it cannot write `src/**`, app/package code, package manifests, lockfiles, CI, secrets, or files outside repo root.
- Preserve repo-harness' current design: it coordinates workflow artifacts and checks; it does not become a general local development gateway.

## Preferred Test Surface

- Focused CLI scaffold: `bun test tests/cli/mcp.test.ts`
- Policy/path core: `bun test tests/cli/mcp-policy.test.ts`
- Full repo gate: `bun run check:ci`
- Required sprint smoke: `repo-harness mcp --help`, `repo-harness mcp serve --help`, `repo-harness mcp doctor --help`, `repo-harness mcp setup --help`

## Risk Notes

- Path handling must normalize to repo-relative POSIX paths and block traversal, absolute paths, symlink escapes, denied globs, and oversized reads.
- Config patching must preserve unrelated TOML content and create a backup before mutation.
- HTTP `/mcp` must not print secrets or bind to `0.0.0.0` unless explicitly requested.
- Audit logging must record metadata and input hashes, not raw prompts or secret-like content.
