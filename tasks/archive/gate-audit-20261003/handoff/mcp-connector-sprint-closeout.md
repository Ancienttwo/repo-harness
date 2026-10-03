# Sprint Closeout: repo-harness ChatGPT MCP Connector MVP

Updated: 2026-06-17

## Completed

- Added `repo-harness mcp` CLI group with `serve`, `doctor`, `setup chatgpt`, `setup codex`, `install-skill`, and `print-chatgpt-guide`.
- Added planner/executor/orchestrator policy model, allow/deny path enforcement, repo-root confinement, traversal blocking, symlink escape blocking, max file size enforcement, redaction, and hash-only audit logging.
- Added MCP server factory with workflow-scoped read tools, planning writer tools, and fixed `run_workflow_check`.
- Added stdio and HTTP transports. HTTP exposes `/health`, OAuth discovery, passphrase-backed authorization, token/registration endpoints, and authenticated `/mcp`; it binds to `127.0.0.1` by default, has request size limiting, and logs startup to stderr.
- Added ChatGPT setup config/guide generation, Codex MCP config patching with backup/dry-run/idempotency, and repo-local bridge Skill installation with overwrite/dry-run protection.
- Added the execution-planning chain: `write_prd_from_idea`, `write_checklist_sprint`, `prepare_codex_goal_from_sprint`, and local `repo-harness mcp prepare-goal` for host-native `/goal` handoff.
- Tightened Sprint generation to checklist task cards with explicit per-phase staging gates.
- Added README mention and generated `docs/repo-harness-chatgpt-mcp-setup.md`.

## Not completed

- No default `run_codex_goal` / orchestrator runner was implemented; this remains intentionally out of MVP scope.
- ChatGPT persistent `allow always` approval reuse loops back through authorization in the observed UI. `allow once` works and completed the MVP E2E.
- ChatGPT cannot launch local Codex CLI in the MVP. The supported handoff is explicit: MCP writes `.ai/harness/handoff/codex-goal.md` and returns a host-native `/goal` prompt for the local Codex host/user to execute.

## Tests run

- `bun test tests/cli/mcp.test.ts tests/cli/mcp-policy.test.ts tests/cli/mcp-tools.test.ts tests/cli/mcp-setup.test.ts tests/cli/mcp-http.test.ts`
- `bun test tests/cli/mcp-tools.test.ts tests/cli/mcp.test.ts tests/cli/mcp-setup.test.ts`
- `bun test` (`810 pass`, `0 fail`, `7724 expect() calls`; captured in `/tmp/repo-harness-bun-test.log`)
- `bun run check:type`
- `git diff --check`
- `bash scripts/check-task-sync.sh`
- `bash scripts/check-task-workflow.sh --strict`
- `bash scripts/check-architecture-sync.sh`
- `bash scripts/check-deploy-sql-order.sh`
- `bun scripts/inspect-project-state.ts --repo . --format text`
- `bash scripts/migrate-project-template.sh --repo . --dry-run`
- `repo-harness setup check --target codex --check-updates --json` (`27 ok`, `1 warn`, `0 fail`, `0 needs_agent`; warning is optional `skills_cli` timeout)
- `repo-harness mcp prepare-goal --repo . --prd /Users/ancienttwo/Projects/agentic-dev-wt-mcp-connector/plans/prds/20260617-repo-harness-mcp-prd.md --sprint /Users/ancienttwo/Projects/agentic-dev-wt-mcp-connector/plans/sprints/20260617-repo-harness-mcp-sprint.md --reference-repo /Users/ancienttwo/Projects/agentic-dev/_ref/local-dev-mcp --overwrite`
- `curl http://127.0.0.1:8765/health`
- HTTP `/mcp` JSON-RPC initialize smoke.
- HTTP auth smoke: unauthenticated initialize returns 401, OAuth dynamic registration plus passphrase authorization returns an access token, authenticated initialize returns 200, and static bearer fallback remains covered.
- Official MCP `StdioClientTransport` smoke listing 15 tools from `repo-harness mcp serve --transport stdio --profile planner`.
- Claude read-only cross-review was run. The P1 unauthenticated tunnel exposure finding was fixed first with bearer-token HTTP auth, then aligned with the reference repo and ChatGPT UI by adding OAuth/passphrase auth and regenerated setup docs.
- Local Codex-goal bridge read path is covered: `write_codex_goal` -> `latest_handoff` -> `read_workflow_file`.

## Manual E2E result

- Local MCP E2E passed on this worktree. Details are in `.ai/harness/handoff/mcp-e2e-result.md`.
- ChatGPT UI manual connector E2E passed through OAuth with `allow once`: `harness_status`, `latest_handoff`, `write_prd`, and `write_codex_goal` reached the local server. The write smoke artifacts are `tasks/notes/20260617-chatgpt-mcp-smoke-prd.notes.md` and `.ai/harness/handoff/codex-goal.md`.

## Security review

- Denied paths tested: `.env`, `.git/**`, traversal, symlink escape, source-write paths.
- Source write blocking tested: planner profile rejects `src/**`, package manifests, lockfiles, and CI config through policy.
- Secrets redaction tested: bearer token, OpenAI-style key, private key, JWT/database/secret-like assignment patterns.
- Audit log checked: stores metadata and input hash, not raw prompt/body or token values.
- HTTP auth checked: `/mcp` fails closed without OAuth-issued bearer auth by default; setup writes passphrase/token state only to ignored `.repo-harness/*` files.

## Known limitations

- Tool files are currently implemented in one `src/cli/mcp/tools.ts` module rather than one file per tool to keep the first slice compact.
- `mcp doctor` checks local files and Codex config, but does not yet probe a user-supplied public HTTPS endpoint.
- ChatGPT persistent `allow always` approval reuse needs a follow-up OAuth/session compatibility investigation.

## Follow-up sprint candidates

- Add better MCP client integration tests.
- Add optional tunnel helper.
- Split MCP tool handlers into per-tool files if the module grows.
- Add optional orchestrator profile behind explicit user confirmation.
- Add richer ChatGPT review tools.

## Next recommended task

- Investigate ChatGPT persistent `allow always` approval reuse against the OAuth token/session flow. `allow once` is sufficient for MVP, but persistent approval looping is the next real compatibility gap.
