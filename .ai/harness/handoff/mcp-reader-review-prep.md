# MCP Reader Review Prep

Updated: 2026-06-21T22:58:45+0800
Status: reviewer-prep only, not reviewer sign-off
Scope: repo-harness MCP reader and transport hardening sprint

## Boundary

This file is not an approval. It collects local audit evidence for the assigned security, API/MCP, and maintainer reviewers.

Release, tag, publish, version bump, release checks, published-package smoke, hosted matrix for the current uncommitted diff, and live ChatGPT Connector E2E remain open.

Formal reviewer intake packet: `.ai/harness/handoff/mcp-reader-review-request.md`.

## P1 Map

- Entrypoints: `repo-harness mcp serve`, `repo-harness mcp http`, `repo-harness mcp setup chatgpt`, `repo-harness mcp doctor`.
- Policy boundary: `src/cli/mcp/policy.ts`.
- Runtime context boundary: `src/cli/mcp/server.ts`.
- Reader runtime: `src/cli/mcp/workspaces.ts` and `src/cli/mcp/reader-tools.ts`.
- Registered repo discovery: `src/effects/repo-registry.ts`.
- Transport/session boundary: `src/cli/mcp/transports/http.ts` and `src/cli/mcp/session-store.ts`.
- OAuth boundary: `src/cli/mcp/oauth.ts`.
- Existing workflow tool compatibility: `src/cli/mcp/tools.ts`.
- Setup/doctor/docs boundary: `src/cli/mcp/setup.ts`, `README.md`, and `docs/repo-harness-chatgpt-mcp-setup.md`.

Out of scope for local review prep:

- Official reviewer sign-off.
- Live ChatGPT Connector/App tool invocation.
- Hosted Ubuntu/macOS/Windows matrix on the current uncommitted diff.
- Release and published-package smoke.

## P2 Trace

Single Connector reader path:

1. `createMcpToolContext()` resolves the repo root, loads local MCP config, maps legacy `reader` profile to `planner`, reads registered adopted repos, merges explicit extra roots, and creates a `WorkspaceManager` when `workspaceReader` is enabled.
2. `getMcpPolicy('planner', { enableReader: true })` keeps workflow planner writes and adds the reader capability while preserving deny globs.
3. `buildMcpToolDefinitions()` keeps planner workflow tools and appends the six reader tools.
4. `open_workspace` returns a session-local workspace ID for an allowed root.
5. `tree`, `read_text`, and `search_text` resolve only workspace-relative paths through `WorkspaceManager`.
6. Deny globs, ignored files, symlink containment, byte/depth/result/time limits, redaction, and audit hashing apply before content is returned.
7. Workspace reader may read normal source/package files from allowed repos; legacy `read_workflow_file` remains constrained by planner `readGlobs` and does not gain source/package access.

HTTP/OAuth path:

1. HTTP `/mcp` initializes or reuses a session through `McpSessionStore`.
2. Each session owns its MCP server/transport and workspace manager.
3. DELETE `/mcp` closes and removes the session.
4. OAuth discovery advertises `offline_access`.
5. Authorization code exchange grants refresh tokens only when requested.
6. Refresh exchange rotates both access and refresh tokens and invalidates the old refresh token.

## P3 Rationale

- Single Connector is preserved by making reader access a planner capability instead of a second reader profile.
- Registered adopted repos are default discoverable roots; `allowedRoots` is reserved for explicit extra non-repo roots.
- Deny rules stay central and cannot be bypassed by legacy broad/full-disk compatibility.
- Workspace IDs are session-local capabilities to avoid absolute-path tools and cross-session path reuse.
- Runner/browser/shell surfaces remain opt-in and outside the default planner reader path.
- New modules are flat under `src/cli/mcp/` to avoid a large `tools.ts` refactor.

## Security Reviewer Prep

