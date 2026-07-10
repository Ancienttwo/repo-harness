# Architecture Module: runtime-mcp/general-repo-access

> **Capability ID**: `runtime-mcp-general-repo-access`
> **Matched Prefixes**: `src/cli/mcp/general-repo-access.ts`, `src/cli/mcp/general-repo-access`, focused MCP reader/policy/tool tests
> **Local Contracts**: `AGENTS.md`, `CLAUDE.md`

## P1 Map

This capability owns the registered-repository access tool implementation and its path-authority safety boundary.

- `src/cli/mcp/general-repo-access.ts` remains the single MCP tool-definition and dispatch owner.
- `src/cli/mcp/general-repo-access/authority.ts` owns internal repository identity, ignore policy, repo-relative path normalization, symlink containment, and registered-repo checks.
- Existing MCP auth, audit, policy, workspace, and CodeGraph modules remain sibling dependencies; this capability does not create a plugin interface or public API.

The MCP tool names, input schemas, result shapes, and audit records are public behavior and remain unchanged.

## P2 Trace

Concrete route: MCP request -> authentication and policy -> registered repo resolution -> path/ignore/containment validation -> read or mutation dispatch -> audit/result. Authority and path checks run before filesystem or index access. Invalid repository identity, traversal, ignored paths, symlink escape, or stale mutation preconditions fail closed.

## P3 Decision

Extract only the safety logic shared by read, search, write, patch, move, and delete paths. Keep dispatch in the existing entrypoint so the change shrinks one proven responsibility without adding an extension system. At 10x repository count, registry lookup and snapshot/cache invalidation fail before the internal module boundary does.

## Verification

- `bun test tests/cli/mcp-reader-tools.test.ts tests/cli/mcp-codegraph-contract.test.ts`
- `bun test tests/cli/mcp-policy.test.ts tests/cli/mcp-tools.test.ts`
- `bun run check:type`
