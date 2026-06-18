---
name: repo-harness-gptpro-setup
description: Guides GPT Pro local setup for repo-harness by configuring gptpro_browser ChatGPT Web browser/session consults and gptpro_mcp ChatGPT Connector MCP sidecar access with verification, auth, tunnel, and API-billing boundaries.
when_to_use: "repo-harness-gptpro-setup, repo-harness:gptpro_setup, gptpro_setup, gptpro_browser, gptpro_broswser, gptpro_mcp, GPT Pro browser setup, ChatGPT Connector MCP setup"
---

# repo-harness-gptpro-setup

Use this command when the user wants repo-harness to guide local GPT Pro setup across both directions:

- `gptpro_browser`: local repo-harness calls an already logged-in ChatGPT Web session through browser/session automation.
- `gptpro_mcp`: ChatGPT connects back to the local repo through the repo-harness MCP sidecar and Connector setup.

## Protocol

1. Confirm the target repo path with `git rev-parse --show-toplevel` or an explicit user path. Preserve unrelated dirty worktree state.
2. State the two-lane model before configuring anything:
   - `gptpro_browser` is local -> ChatGPT Web through `repo-harness chatgpt browser-*`.
   - `gptpro_mcp` is ChatGPT -> local through `repo-harness mcp serve --transport http`.
   - ChatGPT Pro Web access is not OpenAI API quota or an API key substitute.
3. Configure browser/session support:
   - Ask the user which Chrome profile directory should own the ChatGPT product session, or use an explicit path they already provided.
   - `repo-harness chatgpt browser-setup --repo <repo> --profile-dir <user-selected-chrome-profile-dir> --browser-channel chrome`
   - `repo-harness chatgpt browser-bind --repo <repo> --open`
   - Report the printed `Local authorization URL: http://127.0.0.1:...` and `bridgeExtension=...` to the user and keep the command running while they authorize.
   - The authorization page must guide the user to open Chrome Extensions, enable **Developer mode**, click **Load unpacked**, select the printed `bridgeExtension` directory, open or refresh ChatGPT, then click **Bind ChatGPT**.
   - If the authorization page reports login required, have the user click **Open ChatGPT Login**, sign in, return to the authorization page, and click **Bind ChatGPT** again.
   - After authorization succeeds, stop `browser-bind` before running `browser-consult --provider bridge` because both use the same local bridge port.
   - `repo-harness chatgpt browser-doctor --repo <repo> --provider bridge --json`
   - For a non-mutating prompt/file preview, run `repo-harness chatgpt browser-consult --repo <repo> --provider bridge --dry-run --prompt <text>`.
4. For a real GPT Pro browser consult, require an already logged-in ChatGPT Web session and run a bounded command such as:
   - `repo-harness chatgpt browser-consult --repo <repo> --provider bridge --manual-login --prompt <text>`
5. Configure ChatGPT Connector MCP support:
   - `repo-harness mcp setup chatgpt --repo <repo>`
   - `repo-harness mcp doctor --repo <repo> --json`
   - Start the sidecar when the user is ready to connect ChatGPT:
     `repo-harness mcp serve --repo <repo> --transport http --host 127.0.0.1 --port 8765 --profile planner --enable-chatgpt-browser`
6. Tell the user that ChatGPT Connector setup still requires an HTTPS tunnel or equivalent public HTTPS `/mcp` endpoint, then manual connector creation in ChatGPT settings. For recurring use, prefer a stable hostname from a named tunnel or reserved domain and run `repo-harness mcp setup chatgpt --endpoint <https-url>/mcp`; this stores the endpoint in ignored local config while tracked guides stay placeholder-only. Account-less quick tunnels are only for smoke tests because their URL changes. Keep OAuth passphrases and bearer tokens redacted.
7. When the user asks to create or bind a real domain for the Connector, keep the flow generic in tracked repo files and keep all real operator state private:
   - generic Cloudflare shape: create/login to a named tunnel, route a stable hostname to the tunnel, configure ingress to `http://127.0.0.1:8765`, run the tunnel, then smoke `/health`, OAuth discovery, and unauthenticated `/mcp` returning 401.
   - for recurring use, offer a host-local process manager such as launchd/systemd/screen for both the MCP sidecar and HTTPS tunnel; verify restart/reconnect by smoking local `/health`, public `/health`, unauthenticated `/mcp` 401, and MCP `initialize`/`tools/list`.
   - never commit or write real user-owned domains, account IDs, zone IDs, tunnel IDs, tunnel tokens, OAuth passphrases, bearer tokens, cookie/profile paths, or provider account names into tracked docs, notes, plans, reviews, or runbooks.
   - put real domain/tunnel runbooks, process names, IDs, provider account details, env files, and verification commands only under ignored `_ops/*`, ignored repo-local `.repo-harness/*`, or global `~/.repo-harness/*`; public docs may use placeholders such as `repo-harness-mcp.example.com`.
8. If local Codex also needs repo-harness MCP tools, separately run `repo-harness mcp setup codex --repo <repo> --scope project` and verify with `repo-harness mcp doctor --repo <repo> --json`.
9. Finish with a concise matrix: `gptpro_browser` status, `gptpro_mcp` status, exact commands run, manual steps remaining, verification evidence, and residual risk. If a real domain was configured, report the public URL to the user in chat but do not persist it to tracked repo files.

## Failure Modes

- If `browser-doctor` reports the native provider unavailable, report the missing Chrome/CDP prerequisite and stop before a non-dry-run browser consult.
- If `browser-doctor --provider bridge` reports `productSession.status=not_configured`, configure the selected profile with `browser-setup --profile-dir <dir>`, then authorize it with `browser-bind --open` before any non-dry-run browser consult.
- If `browser-doctor --provider native` reports `productSession.status=blocked_default_profile`, route to `--provider bridge`; do not ask the user to close Chrome and retry.
- If setup completes but the user cannot see the authorization page, provide the printed `Local authorization URL` directly; do not substitute a generic ChatGPT URL because that does not bind or validate the selected product session.
- If ChatGPT Web is not logged in or requires manual verification, report the manual-login blocker and preserve the dry-run session artifact.
- If `mcp doctor` reports `ready_local` but ChatGPT is not connected, report the missing HTTPS tunnel or manual Connector step instead of claiming end-to-end success.
- If the user asks to use a ChatGPT Pro subscription as an OpenAI API key or API billing source, stop and explain that ChatGPT Web subscriptions and API Platform usage are separate products.
- If any command would print `.repo-harness/mcp.tokens.json`, `.repo-harness/mcp.oauth.json`, browser profile secrets, or cookies, redact the value and report only the file class.

## Boundaries

- Does not create OpenAI API keys, API billing projects, or API credentials from a ChatGPT Pro subscription.
- Does not bypass ChatGPT Web rate limits, login checks, manual verification, or plan restrictions.
- Does not expose a local MCP server to the public internet without explicit auth, tunnel, and user intent.
- Does not enable `--enable-chatgpt-browser` silently; require the user to ask for GPT Pro browser/session bridging.
- Does not commit `.repo-harness/` local auth files, browser profiles, cookies, tokens, or tunnel state.
- Does not commit personal Connector endpoints, provider account metadata, DNS zone IDs, tunnel IDs, or real tunnel runbooks; keep those in `_ops/*`, `.repo-harness/*`, or equivalent ignored local state.
