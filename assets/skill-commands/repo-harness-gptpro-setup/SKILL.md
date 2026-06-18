---
name: repo-harness-gptpro-setup
description: Guides GPT Pro local setup for repo-harness by configuring Oracle-first gptpro_browser ChatGPT Web consults and gptpro_mcp ChatGPT Connector MCP sidecar access with verification, auth, tunnel, runtime, and API-billing boundaries.
when_to_use: "repo-harness-gptpro-setup, repo-harness:gptpro_setup, gptpro_setup, gptpro_browser, gptpro_broswser, gptpro_mcp, GPT Pro browser setup, ChatGPT Connector MCP setup"
---

# repo-harness-gptpro-setup

Use this command when the user wants repo-harness to guide local GPT Pro setup across both directions:

- `gptpro_browser`: local repo-harness calls an already logged-in ChatGPT Web session through the Oracle browser provider.
- `gptpro_mcp`: ChatGPT connects back to the local repo through the repo-harness MCP sidecar and Connector setup.

## Protocol

1. Confirm the target repo path with `git rev-parse --show-toplevel` or an explicit user path. Preserve unrelated dirty worktree state.
2. State the two-lane model before configuring anything:
   - `gptpro_browser` is local -> ChatGPT Web through `repo-harness chatgpt browser-*`, with Oracle as the default provider.
   - `gptpro_mcp` is ChatGPT -> local through `repo-harness mcp serve --transport http`.
   - ChatGPT Pro Web access is not OpenAI API quota or an API key substitute.
3. Configure the Oracle browser provider boundary:
   - Oracle's published CLI requires `node >=24`; satisfy that inside the pinned Oracle install or explicit binary path. Do not raise repo-harness' overall runtime floor or add Oracle as an implicit dependency just for GPT Pro.
   - Install or point to a pinned Oracle CLI. Prefer an auditable binary path through `--oracle-bin` or `REPO_HARNESS_ORACLE_BIN`; repo-harness must not `npx` or auto-download Oracle during setup.
   - `repo-harness chatgpt browser-doctor --repo <repo> --provider oracle --json`
   - Inspect `agent_actions` from the doctor output. If it includes `chatgpt-oracle-install-pinned`, `chatgpt-oracle-upgrade-pinned`, or `chatgpt-oracle-fix-configured-source`, execute that source-aware action only as part of this explicit GPT Pro setup/repair flow, then rerun the doctor.
   - If the doctor reports `ORACLE_NOT_INSTALLED`, install/configure Oracle from the explicit action or point `--oracle-bin` / `REPO_HARNESS_ORACLE_BIN` at a pinned binary, then rerun the doctor before any real consult.
   - If the doctor reports `ORACLE_INCOMPATIBLE` or `nodeCompatible:false`, fix the Oracle install and its Node runtime from the explicit action before changing repo-harness package/runtime constraints.
4. Configure the selected ChatGPT Web profile when the user wants Oracle to use an existing signed-in Chrome profile:
   - Ask the user which Chrome profile directory should own the ChatGPT product session, or use an explicit path they already provided.
   - `repo-harness chatgpt browser-setup --repo <repo> --profile-dir <user-selected-chrome-profile-dir> --browser-channel chrome`
   - Rerun `repo-harness chatgpt browser-doctor --repo <repo> --provider oracle --json`; the Oracle path should fail closed rather than silently falling back to an unbound/default profile.
   - For a non-mutating prompt/file preview, run `repo-harness chatgpt browser-consult --repo <repo> --provider oracle --dry-run --prompt <text>`.
5. For a real GPT Pro browser consult, require Oracle readiness plus an already logged-in ChatGPT Web session and run a bounded command with a timestamped output path, such as:
   - `stamp="$(date -u +%Y%m%dT%H%M%SZ)"; repo-harness chatgpt browser-consult --repo <repo> --provider oracle --model gpt-5.5-pro --heartbeat 59 --prompt <text> --write-output ".ai/harness/handoff/gptpro-${stamp}-setup-smoke.md"`
6. Use the bridge provider only when the user explicitly asks for the experimental extension path:
   - `repo-harness chatgpt browser-bind --repo <repo> --open`
   - Report the printed `Local authorization URL: http://127.0.0.1:...` and `bridgeExtension=...` to the user and keep the command running while they authorize.
   - The authorization page must guide the user to open Chrome Extensions, enable **Developer mode**, click **Load unpacked**, select the printed `bridgeExtension` directory, open or refresh ChatGPT, then click **Bind ChatGPT**.
   - If the authorization page reports login required, have the user click **Open ChatGPT Login**, sign in, return to the authorization page, and click **Bind ChatGPT** again.
   - After authorization succeeds, stop `browser-bind` before running `browser-consult --provider bridge` because both use the same local bridge port.
   - `repo-harness chatgpt browser-doctor --repo <repo> --provider bridge --json`
7. Configure ChatGPT Connector MCP support:
   - Ask for the ChatGPT Connector/MCP server name the user will create, or choose a generic default such as `repo-harness`. Record that name during initialization instead of hard-coding a personal name in later prompts.
   - `repo-harness mcp setup chatgpt --repo <repo> --server-name <name>`
   - `repo-harness mcp doctor --repo <repo> --json`
   - Verify that `chatgpt.serverNameConfigured` is true and `chatgpt.serverName` matches the Connector/App name the user selected. If not, rerun setup with `--server-name <name>` before any GPT Pro read-back review.
   - Start the sidecar when the user is ready to connect ChatGPT:
     `repo-harness mcp serve --repo <repo> --transport http --host 127.0.0.1 --port 8765 --profile planner --enable-chatgpt-browser`
