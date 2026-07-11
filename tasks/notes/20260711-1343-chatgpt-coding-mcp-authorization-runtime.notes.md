# Implementation Notes: chatgpt-coding-mcp-authorization-runtime

> **Status**: Complete
> **Plan**: plans/plan-20260711-1343-chatgpt-coding-mcp-authorization-runtime.md
> **Contract**: tasks/contracts/20260711-1343-chatgpt-coding-mcp-authorization-runtime.contract.md
> **Review**: tasks/reviews/20260711-1343-chatgpt-coding-mcp-authorization-runtime.review.md
> **Last Updated**: 2026-07-11 14:18
> **Lifecycle**: notes

## Root Cause Trace

- `handleMcpPost` creates a new Streamable HTTP transport and MCP server for each initialize request without `Mcp-Session-Id`.
- `createMcpToolContext` constructs a random owner id, `CodingWorkspaceManager`, and `McpProcessSessionManager` for each server.
- ChatGPT's `open_workspace` and following `read` used different transport sessions in the live canary, so the second manager did not know the workspace id.
- Reloading persisted worktrees is not safe: it would expose workspaces across coding authorizations and would not restore in-memory process sessions.

## Design Decisions

- OAuth authorization grant is the runtime owner. It is narrower than DCR client id and survives access/refresh token rotation.
- The authorization id is stored only in local token metadata and used as an opaque registry key; raw ids are not returned by MCP tools or audits.
- An MCP transport close does not close the shared authorization runtime. Explicit token revoke, authorization revision/permission change, coding disable, idle expiry, or server shutdown does.
- Existing coding tokens without the new field fail closed so no weaker derived identity becomes a second authority.
- The existing 30-minute MCP session TTL also bounds idle authorization runtime retention; at 10x scale this registry is the first pressure point.

## Deviations From Plan Or Spec

- The original coding design bound cleanup to MCP transport DELETE/expiry. The live ChatGPT trace falsified that ownership boundary because sequential calls use fresh transports. The corrected invariant is authorization-grant ownership: DELETE/transport expiry closes only that transport; revoke, authorization revision or grant change, coding disable, 30-minute authorization idle expiry, process timeout, or server shutdown closes the shared runtime and its process trees.

## Evidence

- Live failure evidence is recorded in `tasks/notes/20260711-1034-chatgpt-coding-mcp-live-canary.notes.md`.
- Pre-fix local regression artifact: `.ai/harness/runs/pre-fix-20260711-1343-chatgpt-coding-auth-runtime.log`.
- Pre-fix guard failed at the first `read` after transport DELETE/reinitialize because the returned body had `WORKSPACE_NOT_FOUND`; `PRE_FIX_EXIT=1` is recorded in the ignored artifact.
- Post-fix focused suites passed 23 tests across OAuth, HTTP, coding tools, and process sessions. The HTTP E2E now deletes the opening transport, reinitializes, reads/patches, starts a background process, reinitializes again, and polls it successfully.
- The same E2E issues a second OAuth authorization and proves it receives `WORKSPACE_NOT_FOUND`, `PROCESS_ACCESS_DENIED`, and HTTP 404 when attempting to reuse the first authorization's workspace, process, and transport ids.
- Full `bun test`: 1148 pass, 1 platform skip, 0 fail, 11692 expectations across 100 files. Typecheck, deploy SQL order, architecture sync, task sync, strict task workflow, project inspection, and self-migration dry-run also passed.

## Open Questions

- None. The authorization lifecycle boundary is decision-complete for this slice.
