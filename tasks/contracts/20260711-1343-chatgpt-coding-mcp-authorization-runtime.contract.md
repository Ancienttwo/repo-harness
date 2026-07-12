# Task Contract: chatgpt-coding-mcp-authorization-runtime

> **Status**: Fulfilled
> **Plan**: plans/plan-20260711-1343-chatgpt-coding-mcp-authorization-runtime.md
> **Task Profile**: bugfix
> **Owner**: kito
> **Capability ID**: root
> **Last Updated**: 2026-07-11 21:11
> **Review File**: `tasks/reviews/20260711-1343-chatgpt-coding-mcp-authorization-runtime.review.md`
> **Notes File**: `tasks/notes/20260711-1343-chatgpt-coding-mcp-authorization-runtime.notes.md`
> **Exemplar**: `docs/reference-configs/contract-brief-example.md`

## Why

The live ChatGPT canary proved that sequential tool calls may use distinct MCP transport sessions. The current transport-owned coding runtime loses the workspace and any process session after that boundary, so direct coding cannot complete a normal open/read/patch/run/poll flow.

## Goal

Make coding workspace and process state stable across MCP transport sessions belonging to one OAuth authorization grant, while keeping separate authorizations isolated and preserving fail-closed cleanup on revoke, authorization revision/permission change, idle expiry, and server shutdown.

## Scope

- In scope:
  - Add an opaque coding authorization id to OAuth token metadata and preserve it across refresh rotation.
  - Reject pre-change coding tokens without the authorization id.
  - Inject one authorization-scoped workspace/process runtime into each new transport server.
  - Keep transport DELETE independent from authorization runtime cleanup.
  - Add same-grant continuity, different-grant isolation, refresh, revoke, and stale-token regression coverage.
- Out of scope:
  - Cloudflare, DNS, ChatGPT App, live canary, user config, worktree cleanup, schema changes, sandboxing, or new dependencies.
  - Any change in `/Users/kito/Projects/repo-harness`.
- Taste constraints: one authorization identity source of truth; no client-id fallback, global workspace reload, dual authority, or compatibility shim.

## Stop Conditions

- Stop if a fix requires weakening existing workspace/process/repo authorization checks.
- Stop if a path outside Allowed Paths is required; revise the contract first.
- Stop if the regression cannot reproduce with a new MCP session under the same bearer token.

## Falsifier

The design is wrong if ChatGPT's second call actually retains the first MCP session, or if a distinct OAuth authorization must intentionally share workspaces. The live audit and a local new-session-per-call regression test are the cheapest proof and show neither condition.

## Root Cause Evidence

- root_cause: `src/cli/mcp/transports/http.ts` creates a new server for every initialize without a session id, and `src/cli/mcp/server.ts` gives each server a random owner plus new in-memory workspace/process managers.
- repro: initialize session A and call `open_workspace`, initialize session B with the same coding bearer token, then call `read` with the returned workspace id; unfixed code returns `WORKSPACE_NOT_FOUND`.
- regression_guard: tests/cli/mcp-http.test.ts
- pre_fix_failure_artifact: .ai/harness/runs/pre-fix-20260711-1343-chatgpt-coding-auth-runtime.log

## Workflow Inventory

- Source plan: `plans/plan-20260711-1343-chatgpt-coding-mcp-authorization-runtime.md`
- Deferred-goal ledger: `tasks/todos.md`
- Review file: `tasks/reviews/20260711-1343-chatgpt-coding-mcp-authorization-runtime.review.md`
- Notes file: `tasks/notes/20260711-1343-chatgpt-coding-mcp-authorization-runtime.notes.md`
- Checks file: `.ai/harness/checks/latest.json`
- Run snapshots: `.ai/harness/runs/`
- Scope gate: edit only paths listed under `allowed_paths`.
- Completion gate: strict workflow check and matching review recommendation pass.

## Allowed Paths

```yaml
allowed_paths:
  - plans/plan-20260711-1343-chatgpt-coding-mcp-authorization-runtime.md
  - tasks/current.md
  - tasks/contracts/20260711-1343-chatgpt-coding-mcp-authorization-runtime.contract.md
  - tasks/reviews/20260711-1343-chatgpt-coding-mcp-authorization-runtime.review.md
  - tasks/notes/20260711-1343-chatgpt-coding-mcp-authorization-runtime.notes.md
  - .ai/harness/handoff/
  - .ai/harness/runs/
  - src/cli/mcp/oauth.ts
  - src/cli/mcp/server.ts
  - src/cli/mcp/transports/http.ts
  - src/cli/mcp/coding-workspaces.ts
  - src/cli/mcp/process-sessions.ts
  - docs/architecture/modules/runtime-harness/mcp-sidecar.md
  - docs/reference-configs/chatgpt-coding-mcp.md
  - docs/researches/20260711-devspace-chatgpt-local-control.md
  - tests/cli/mcp-oauth.test.ts
  - tests/cli/mcp-http.test.ts
```

## Delegation Contract

```yaml
delegation:
  budget:
    tokens: null
    tool_calls: null
    wall_time_minutes: null
  permission_scope:
    mode: inherit_allowed_paths
    writable_paths: []
    network: inherited
  roles:
    parent:
      mode: implement_and_gatekeep
      purpose: security_boundary_owner
  runner:
    preferred:
      - main-thread
    fallback: main-thread
    brief_is_authoritative: true
```

## Exit Criteria (Machine Verifiable)

```yaml
exit_criteria:
  files_exist:
    - plans/plan-20260711-1343-chatgpt-coding-mcp-authorization-runtime.md
  artifacts_exist:
    - .ai/harness/runs/pre-fix-20260711-1343-chatgpt-coding-auth-runtime.log
    - tasks/notes/20260711-1343-chatgpt-coding-mcp-authorization-runtime.notes.md
  tests_pass:
    - path: tests/cli/mcp-http.test.ts
    - path: tests/cli/mcp-oauth.test.ts
  commands_succeed:
    - bun run check:type
    - bun test
    - bash scripts/check-deploy-sql-order.sh
    - bash scripts/check-architecture-sync.sh
    - bash scripts/check-task-sync.sh
    - repo-harness run check-task-workflow --strict
    - bun scripts/inspect-project-state.ts --repo . --format text
    - bash scripts/migrate-project-template.sh --repo . --dry-run
  qa_scores:
    - dimension: functionality
      min: 8
  manual_checks:
    - "Evaluator review file recommends pass"
```

## Acceptance Notes (Human Review)

- Functional behavior: one coding OAuth grant can continue workspace and process interactions across fresh transport sessions.
- Edge cases: refresh preserves identity; revoke, revision/permission change, idle expiry, and shutdown terminate the runtime; legacy coding tokens fail closed.
- Regression risks: planner OAuth and same-transport coding behavior remain unchanged.

## Rollback Point

- Commit / checkpoint: pre-change branch head `443f3ea` plus the pre-fix failure artifact.
- Revert strategy: revert the bounded implementation commit; invalidate any coding tokens issued during local tests.