8. Tell the user that ChatGPT Connector setup still requires an HTTPS tunnel or equivalent public HTTPS `/mcp` endpoint, then manual connector creation in ChatGPT settings using the recorded server name. For recurring use, prefer a stable hostname from a named tunnel or reserved domain and run `repo-harness mcp setup chatgpt --endpoint <https-url>/mcp --server-name <name>`; this stores the endpoint and server name in ignored local config while tracked guides stay placeholder-only. Account-less quick tunnels are only for smoke tests because their URL changes. Keep OAuth passphrases and bearer tokens redacted.
9. When the user asks to create or bind a real domain for the Connector, keep the flow generic in tracked repo files and keep all real operator state private:
   - generic Cloudflare shape: create/login to a named tunnel, route a stable hostname to the tunnel, configure ingress to `http://127.0.0.1:8765`, run the tunnel, then smoke `/health`, OAuth discovery, and unauthenticated `/mcp` returning 401.
   - for recurring use, offer a host-local process manager such as launchd/systemd/screen for both the MCP sidecar and HTTPS tunnel; verify restart/reconnect by smoking local `/health`, public `/health`, unauthenticated `/mcp` 401, and MCP `initialize`/`tools/list`.
   - never commit or write real user-owned domains, account IDs, zone IDs, tunnel IDs, tunnel tokens, OAuth passphrases, bearer tokens, cookie/profile paths, or provider account names into tracked docs, notes, plans, reviews, or runbooks.
   - put real domain/tunnel runbooks, process names, IDs, provider account details, env files, and verification commands only under ignored `_ops/*`, ignored repo-local `.repo-harness/*`, or global `~/.repo-harness/*`; public docs may use placeholders such as `repo-harness-mcp.example.com`.
10. If local Codex also needs repo-harness MCP tools, separately run `repo-harness mcp setup codex --repo <repo> --scope project` and verify with `repo-harness mcp doctor --repo <repo> --json`.
11. Finish with a concise matrix: `gptpro_browser` status, `gptpro_mcp` status, exact commands run, manual steps remaining, verification evidence, and residual risk. If a real domain was configured, report the public URL to the user in chat but do not persist it to tracked repo files.

## Failure Modes

- If `browser-doctor --provider oracle` reports `ORACLE_NOT_INSTALLED`, install or configure a pinned Oracle binary and rerun the doctor before a non-dry-run browser consult.
- If `browser-doctor --provider oracle --json` reports `agent_actions`, treat them as opt-in GPT Pro setup actions. Do not run them from default repo-harness install or unrelated setup checks.
- If `browser-doctor --provider oracle` reports `nodeCompatible:false`, fix the Oracle binary's Node runtime (`node >=24`) instead of raising repo-harness' overall runtime floor.
- If `browser-doctor --provider oracle` reports `ORACLE_INCOMPATIBLE`, report the missing capabilities and stop before a real consult.
- If `browser-doctor --provider bridge` reports `productSession.status=not_configured`, configure the selected profile with `browser-setup --profile-dir <dir>`, then authorize it with `browser-bind --open` before any bridge consult.
- If setup completes but the user cannot see the authorization page, provide the printed `Local authorization URL` directly; do not substitute a generic ChatGPT URL because that does not bind or validate the selected product session.
- If ChatGPT Web is not logged in or requires manual verification, report the manual-login blocker and preserve the dry-run session artifact.
- If `mcp doctor --json` reports `chatgpt.serverNameConfigured:false` or omits `chatgpt.serverName`, treat ChatGPT Connector setup as incomplete even when the repo is otherwise `ready_local`.
- If `mcp doctor` reports `ready_local` but ChatGPT is not connected, report the missing HTTPS tunnel or manual Connector step instead of claiming end-to-end success.
- If a ChatGPT conversation says the selected app/MCP server is not exposed to that chat, do not treat prompt wording as a forced MCP invocation. Refresh/reselect the app in a new ChatGPT conversation, or use a GitHub PR/diff evidence source for review.
- If the user asks to use a ChatGPT Pro subscription as an OpenAI API key or API billing source, stop and explain that ChatGPT Web subscriptions and API Platform usage are separate products.
- If any command would print `.repo-harness/mcp.tokens.json`, `.repo-harness/mcp.oauth.json`, browser profile secrets, or cookies, redact the value and report only the file class.

## Boundaries

- Does not create OpenAI API keys, API billing projects, or API credentials from a ChatGPT Pro subscription.
- Does not raise repo-harness' package/runtime floor to `node >=24` solely because Oracle needs that runtime.
- Does not install or upgrade Oracle from default repo-harness install; Oracle bootstrap is explicit to GPT Pro setup/repair and surfaced through `browser-doctor` `agent_actions`.
- Does not bypass ChatGPT Web rate limits, login checks, manual verification, or plan restrictions.
- Does not expose a local MCP server to the public internet without explicit auth, tunnel, and user intent.
- Does not enable `--enable-chatgpt-browser` silently; require the user to ask for GPT Pro browser/session bridging.
- Does not commit `.repo-harness/` local auth files, browser profiles, cookies, tokens, or tunnel state.
- Does not commit personal Connector endpoints, provider account metadata, DNS zone IDs, tunnel IDs, or real tunnel runbooks; keep those in `_ops/*`, `.repo-harness/*`, or equivalent ignored local state.
