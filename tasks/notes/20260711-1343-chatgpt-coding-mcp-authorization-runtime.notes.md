# Implementation Notes: chatgpt-coding-mcp-authorization-runtime

> **Status**: Complete
> **Plan**: plans/plan-20260711-1343-chatgpt-coding-mcp-authorization-runtime.md
> **Contract**: tasks/contracts/20260711-1343-chatgpt-coding-mcp-authorization-runtime.contract.md
> **Review**: tasks/reviews/20260711-1343-chatgpt-coding-mcp-authorization-runtime.review.md
> **Last Updated**: 2026-07-11 20:58
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

## External Acceptance Closeout

- The separately authorized post-fix live canary started at `2026-07-11T07:15:23.429Z` and completed at `2026-07-11T07:16:05.280Z` through the stable Cloudflare named Tunnel and a fresh ChatGPT developer-mode OAuth authorization.
- One authorization successfully continued across fresh MCP transports in managed worktree `cws_155e096c-f7ee-4dfe-90d9-3d7aca50db4c`. Metadata-only audit records successful `open_workspace`, cross-transport `read`, atomic `apply_patch`, `exec_command` exit 0, and both final reads.
- Exact file evidence matched the ChatGPT response: `docs/spec.md` ended with `canary-auth-runtime-ok`, and `canary/process.txt` contained `process-auth-runtime-ok`. This directly falsifies the pre-fix `WORKSPACE_NOT_FOUND` failure without relying on model prose.
- The authorization-runtime external acceptance is therefore `pass`. The separate live-canary contract remains `surface_blocked` only at its stricter literal-transcript gate because the current ChatGPT Activity UI omitted some call rows and the conversation became empty after disposable-App deletion.
- Rollback deleted the disposable App, stopped the foreground server and Tunnel replica, restored ignored config/plists/resolver byte-for-byte, returned the pre-existing launchd jobs to their stale `EX_CONFIG` state, preserved main WIP, and retained the managed worktree/audit as local evidence.
