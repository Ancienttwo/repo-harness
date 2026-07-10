# Architecture Module: runtime-harness/mcp-sidecar

> **Capability ID**: `runtime-harness-mcp-sidecar`
> **Matched Prefixes**: `src/cli/mcp`, `src/cli/commands/mcp.ts`, `src/effects/repo-registry.ts`, ChatGPT MCP setup/reference/Skill surfaces
> **Local Contracts**: `AGENTS.md`, `CLAUDE.md`

## P1 Map

The sidecar is a loopback-only local runtime exposed to remote ChatGPT through an
operator-managed HTTPS tunnel.

- `setup.ts`, `auth.ts`, and `repo-registry.ts` own ignored v3 config, stable
  repo ids, access modes, and the monotonically increasing authorization
  revision.
- `transports/http.ts` owns Streamable HTTP, Host/CORS, OAuth discovery,
  DCR/PKCE, redirect allowlists, and MCP session lifecycle.
- `server.ts`, `policy.ts`, and `tools.ts` select profile capabilities and keep
  planner, executor, and orchestrator unchanged.
- `coding-workspaces.ts` owns explicit granted-repo selection, default managed
  worktrees, instruction discovery, and local cleanup metadata.
- `coding-tools.ts` owns workspace-relative read and rollback-capable guarded
  file mutation plus mutation/audit/index evidence.
- `process-sessions.ts` owns local-user Bash/optional PTY sessions, output bounds,
  process-tree cleanup, environment scrubbing, and ownership isolation.
- CodeGraph remains an optional index adapter. The filesystem and repo registry
  remain authorization and content truth.

Cloudflare, DNS, ChatGPT app state, and service managers are external operator
surfaces; repo-harness guides and probes them but does not mutate them.

## P2 Trace

ChatGPT developer-mode app -> named tunnel -> `127.0.0.1:8765/mcp` -> Host/CORS
gate -> OAuth access token with `repo-harness.coding` and current authorization
revision -> MCP initialize -> `open_workspace(repo_id)` -> explicit live
`read_write` grant -> managed `codex/mcp-*` worktree -> workspace-relative
`read`/`apply_patch` or local-user `exec_command`/`write_stdin` -> bounded result
to ChatGPT.

Patch success writes mutation/audit/index invalidation evidence and runs the
CodeGraph refresh contract. Process completion writes only command hash and
execution metadata, invalidates the repo-wide index, and triggers refresh.
MCP DELETE, expiry, timeout, or server shutdown terminates the MCP session's
process trees; managed worktrees remain for local inspection and require a
clean, merged state before local cleanup.

Error paths fail closed: missing grant, stale OAuth revision, invalid Host,
wildcard/foreign Origin, unregistered redirect, traversal, secret path,
symlink, stale file revision, process ownership mismatch, environment secret,
and unavailable PTY return explicit errors without changing profile or falling
back to a weaker execution mode.

## Semantic Diagram

```mermaid
flowchart LR
  ChatGPT["ChatGPT developer-mode app"] --> Tunnel["Operator-managed HTTPS tunnel"]
  Tunnel --> HTTP["Loopback Streamable HTTP /mcp"]
  HTTP --> Boundary{"Host + CORS + OAuth scope/revision"}
  Boundary --> MCP["MCP session"]
  MCP --> Open["open_workspace(repo_id)"]
  Open --> Grant{"live read_write grant"}
  Grant --> Worktree["Managed worktree by default"]
  Worktree --> Files["read / atomic apply_patch"]
  Worktree --> Process["exec_command / write_stdin"]
  Files --> Evidence["audit + mutation + index invalidation"]
  Process --> Evidence
  Evidence --> CodeGraph["Serialized CodeGraph refresh or dead letter"]
  MCP --> Cleanup["DELETE / expiry / shutdown kills process tree"]
```

## P3 Decision

The `coding` profile is separate and default-off because arbitrary local-user
shell changes the trust model more than extending planner tools would. Explicit
user-scoped grants, profile/revision-bound OAuth, worktree-first operation, and
relative file APIs preserve the strongest repo-harness invariants without
claiming that allowed roots sandbox Bash.

At 10x load, the first bottleneck is synchronous repo-wide CodeGraph refresh
after mutations, not MCP routing. Refresh is intentionally serialized to avoid
mutation/index races; operators can recover from dead-letter evidence without
replaying the mutation. Per-MCP-session process count, duration, output ring,
and retention bounds cap the untrusted concurrency surface.
