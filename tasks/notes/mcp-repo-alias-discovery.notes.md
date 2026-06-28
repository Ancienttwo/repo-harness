# MCP Repo Alias Discovery Notes

> **Date**: 2026-06-29
> **Slice**: mcp-repo-alias-discovery

## Decision

Allow `discover_harness_repos` to accept `query`, `name`, or `repo_path` filters,
and resolve repo-like `repo_path` values such as `my-app/` through authorized
discovery before falling back to literal path handling.

## Boundary

Alias resolution does not widen filesystem access. Candidates must still come
from the registered repo index or explicit allowed/discovery roots, and
ambiguous aliases fail closed.

## Verification

- `bun test tests/cli/mcp-tools.test.ts`
- `bun test tests/cli/mcp-setup.test.ts tests/action-command-skills.test.ts tests/cli/chatgpt-browser.test.ts`
- `bun test`
