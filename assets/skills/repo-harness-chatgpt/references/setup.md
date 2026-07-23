# Setup Mode: Oracle Browser + MCP Connector

Reconciles the `repo-harness-gptpro-setup` facade, the `repo-harness-chatgpt-bridge`
Setup mode, and the `repo-harness-chatgpt-browser` profile-binding rules into one
source.

## Two Lanes

- `gptpro_browser`: local repo-harness calls an already logged-in ChatGPT Web
  session through `repo-harness chatgpt browser-*`, Oracle-first.
- `gptpro_mcp`: ChatGPT connects back to the local repo through
  `repo-harness mcp serve --transport http` and the Connector.
- ChatGPT Pro Web access is not OpenAI API quota or an API key substitute;
  never create API keys or billing projects from a ChatGPT Pro subscription.

## Oracle Browser Provider

1. Oracle's published CLI requires `node >=24`; satisfy that inside the pinned
   Oracle install or explicit binary path (`--oracle-bin` /
   `REPO_HARNESS_ORACLE_BIN`). Do not raise repo-harness' overall runtime floor
   or add Oracle as an implicit dependency just for GPT Pro.
2. Check readiness: `repo-harness chatgpt browser-doctor --repo <repo> --provider oracle --json`.
3. If the doctor reports `ORACLE_NOT_INSTALLED` or
   `ORACLE_INCOMPATIBLE`/`nodeCompatible:false`, fix the Oracle install/runtime
   and rerun doctor; do not lower repo-harness' own runtime constraints instead.
4. Treat `agent_actions` such as `chatgpt-oracle-install-pinned`,
   `chatgpt-oracle-upgrade-pinned`, or `chatgpt-oracle-fix-configured-source` as
   opt-in GPT Pro setup/repair actions only; never run them from a default
   install or an unrelated setup check.
5. Do not `npx` or auto-download Oracle during setup; prefer an auditable
   pinned binary path.

## Chrome Profile Binding

1. Ask which Chrome profile directory should own the ChatGPT session, or use a
   path the user already gave.
2. `repo-harness chatgpt browser-setup --repo <repo> --profile-dir <dir> --browser-channel chrome`
3. Rerun `browser-doctor --provider oracle --json`; the Oracle path fails
   closed rather than silently falling back to an unbound/default profile.
4. Do not route through the removed Chrome extension provider or `browser-bind`.

## MCP Connector

1. Ask for the Connector/server name the user will create, or default to
   `repo-harness`; record it instead of hard-coding a personal name later.
2. `repo-harness mcp setup chatgpt --repo <repo> --server-name <name>`
3. `repo-harness mcp doctor --repo <repo> --json`; verify
   `chatgpt.serverNameConfigured` is true and matches the selected Connector.
4. Start the sidecar only when the user is ready to connect ChatGPT:
   `repo-harness mcp serve --repo <repo> --transport http --host 127.0.0.1 --port 8765 --profile planner --enable-chatgpt-browser`.
5. ChatGPT Connector setup still needs an HTTPS tunnel/public `/mcp` endpoint
   and manual Connector creation in ChatGPT settings; prefer a stable
   named-tunnel hostname for recurring use over an account-less quick tunnel
   (smoke-test only, URL changes).
6. Never commit or write real domains, account/zone/tunnel IDs, tunnel tokens,
   OAuth passphrases, bearer tokens, or cookie/profile paths into tracked docs,
   notes, plans, reviews, or runbooks; keep real operator state under ignored
   `_ops/*`, `.repo-harness/*`, or `~/.repo-harness/*`.
7. If local Codex also needs repo-harness MCP tools, separately run
   `repo-harness mcp setup codex --repo <repo> --scope project`.

## Failure Modes

- `ORACLE_NOT_INSTALLED` / `ORACLE_INCOMPATIBLE`: fix the pinned Oracle
  binary/runtime before a real consult; do not fall back to native for
  anything but deprecated diagnostics.
- A user asking for `browser-bind` or the old Chrome extension path: report it
  as removed and use Oracle setup instead.
- ChatGPT Web needs manual login/captcha/verification: report the blocker and
  preserve the dry-run session artifact.
- `chatgpt.serverNameConfigured:false` or a missing `chatgpt.serverName`:
  setup is incomplete even when `mcp doctor` otherwise reports `ready_local`.
- A ChatGPT conversation says the selected app/MCP server is not exposed:
  refresh/reselect the app in a fresh conversation rather than trusting prompt
  wording alone.
- Any command that would print `.repo-harness/mcp.tokens.json`,
  `.repo-harness/mcp.oauth.json`, browser profile secrets, or cookies: redact
  the value and report only the file class.

## Boundaries

- Does not create OpenAI API keys, billing projects, or credentials from a
  ChatGPT Pro subscription.
- Does not install/upgrade Oracle from a default repo-harness install; Oracle
  bootstrap is explicit GPT Pro setup/repair only.
- Does not bypass ChatGPT Web rate limits, login checks, manual verification,
  or plan restrictions.
- Does not expose a local MCP server to the public internet without explicit
  auth, tunnel, and user intent, and does not enable `--enable-chatgpt-browser`
  silently.
- Does not commit `.repo-harness/` local auth files, browser profiles,
  cookies, tokens, or tunnel state.
