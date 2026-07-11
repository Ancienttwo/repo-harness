# Plan: ChatGPT Coding MCP authorization runtime

> **Status**: Complete
> **Created**: 20260711-1343
> **Slug**: chatgpt-coding-mcp-authorization-runtime
> **Artifact Level**: work-package
> **Promotion Reason**: verification_boundary
> **Verification Boundary**: sequential coding calls remain usable when ChatGPT initializes a new Streamable HTTP transport session for each call
> **Rollback Surface**: OAuth coding token metadata and in-memory coding runtime lifecycle
> **Spec**: `docs/spec.md`
> **Research**: `docs/researches/chatgpt-coding-mcp.md`
> **Task Contract**: `tasks/contracts/20260711-1343-chatgpt-coding-mcp-authorization-runtime.contract.md`
> **Task Review**: `tasks/reviews/20260711-1343-chatgpt-coding-mcp-authorization-runtime.review.md`
> **Implementation Notes**: `tasks/notes/20260711-1343-chatgpt-coding-mcp-authorization-runtime.notes.md`

## Agentic Routing

- Selected route: repo-harness-repair in the existing isolated feature worktree.
- Routing reason: the live canary produced a deterministic product defect with an exact request trace and a bounded regression surface.
- Due diligence:
  - P1 map: `transports/http.ts` owns OAuth-authenticated transport sessions; `oauth.ts` owns grants and token rotation; `server.ts` constructs coding workspace/process runtimes; `coding-workspaces.ts` and `process-sessions.ts` enforce workspace/process ownership.
  - P2 trace: ChatGPT initialize A -> `createRepoHarnessMcpServer` -> random runtime owner -> `open_workspace`; ChatGPT initialize B -> another server/random owner -> `read` -> `WORKSPACE_NOT_FOUND`.
  - P3 decision rationale: bind a shared coding runtime to a distinct OAuth authorization grant, not an MCP transport or OAuth client. Preserve the grant identity across refresh rotation; destroy the runtime on revoke, authorization revision/permission change, idle expiry, or server shutdown.

## Workflow Inventory

- Active plan: `plans/plan-20260711-1343-chatgpt-coding-mcp-authorization-runtime.md`
- Task contract: `tasks/contracts/20260711-1343-chatgpt-coding-mcp-authorization-runtime.contract.md`
- Task review: `tasks/reviews/20260711-1343-chatgpt-coding-mcp-authorization-runtime.review.md`
- Implementation notes: `tasks/notes/20260711-1343-chatgpt-coding-mcp-authorization-runtime.notes.md`
- Deferred-goal ledger: `tasks/todos.md`
- Current checks: `.ai/harness/checks/latest.json`
- Run snapshots: `.ai/harness/runs/`
- Scope authority: the matching task contract `allowed_paths`.
- Execution isolation: remain in `/Users/kito/Projects/repo-harness-wt-chatgpt-coding-mcp`; do not touch the dirty main checkout.

## Approach

### Strategy

Issue a random `authorizationId` with each coding authorization-code exchange, persist it in access-token metadata, and preserve it across refresh rotation. The HTTP server uses that opaque grant id to acquire one bounded shared coding runtime across transport sessions. Transport DELETE closes only the transport; grant lifecycle events close the shared runtime.

### Trade-offs

| Option | Pros | Cons | Decision |
|--------|------|------|----------|
| Keep transport ownership | Simple and currently isolated | Incompatible with observed ChatGPT calls | Reject |
| Key by OAuth client id | Stable across calls | Collapses separate user authorizations for one DCR client | Reject |
| Reload persisted worktrees globally | Minimal server changes | Cross-grant workspace exposure; does not solve process polling | Reject |
| Key by authorization grant id | Supports multi-call flows while preserving grant isolation | Requires a small runtime registry and lifecycle hooks | Use |

## Detailed Design

### File Changes