- Deny precedence: covered by `tests/cli/mcp-policy.test.ts`, `tests/cli/mcp-tools.test.ts`, `tests/cli/mcp-reader-tools.test.ts`, and `tests/cli/mcp-workspaces.test.ts`.
- Allowed root migration fail-closed: covered by `tests/cli/mcp-setup.test.ts`.
- Session-local workspace: covered by `tests/cli/mcp-reader-tools.test.ts`, `tests/cli/mcp-workspaces.test.ts`, and `tests/cli/mcp-http.test.ts`.
- Symlink/junction: POSIX symlink cases are local automated tests; Windows junction has a Windows-only regression and still needs hosted runner evidence.
- Tree/search denied-name leakage: covered by `tests/cli/mcp-reader-tools.test.ts`.
- Response limits: covered by reader tool tests and constants in `src/cli/mcp/reader-tools.ts`.
- OAuth refresh rotation: covered by `tests/cli/mcp-oauth.test.ts` and `tests/cli/mcp-http.test.ts`.
- Public origin consistency: covered by `tests/cli/mcp-http.test.ts`; live public ChatGPT origin remains pending.
- Logs/health secrets: covered by redaction/audit tests and health tests.
- Legacy full-disk hidden bypass: covered by policy/setup/tool tests; release reviewer should re-check diff before publishing.
- Source/package read boundary: covered by `tests/cli/mcp-reader-tools.test.ts`, `tests/cli/mcp-tools.test.ts`, `tests/cli/mcp-policy.test.ts`, and the local HTTP transcript.

## API/MCP Reviewer Prep

- Tool names/schemas: six reader tools are stable in `src/cli/mcp/reader-tools.ts`; planner workflow tools remain in `src/cli/mcp/tools.ts`.
- Planner tools/list: local tests prove workflow tools plus reader tools and no runner/browser by default.
- MCP annotations: reader tools have read-only/idempotent/non-destructive annotations.
- Structured errors: workspace, session, OAuth, and tool errors are exercised by tests.
- GET/POST/DELETE semantics: covered by HTTP transport tests.
- Server metadata version: package version is sourced from `src/cli/mcp/version.ts` and tested through STDIO/HTTP/setup paths.
- Stale session recovery: covered by HTTP tests with injectable clock/session store.
- Planner compatibility: existing PRD/Sprint/Goal workflow tests pass with `repo_path` support.

## Maintainer Reviewer Prep

- CLI style: setup/serve/doctor changes stay in existing Commander command surfaces.
- `tools.ts` was not fully reorganized; reader behavior moved to focused new modules.
- Tests remain under `tests/cli/` with a focused hosted matrix job added in `.github/workflows/ci.yml`.
- Package file inclusion: `npm pack --dry-run --json` includes the new MCP modules.
- Docs preserve workflow sidecar positioning and document single Connector reader setup.
- Sprint, PRD, and closeout handoff are synchronized.
- Release notes exist in the changelog surface, but actual release checks and publish remain paused.

## Evidence Commands

- `BUN_TEST_MAX_CONCURRENCY=1 bun run check:ci`: pass after the source/package reader policy fix, 905 pass, 1 skip, 0 fail, 9055 expects; workflow checks, repository inspection, package dry-run, and tarball install smoke passed.
- `npm pack --dry-run --json`: pass; dry-run tarball includes the new MCP modules.
- `bash scripts/check-task-sync.sh`: pass.
- `bash scripts/check-task-workflow.sh --strict`: pass.
- `git diff --check`: pass.
- `bun test --timeout 60000 --max-concurrency 1 tests/cli/mcp-policy.test.ts tests/cli/mcp-reader-tools.test.ts tests/cli/mcp-tools.test.ts tests/cli/mcp-http.test.ts tests/cli/mcp-stdio.test.ts`: pass, 33 pass, 0 fail, 308 expects.
- Local HTTP MCP transcript: pass; see `.ai/harness/handoff/mcp-reader-local-http-e2e.md`.
- `gh run list --branch codex/release-0.7.5 --limit 10`: latest hosted CI is successful on SHA `75b7a5047ec92836f7417448989af4af6a617737`, but that run predates the current uncommitted diff and does not prove the new `mcp-path-matrix`.

## Remaining Sign-off Inputs

- Assigned security/API/maintainer reviewers must review the current diff, not only this prep artifact.
- Formal reviewer intake packet is available at `.ai/harness/handoff/mcp-reader-review-request.md`.
- Current diff must be pushed before hosted Ubuntu/macOS/Windows path matrix can prove the new workflow job.
- Live ChatGPT Connector/App E2E must capture sanitized tools/list, workspace open, read, search, deny, reconnect, and refresh evidence.
- Release checks and published-package smoke must wait for release hold to lift.
