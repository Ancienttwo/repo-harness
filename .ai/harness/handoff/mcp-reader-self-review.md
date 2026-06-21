# MCP Reader Local Self Review

Updated: 2026-06-21T23:04:39+0800
Status: local self-review complete, not formal reviewer sign-off
Scope: MCP reader hardening diff only

## Boundary

No release, tag, publish, version bump, release check, staging, commit, push, or PR creation was run for this review.

The worktree is mixed with staged, unstaged, and untracked files. This review covers the MCP reader, registry, HTTP session, OAuth refresh, setup, doctor, docs, and tests named in `.ai/harness/handoff/mcp-reader-review-request.md`. Parallel planning files are not included in the review conclusion.

## P1 Map

Runtime entrypoints:

- `repo-harness mcp serve` in `src/cli/commands/mcp.ts`
- STDIO server creation in `src/cli/mcp/server.ts`
- HTTP server and OAuth/session endpoints in `src/cli/mcp/transports/http.ts`
- tool registry and workflow tool dispatch in `src/cli/mcp/tools.ts`
- reader tool dispatch in `src/cli/mcp/reader-tools.ts`

Authority surfaces:

- single ChatGPT Connector URL remains `/mcp`
- default profile remains `planner`
- planner may expose `workspaceReader`
- executor does not expose reader tools
- orchestrator does not expose runner tools unless explicit dev-runner settings are enabled
- global adopted repo index is `~/.repo-harness/registered-repos.json`

Security boundaries:

- `COMMON_DENY_GLOBS` covers `.env`, private keys, `.ssh/**`, `.git/**`, dependency/build output, `secrets/**`, `credentials/**`, and `private/**`
- workspace paths are workspace-relative and session-local
- legacy `read_workflow_file` keeps workflow-only allowlists
- normal source/package reads are available only through reader tools against allowed workspace roots
- public HTTP bind requires `REPO_HARNESS_MCP_PUBLIC_ORIGIN`

Out of scope:

- publishing
- hosted CI readback for the current uncommitted diff
- live ChatGPT Connector/App tool-call evidence
- assigned external reviewer approval

## P2 Trace

Planner reader path:

1. `repo-harness mcp serve --profile planner` reaches `createMcpToolContext`.
2. `createMcpToolContext` loads local config, registered adopted repo roots, current adopted repo root, and explicit `--allow-root` values.
3. `getMcpPolicy('planner', { enableReader, allowedRoots, discoveryRoots })` enables workflow planner tools plus `workspaceReader` only when configured/default planner reader conditions are satisfied.
4. `buildMcpToolDefinitions` adds `reader_status`, `list_allowed_roots`, `open_workspace`, `tree`, `read_text`, and `search_text` only when `policy.capabilities.workspaceReader` is true.
5. `discover_harness_repos` reads the global registry, revalidates adoption markers, and calls `WorkspaceManager.ensureAllowedRoot` so registered repos can be opened in the current MCP session.
6. `open_workspace` accepts only a known `root_id` plus a relative subpath, rejects absolute and traversal input, and resolves through realpath containment.
7. `read_text` resolves a workspace-relative file, rejects denied/ignored/binary/oversized paths, chunks output, redacts text, and returns structured metadata.

HTTP session path:

1. `/mcp` POST/GET/DELETE all pass through `requireMcpHttpAuth`.
2. initialize POST creates a `StreamableHTTPServerTransport` only when `McpSessionStore.canCreate()` permits it.
3. non-initialize POST, GET, and DELETE require a valid UUID session id.
4. session lookup refreshes `lastSeenAt`; expired sessions are closed by cleanup.
5. DELETE forwards the protocol request, then closes and deletes the local transport.

OAuth refresh path:

1. `/authorize` requires PKCE S256, a registered redirect URI, and the local passphrase.
2. authorization codes are client-bound, redirect-bound, challenge-bound, expiring, and single-use.
3. `/token` returns refresh tokens only for `offline_access`.
4. refresh invalidates the old refresh token and old access token, then issues a new access token and refresh token.

## P3 Decision

The design preserves a single MCP Connector because the risk boundary is capability selection, not URL count. Registered adopted repos are user-level state, so users do not need one Connector per repo. Higher-risk surfaces stay separate: browser tools require `--enable-chatgpt-browser`, and local agent execution requires explicit orchestrator dev-runner settings.

The key invariant is that read expansion cannot bypass deny rules. The implementation keeps deny globs active across normal planner mode, legacy broad-read compatibility tests, executor, orchestrator, and reader workspace resolution. The tradeoff is that `.gitignore` support is intentionally simple; this is acceptable for the sprint because secret and credential denies are explicit and non-ignore-dependent.

At 10x repo count, the first pressure point is discovery scan cost, not tool authorization. The global registry path avoids repeated broad filesystem scanning, and explicit `limit`/`max_depth` controls keep fallback discovery bounded.

## Findings

No P0/P1 local blockers found in the reviewed MCP scope.

Confirmed locally:

- planner reader tools are in the same Connector and do not create a separate `reader` profile
- `reader` string compatibility maps to `planner`
- registered adopted repos are discovered through `~/.repo-harness/registered-repos.json`
- `repo_path` workflow tools require registered/adopted or explicitly authorized adopted repos
- default planner tools do not include `run_agent_goal`
- browser tools are absent unless `--enable-chatgpt-browser` is set
- orchestrator runner tools are absent unless dev-runner settings are explicit
- public HTTP bind fails closed without public origin
- token/passphrase outputs report file paths, not secret values

Non-blocking observations:

- `search_text.files_scanned` reports candidate file count, not only successfully read files. This is acceptable for bounded search telemetry but could be renamed in a later API cleanup.
- `.gitignore` parsing is intentionally limited. It should not be treated as the primary secret boundary; deny globs remain the primary boundary.
- Current hosted CI success predates this diff, so it is not evidence for the new path matrix.

## Evidence Used

- source inspection of `src/cli/mcp/workspaces.ts`, `src/cli/mcp/reader-tools.ts`, `src/cli/mcp/oauth.ts`, `src/cli/mcp/transports/http.ts`, `src/cli/mcp/policy.ts`, `src/cli/mcp/tools.ts`, `src/cli/mcp/setup.ts`, `src/cli/mcp/server.ts`, `src/cli/commands/mcp.ts`, and `src/effects/repo-registry.ts`
- test inspection of `tests/cli/mcp-policy.test.ts`, `tests/cli/mcp-reader-tools.test.ts`, `tests/cli/mcp-workspaces.test.ts`, `tests/cli/mcp-tools.test.ts`, and `tests/cli/mcp-stdio.test.ts`
- static scan for legacy reader profile, full-disk read, dev-runner/browser exposure, bearer/query-token handling, and secret output surfaces
- prior local verification recorded in `.ai/harness/handoff/mcp-reader-sprint-closeout.md`
- local HTTP transcript recorded in `.ai/harness/handoff/mcp-reader-local-http-e2e.md`

## Remaining Gates

- assigned reviewer sign-off
- hosted Ubuntu/macOS/Windows `mcp-path-matrix` readback for the current diff
- live ChatGPT Connector/App schema rescan and tool-call transcript
- release checks, publish, and published-package smoke after the release hold is lifted