| File | Action | Description |
|------|--------|-------------|
| `src/cli/mcp/oauth.ts` | update | Add coding authorization identity, refresh preservation, fail-closed legacy-token handling, and revoke notification. |
| `src/cli/mcp/server.ts` | update | Make coding runtime an injectable lifecycle object instead of always transport-owned. |
| `src/cli/mcp/transports/http.ts` | update | Add authorization-scoped runtime registry with idle/revision/revoke/shutdown cleanup. |
| `src/cli/mcp/coding-workspaces.ts` | update | Align workspace ownership errors with the authorization boundary. |
| `src/cli/mcp/process-sessions.ts` | update | Align process ownership errors with the authorization boundary. |
| `docs/architecture/modules/runtime-harness/mcp-sidecar.md` | update | Make the authorization runtime and its cleanup events authoritative architecture truth. |
| `docs/reference-configs/chatgpt-coding-mcp.md` | update | Document cross-transport continuity and operator-visible cleanup semantics. |
| `docs/researches/20260711-devspace-chatgpt-local-control.md` | update | Correct the DevSpace comparison after the live ChatGPT trace. |
| `tests/cli/mcp-oauth.test.ts` | update | Lock authorization identity, refresh rotation, legacy rejection, and revoke notification. |
| `tests/cli/mcp-http.test.ts` | update | Reproduce ChatGPT's new-session-per-tool behavior and cross-grant isolation. |

### Data Flow

`authorization_code` -> random grant id -> access token metadata -> verified `/mcp` request -> grant runtime registry -> injected server context -> workspace/process manager shared across transport sessions.

## Risk Assessment

| Risk | Likelihood | Impact | Mitigation |
|------|------------|--------|------------|
| Separate grants share state | Low | High | Use a per-authorization random id; add negative cross-grant test. |
| Transport DELETE kills a live multi-call flow | Medium | High | Shared runtime lifecycle is independent of transport close. |
| Revoked or downgraded access leaves shell running | Low | High | Close runtimes on revoke, revision/grant change, disable, idle expiry, and shutdown. |
| Registry growth at 10x use | Medium | Medium | Bound live transports and expire authorization runtimes after the existing 30-minute session TTL. |

## Promotion Gate

- Merge/PR unit: OAuth grant identity plus the shared runtime lifecycle and regression tests are one security boundary.
- Rollback surface: revert the source/test commit; existing tokens without the new id fail closed and require reauthorization.
- Verification boundary: fresh transport sessions can open/read/patch/start/poll for one grant, while a second grant is rejected.
- Review/acceptance boundary: matching review recommends pass after focused and required checks.
- High-risk surface: arbitrary local-user shell ownership and OAuth revocation.
- Why not checklist row: splitting token identity from runtime lifecycle would temporarily weaken either compatibility or isolation.

## Evidence Contract

- State/progress path: this plan, matching contract/notes/review, `tasks/current.md`, and `.ai/harness/handoff/`.
- Verification evidence: pre-fix regression artifact, focused MCP tests, typecheck, and required repo checks.
- Evaluator rubric: same-grant continuity, different-grant isolation, lifecycle cleanup, and zero planner regression.
- Stop condition: all task items complete and review recommends pass.
- Rollback surface: the bounded OAuth/server/HTTP source changes.

## EXECUTION_BOUNDARY (Non-Goals)

- Do not weaken canonical path, symlink, secret-path, Host, CORS, redirect, revision, or process ownership checks.
- Do not use `clientId`, repo id, workspace id, token string, or persisted worktree metadata as a substitute authorization principal.
- Do not add a legacy-token fallback: coding tokens without `authorizationId` must reauthorize.
- Do not modify Cloudflare, DNS, ChatGPT App, live user config, or the dirty main checkout in this implementation slice.
- Requirements absent from this plan are forbidden design space; unrequested extras fail closed.

## Task Breakdown

- [x] Add and capture a failing ChatGPT-style cross-transport regression guard.
- [x] Implement authorization-grant identity and refresh/revoke semantics.
- [x] Share coding workspaces and process sessions within one authorization only.
- [x] Verify focused suites, full required checks, workflow artifacts, and review.
