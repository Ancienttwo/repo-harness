# ChatGPT direct coding MCP

This is the operator and security reference for the opt-in `coding` profile. The
default `planner`, `executor`, and `orchestrator` profiles keep their existing
tool and trust boundaries.

Current ChatGPT UI terminology is **developer-mode app** under **Settings →
Plugins**; older repo-harness material may call the same surface a Connector.
The authoritative product flows are [ChatGPT Developer mode](https://developers.openai.com/api/docs/guides/developer-mode)
and [Connect from ChatGPT](https://developers.openai.com/apps-sdk/deploy/connect-chatgpt).

## Trust boundary

The coding profile provides direct local-user-authority Bash. It does not invoke
Codex or Claude, so it does not consume their agent quota. It is also not a
filesystem sandbox: a command starts in the selected workspace but can access
anything the local OS user can access. The repo grant gates which workspace can
be opened; it is not a shell access allowlist. Use only on a personally controlled
host and keep ChatGPT write confirmations enabled.

The profile is fail-closed until all of these are true:

- user-scoped v3 config selects `coding` and has `coding.enabled: true`;
- at least one adopted repo has an explicit `read_write` grant;
- OAuth tokens contain `repo-harness.coding`, the current authorization
  revision, and a server-issued coding authorization identity;
- the server listens on loopback and the request Host matches the local or saved
  public endpoint.

## Setup

```bash
repo-harness mcp setup chatgpt \
  --scope user \
  --profile coding \
  --grant-read-write "$HOME/Projects/my-repo" \
  --endpoint https://mcp.example.com/mcp

repo-harness mcp serve \
  --repo "$HOME/Projects/my-repo" \
  --transport http \
  --host 127.0.0.1 \
  --port 8765 \
  --profile coding
```

There is no implicit write grant. Change access and revoke existing coding
authorization revisions with:

```bash
repo-harness mcp access set --repo "$HOME/Projects/my-repo" --mode read_write
repo-harness mcp access set --repo "$HOME/Projects/my-repo" --mode read_only
```

## Four network values

Do not interchange these values:

| Value | Example | Consumer |
|---|---|---|
| Local origin | `http://127.0.0.1:8765` | local health and OAuth smoke |
| Tunnel upstream | `http://127.0.0.1:8765` | tunnel ingress service |
| Public origin | `https://mcp.example.com` | OAuth issuer and Host policy; no `/mcp` |
| ChatGPT MCP server URL | `https://mcp.example.com/mcp` | developer-mode app metadata; includes `/mcp` |

`--endpoint` stores the fourth value in ignored user config. repo-harness derives
the public origin and Host allowlist from it. The HTTP server still binds only to
loopback.

## Tunnel choice

| Provider | Best use | Stability and tradeoff |
|---|---|---|
| Cloudflare named tunnel | recurring ChatGPT app | preferred; stable hostname and DNS, explicit operator setup |
| Cloudflare quick tunnel | short smoke | no DNS setup, but URL changes and must not be treated as durable config |
| ngrok reserved domain | recurring or debugging | stable when reserved; convenient traffic inspector, plan limits vary |
| Pinggy | short smoke | low setup overhead; temporary endpoint and service limits |
| Tailscale Funnel | tailnet-controlled host | stable identity and ACL integration; requires matching account/network policy |

repo-harness provides commands and diagnostics but does not create Tunnel, DNS,
launchd, or systemd state.

Named Cloudflare shape:

```yaml
tunnel: <tunnel-uuid>
credentials-file: ~/.cloudflared/<tunnel-uuid>.json
ingress:
  - hostname: mcp.example.com
    service: http://127.0.0.1:8765
  - service: http_status:404
```

```bash
cloudflared tunnel login
cloudflared tunnel create repo-harness-mcp
cloudflared tunnel route dns repo-harness-mcp mcp.example.com
cloudflared tunnel run repo-harness-mcp
```

## ChatGPT developer-mode app

1. Enable **Settings → Security and login → Developer mode**.
2. Open **Settings → Plugins**, create a developer-mode app, and enter a name,
   description, and the public MCP server URL ending in `/mcp`.
3. Select OAuth authentication when prompted. ChatGPT may use DCR; the server
   requires PKCE S256 and validates the registered redirect URI plus the local
   redirect-host allowlist.
4. Verify the discovered tools. After a schema change use **Refresh** on the app
   details page and start a fresh chat.
5. Keep a confirmation level that asks before changes. All `apply_patch`,
   `exec_command`, and `write_stdin` calls are destructive; shell is also
   open-world.

Only a visible `Called tool` event or captured tool-call transcript is
`invocation_verified`. If the selected model/account refuses write or shell
despite a current schema, record `surface_blocked`; model prose is not proof of
an invocation.

## Tools and workspace lifecycle

- `open_workspace({repo_id, mode?, base_ref?})` defaults to a managed worktree;
  `mode: "checkout"` is explicit.
- `read` accepts workspace-relative paths and returns a SHA-256 revision.
- `apply_patch` performs guarded create/replace/delete/move operations as one
  rollback-capable transaction.
- `exec_command` starts pipe or requested PTY sessions. `write_stdin` polls,
  writes input, resizes PTY, or sends Ctrl-C.
- ChatGPT may initialize a fresh MCP transport for each tool call. Workspace and
  process ids remain usable across those transports only while they present
  tokens from the same OAuth authorization grant; another grant cannot reuse a
  workspace, process, or transport session id.
- MCP DELETE and transport expiry close only the transport. OAuth revoke,
  authorization revision or repo-access change, coding disable, 30-minute
  authorization idle expiry, process timeout, and server shutdown terminate the
  authorization runtime's process trees. Refresh-token rotation preserves the
  same runtime identity.

Managed worktrees are local state under `~/.repo-harness/`:

```bash
repo-harness mcp workspaces list --json
repo-harness mcp workspaces cleanup --workspace-id <id>
```

Cleanup refuses dirty or unmerged worktrees. Remote MCP has no worktree-delete
tool.

## File, environment, and audit policy

Reads obey `.ignore` and secret denies. Writes additionally reject `.git/**`,
`.env*`, key material, `_ops/**`, `_ref/**`, absolute/traversal paths, and
symlink escapes. Process environments inherit only basic OS keys. Extra key
names must appear in ignored `coding.environmentAllowlist`; names associated
with MCP, Tunnel, OAuth, Codex, Claude, tokens, secrets, passwords, credentials,
cookies, and private/API keys are always rejected.

`node-pty` is optional. Under Bun 1.3.x its event delivery is unreliable, so a
PTY request returns `PTY_UNAVAILABLE` instead of hanging or silently changing to
pipe execution. Pipe sessions and the PTY manager contract remain supported.

Audit records hashes and metadata only: actor/session, command hash, relative
cwd, duration, exit/signal, and byte counts. They do not store raw command,
stdout, or stderr. File and shell mutations append index invalidation evidence;
CodeGraph refresh failures append retryable dead-letter evidence.

## Diagnostics and rollout

```bash
repo-harness mcp doctor --repo . --live
```

The live doctor reports `config_ready → local_ready → tunnel_ready →
oauth_ready → mcp_ready`. It probes TLS/Host, OAuth discovery, DCR/PKCE/token,
`initialize`, and `tools/list` without printing the passphrase or tokens.

Live ChatGPT canary is a separate external mutation. Until a user explicitly
authorizes Tunnel, DNS, and ChatGPT app changes, record
`live_canary_pending_authorization` and stop at local E2E evidence.
