# Spawn or reuse a portal

Parse every Herdr output as one JSON envelope: `{"id":…,"result":…}` or
`{"id":…,"error":{"code":…,"message":…}}`. A non-zero exit or an `error`
envelope stops the sequence. Report that `code` and `message` unchanged.

## Inputs

| Input | Rule |
| --- | --- |
| `slug` | `^[a-z0-9][a-z0-9-]{0,23}[a-z0-9]$`. The operator gives it, or the Skill derives it from repo and task and shows it before use. |
| `name` | Always `portal-<slug>`. Herdr agent names match `[a-z][a-z0-9_-]{0,31}`, so the slug has at most 25 characters. |
| `cwd` | Existing directory. `realpath` starts with `/private/tmp/`. `git -C <cwd> rev-parse --show-toplevel` equals that path. |
| `repo` | `basename` of the main worktree from `git -C <cwd> rev-parse --git-common-dir`. Used only for the workspace label. |

Repo but no worktree: create one with
`git -C <repo> worktree add /tmp/<repo>-wt-<slug> -b portal/<slug> origin/main`.
If the path or the branch exists, stop with `worktree_exists`. Do not reuse or
replace it.

After creation, write the shared lifecycle record before starting the agent:
`repo-harness run contract-worktree-runtime record --repo <repo> --worktree <cwd> --creator portal --purpose <slug> --task <slug>`.
The runtime stores the record in the clone's common Git directory. A failed record write stops startup and preserves the checkout.
On operator-authorized closeout, after the portal has stopped, run
`repo-harness run contract-worktree-runtime end-record --repo <repo> --worktree <cwd>`.
This records the end state and does not delete the checkout. Manually created worktrees use the same `record` command with `--creator manual`.

## Sequence

```bash
# 0. Gates: see SKILL.md.

# 1. Reuse check
herdr agent get portal-<slug>
#   error.code == agent_not_found                     → step 2
#   result.agent.agent == "claude", result.agent.cwd == <cwd>,
#   result.agent.interactive_ready == true            → reused: true, step 5
#   result.agent.agent_status == "blocked"            → report the record; no prompt; stop
#   any other found record                            → portal_name_conflict; stop

# 2. Workspace: one per repo, label portal-<repo>
herdr workspace list
#   result.workspaces[] with label == "portal-<repo>":
#     exactly one → use its workspace_id and active_tab_id; step 3b
#     more than one → portal_workspace_ambiguous; stop
#     none → step 3a

# 3a. New workspace: use its root pane
herdr workspace create --cwd <cwd> --label portal-<repo> --no-focus
#   pane_id = result.root_pane.pane_id

# 3b. Existing workspace: max 3 panes side by side per tab, never split down
herdr tab list --workspace <workspace_id>
#   the row in result.tabs[] with tab_id == active_tab_id; read pane_count
#   pane_count < 3:
herdr pane list --workspace <workspace_id>
#     split the last row in result.panes[] with tab_id == active_tab_id
herdr pane split <that pane_id> --direction right --cwd <cwd> --no-focus
#     pane_id = result.pane.pane_id
#   pane_count >= 3:
herdr tab create --workspace <workspace_id> --cwd <cwd> --label portal --no-focus
#     pane_id = result.root_pane.pane_id

herdr pane rename <pane_id> portal-<slug>

# 4. Start
herdr agent start portal-<slug> --kind claude --pane <pane_id> --timeout 60000 -- --name portal-<slug>

# 5. Identity
herdr agent get portal-<slug>

# 6. Bootstrap brief: new portal only
herdr agent prompt portal-<slug> "<brief>" --wait --timeout 30000
```

`agent prompt --wait` already waits for the first settled `idle`, `done` or
`blocked` state. Do not add `--until` for those defaults.

The pane order in `pane list` is not a verified spatial order. Herdr keeps the
3-pane cap correct either way; only the position of the new pane can differ.

`agent start` returns `agent_not_ready` when the Claude CLI opens a dialog, for
example the folder trust question in a new worktree. Report it. The operator
answers the dialog in the pane. Then run step 1 again.

Pass no permission flags. The CLI uses the operator's Claude settings and hooks
in that worktree.

## Bootstrap brief

Fixed text. Replace only the three values. Put no task content in it.

```text
You are portal-<slug>, a Claude CLI worker in Herdr. Your cwd is <cwd>.
Report to the Claude Code session named <caller-name>.
Reply with SendMessage to the sender. Do not wait at the prompt for an answer
the sender cannot see.
Do not merge, push to main, tag, publish, release or deploy.
Do not approve, close or comment on PRs or issues for the operator.
Do not use browser automation, computer-use or permission bypass flags.
Do not read, write or forward credentials, .env files or tokens.
Work only inside <cwd>. Wait for a task message.
```

## Portal record (v1)

Copy every value from a command output in the same run. If a command did not
return a field, leave the field out and report the gap. Never fill a value from
memory or from an earlier run.

```json
{
  "portal": "v1",
  "name": "portal-<slug>",
  "reused": false,
  "cwd": "<result.agent.cwd>",
  "herdr": {
    "workspace_id": "<result.agent.workspace_id>",
    "tab_id": "<result.agent.tab_id>",
    "pane_id": "<result.agent.pane_id>",
    "terminal_id": "<result.agent.terminal_id>",
    "agent_status": "<result.agent.agent_status>",
    "interactive_ready": "<result.agent.interactive_ready>"
  },
  "claude": {
    "session_id": "<result.agent.agent_session.value>",
    "cli_version": "<claude --version>"
  },
  "messaging": {
    "address": "portal-<slug>",
    "listed": "<ListAgents row present: true|false>"
  }
}
```

The `herdr` and `claude.session_id` values come from step 5. `messaging.listed`
comes from `references/messaging.md`.

## Error codes

| Code | Source | Behavior |
| --- | --- | --- |
| `messaging_unavailable`, `claude_cli_too_old`, `herdr_too_old`, `herdr_down`, `herdr_unreachable`, `cwd_outside_tmp`, `cwd_not_worktree` | gates | stop; create nothing |
| `worktree_exists` | input | stop; do not touch the path or branch |
| `portal_name_conflict` | step 1 | stop; no takeover |
| `portal_workspace_ambiguous` | step 2 | stop; the operator picks or renames a workspace |
| Herdr `error.code` | any step | stop; report it; leave the pane as is |
| `portal_not_listed` | messaging | report the record; manual repair |

The Skill deletes nothing. Normal repo closeout and sweep rules own a worktree
that stays behind.
