# Herdr orchestrator MCP

The `orchestrator` profile lets a cloud Bot dispatch work to Claude and Codex
agent panes in local Herdr. The Bot gets no shell, no file tools, no coding
workspace and no planner writes.

## Tools

| Tool | Input | Effect |
|---|---|---|
| `list_task_agents` | none | Runs `herdr agent list`. Returns only in-scope agents: `pane_id`, `name`, `agent`, `agent_status`, `repo_id`, `title`. |
| `prompt_task_agent` | `pane_id`, `text` (max 16 KiB) | Re-checks scope, then runs `herdr agent prompt <pane_id> <text>`. Returns after submission; it does not wait. |
| `read_task_agent` | `pane_id`, `lines` (default 120, max 400) | Re-checks scope, then runs `herdr agent read <pane_id> --source recent-unwrapped --lines N`. Output is redacted. |

The list output contains no paths. Every call writes one MCP audit entry with an
input hash, never the prompt text.

## Scope rule

An agent is in scope when its `foreground_cwd` (else `cwd`) resolves through
`realpath` and `git rev-parse --git-common-dir` to the same git common directory
as a registered, adopted repo with `accessMode: read_write`. A linked worktree
follows its primary repo. A relative, missing or non-git directory is out of
scope.

`prompt_task_agent` and `read_task_agent` read a fresh `agent list` on each
call. For an out-of-scope or unknown pane they return `PANE_NOT_IN_SCOPE` and do
not run the prompt or read command. A grant change takes effect at the next call.

The Herdr session comes from the notify install record that
`repo-harness herdr notify install --session <name>` writes. Each tool call reads
the record. When the record is missing or invalid, the call returns
`notify_session_missing` or `notify_session_invalid`, is audited as blocked, and
runs no herdr command. The child process does not inherit `HERDR_*` variables.

## Trust boundary

A prompt makes the agent act with the authority of the local OS user. That
authority is not limited to the granted repo. Grant `read_write` only to repos
whose agents you let a Bot direct.

The profile uses the same gate as `coding`:

- the user-level v3 config selects `orchestrator`;
- at least one adopted repo has an explicit `read_write` grant;
- the config authorization revision equals the registry revision;
- OAuth only, with the `repo-harness.orchestrator` scope. A token from another
  profile is rejected, and the coding scope does not work here;
- access tokens expire after 1 hour; refresh tokens rotate and last up to 30 days;
- the request Host matches the local or saved public endpoint, and a browser
  Origin must be `https://chatgpt.com`.

## Setup

```bash
repo-harness mcp setup chatgpt \
  --profile orchestrator \
  --grant-read-write "$HOME/Projects/my-repo" \
  --endpoint https://mcp.example.com/mcp

repo-harness mcp serve \
  --repo "$HOME/Projects/my-repo" \
  --transport http \
  --host 127.0.0.1 \
  --port 8765 \
  --profile orchestrator
```

A change between `coding` and `orchestrator` needs `--grant-read-write` again
and bumps the authorization revision, which revokes the tokens of the old
profile. Tunnel, ChatGPT app, client revoke and live doctor steps are the same
as in [chatgpt-coding-mcp.md](chatgpt-coding-mcp.md).

Upgrade: before this profile had tools, `orchestrator` setup needed no grant. An
existing v3 config with `profile: orchestrator` still counts as authorized. If
any adopted repo already has a `read_write` grant and the revision is current,
the next serve exposes the dispatch tools without a new setup. To keep dispatch
off, rerun setup with another profile, or set each granted repo back with
`repo-harness mcp access set --repo <path> --mode read_only`.
