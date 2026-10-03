# repo-harness MCP E2E Result

Updated: 2026-06-17
Worktree: `/Users/ancienttwo/Projects/agentic-dev-wt-mcp-connector`
Branch: `codex/repo-harness-mcp-connector`

## Local Setup

- `bun src/cli/index.ts mcp setup chatgpt --repo .` generated `.repo-harness/mcp.local.json` and `docs/repo-harness-chatgpt-mcp-setup.md`.
- `.repo-harness/mcp.local.json` uses `auth.mode=oauth`; `.repo-harness/mcp.oauth.json`, `.repo-harness/mcp.oauth-tokens.json`, and `.repo-harness/mcp.tokens.json` are ignored local runtime state.
- `bun src/cli/index.ts mcp setup codex --repo . --scope project` generated ignored `.codex/config.toml` with `repo_harness` MCP server and required enabled tools.
- `bun src/cli/index.ts mcp install-skill --repo . --overwrite` installed `.agents/skills/repo-harness-chatgpt-bridge/`.
- `bun src/cli/index.ts mcp doctor --repo . --json` returned `status=ready_local`, `codex.configured=true`, and `missingTools=[]`.

## Transport Smoke

- HTTP server started with `bun src/cli/index.ts mcp serve --repo . --transport http --host 127.0.0.1 --port 8765 --profile planner`.
- `curl http://127.0.0.1:8765/health` returned `{"status":"ok","server":"repo-harness-mcp","auth":"oauth"}` in default ChatGPT mode.
- OAuth discovery at `/.well-known/oauth-protected-resource/mcp` returned the `/mcp` resource and authorization server metadata.
- Unauthenticated POST initialize to `http://127.0.0.1:8765/mcp` returned HTTP 401 with a `www-authenticate` header pointing to the OAuth protected-resource metadata.
- Dynamic client registration, passphrase-backed `/authorize`, `/token` exchange, and authenticated MCP initialize were covered by the focused HTTP transport test.
- Static bearer fallback remains available through `repo-harness mcp serve --auth bearer`; the bearer fallback smoke returns 401 without auth, 400 for malformed authenticated JSON, and 200 for authenticated initialize.
- Official MCP `StdioClientTransport` connected to `repo-harness mcp serve --transport stdio --profile planner` and listed 15 tools, starting with `harness_status`, `harness_doctor`, `list_workflow_files`, `read_workflow_file`, and `latest_handoff`.

## Tool Smoke

- Unit tests exercised allowed reads, denied `.env` reads, traversal rejection, symlink escape rejection, planner write allowlist, PRD write, Codex goal validation, overwrite prevention, redaction, audit hash-only logging, and Codex config patching.
- Unit tests also cover nested deny globs, prefixed secret assignments, OAuth setup config, bearer fallback config, and latest-checks listing when earlier workflow roots exceed the per-root listing cap.
- Unit tests cover the local Codex bridge read path: after MCP writes `.ai/harness/handoff/codex-goal.md`, `latest_handoff` and `read_workflow_file` expose the goal through policy-allowed workflow reads.
- No arbitrary shell MCP tool exists. The only execution tool is fixed to `check-task-workflow --strict`.
- Planner profile cannot write `src/**`, package manifests, lockfiles, or CI config.
- HTTP `/mcp` fails closed without OAuth-issued bearer auth by default.

## External Manual Step

ChatGPT Web Connector manual E2E completed on 2026-06-17 using a Cloudflare quick tunnel and OAuth auth. The user opened the ChatGPT New App modal and the available authentication options were OAuth, No Auth, and Mixed. That confirmed the correct ChatGPT path is OAuth, matching `_ref/local-dev-mcp`, not a static customer-provided bearer token. The generated guide now documents the OAuth path and the local HTTP test covers the OAuth flow end to end.

Observed ChatGPT tool calls:

- `harness_status` succeeded and returned repo path `/Users/ancienttwo/Projects/agentic-dev-wt-mcp-connector`, `adopted=true`, `profile=planner`, and branch `codex/repo-harness-mcp-connector`.
- `latest_handoff` succeeded.
- `write_prd` succeeded and wrote a smoke PRD. Because the smoke body is E2E evidence rather than a real product PRD, the content was retained under `tasks/notes/20260617-chatgpt-mcp-smoke-prd.notes.md` instead of the formal PRD ledger.
- An incomplete `write_codex_goal` was blocked by required-section validation, then a corrected `write_codex_goal` succeeded and wrote `.ai/harness/handoff/codex-goal.md`.

Notes:

- ChatGPT `allow once` worked for manual approvals.
- The user observed that `allow always` loops back through authorization. Persistent approval reuse is outside the MVP acceptance criteria and should be treated as a follow-up compatibility issue.
- The quick tunnel and local MCP server were stopped after the E2E run.
