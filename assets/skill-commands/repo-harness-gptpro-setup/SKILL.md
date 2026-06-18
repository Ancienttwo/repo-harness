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
   - `repo-harness chatgpt browser-setup --repo <repo>`
   - `repo-harness chatgpt browser-doctor --repo <repo> --provider native --json`
   - For a non-mutating prompt/file preview, run `repo-harness chatgpt browser-consult --repo <repo> --provider native --dry-run --prompt <text>`.
4. For a real GPT Pro browser consult, require an already logged-in ChatGPT Web session and run a bounded command such as:
   - `repo-harness chatgpt browser-consult --repo <repo> --provider native --manual-login --prompt <text> --model <label> --thinking <level>`
5. Configure ChatGPT Connector MCP support:
   - `repo-harness mcp setup chatgpt --repo <repo>`
   - `repo-harness mcp doctor --repo <repo> --json`
   - Start the sidecar when the user is ready to connect ChatGPT:
     `repo-harness mcp serve --repo <repo> --transport http --host 127.0.0.1 --port 8765 --profile planner --enable-chatgpt-browser`
6. Tell the user that ChatGPT Connector setup still requires an HTTPS tunnel or equivalent public HTTPS `/mcp` endpoint, then manual connector creation in ChatGPT settings. Keep OAuth passphrases and bearer tokens redacted.
7. If local Codex also needs repo-harness MCP tools, separately run `repo-harness mcp setup codex --repo <repo> --scope project` and verify with `repo-harness mcp doctor --repo <repo> --json`.
8. Finish with a concise matrix: `gptpro_browser` status, `gptpro_mcp` status, exact commands run, manual steps remaining, verification evidence, and residual risk.

## Failure Modes

- If `browser-doctor` reports the native provider unavailable, report the missing Chrome/CDP prerequisite and stop before a non-dry-run browser consult.
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
