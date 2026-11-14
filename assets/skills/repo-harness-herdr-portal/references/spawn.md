# Spawn or reuse a portal

Run `hc` with `--json` and parse each output as one JSON object. A non-zero
exit stops the sequence. Report the exit code and the stderr text unchanged.
`herdr-app do` prints the created IDs or `{"error": …}` with exit 1; an error
stops the sequence the same way.

## Inputs

| Input | Rule |
| --- | --- |
| `slug` | `^[a-z0-9][a-z0-9-]{0,23}[a-z0-9]$`. The operator gives it, or the Skill derives it from repo and task and shows it before use. |
| `name` | Always `portal-<slug>`. hc terminal names are 1-32 characters of `a-z 0-9 - _`, so the slug has at most 25 characters. |
| `cwd` | Existing directory. `realpath` starts with `/private/tmp/`. `git -C <cwd> rev-parse --show-toplevel` equals that path. |
| `repo` | `basename` of the main worktree from `git -C <cwd> rev-parse --git-common-dir`. Used only to find the Herdr.app space. |

Repo but no worktree: create one with
`git -C <repo> worktree add /tmp/<repo>-wt-<slug> -b portal/<slug> origin/main`.
If the path or the branch exists, stop with `worktree_exists`. Do not reuse or
replace it.

After creation, write the shared lifecycle record before starting the agent:
`rh run contract-worktree-runtime record --repo <repo> --worktree <cwd> --creator portal --purpose <slug> --task <slug>`.
The runtime stores the record in the clone's common Git directory. A failed record write stops startup and preserves the checkout.
On operator-authorized closeout, after the portal has stopped, run
`rh run contract-worktree-runtime end-record --repo <repo> --worktree <cwd>`.
This records the end state and does not delete the checkout. Manually created worktrees use the same `record` command with `--creator manual`.

## Sequence

```bash
# 0. Gates: see SKILL.md.

# 1. Reuse check
hc ls --json
#   no row with name == "portal-<slug>"                → step 2
hc get portal-<slug> --json
#   status.state == "blocked"                          → report the record; no message; stop
#   state == "live", basename(foreground.argv[0]) == "claude",
#     foreground.cwd == <cwd>                          → reused: true, step 4
#   any other result                                   → portal_name_conflict; stop

# 2. Space: the space of the repository in Herdr.app
herdr-app ls
#   spaces named <repo>:
#     exactly one → use its ID
#     more than one → portal_space_ambiguous; stop
#     none → portal_space_missing; stop

# 3. Start, with the bootstrap brief as the first message
hc run --bg --json --no-parent --name portal-<slug> --cwd <cwd> \
  --label herdr.space=<space ID> --label repo-harness.notify=on \
  -- claude -n portal-<slug> "<brief>"

# 4. Identity
hc get portal-<slug> --json
```

The `herdr.space` label shows the terminal in that space. Without a
`herdr.tab` label, Herdr.app opens a new tab for it, so the 3-pane cap of a
tab holds. `--no-parent` keeps the portal alive after the caller's command
ends. `repo-harness.notify=on` lets the notify relay report `blocked` and
`done`.

The brief goes in the start argv. A message sent to a booting agent can be
dropped, so do not send the brief later with `hc send`.

When the Claude CLI opens a dialog, for example the folder trust question in
a new worktree, step 4 shows it in `status`. Report it. The operator answers
the dialog in the pane. Do not answer it with `hc keys`. Then run step 4 again.

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

## Portal record (v2)

Copy every value from a command output in the same run. If a command did not
return a field, leave the field out and report the gap. Never fill a value from
memory or from an earlier run.

```json
{
  "portal": "v2",
  "name": "portal-<slug>",
  "reused": false,
  "cwd": "<foreground.cwd>",
  "hc": {
    "address": "<address>",
    "state": "<state>",
    "status": "<status.state>",
    "space": "<labels[\"herdr.space\"]>"
  },
  "claude": {
    "cli_version": "<claude --version>"
  },
  "messaging": {
    "address": "portal-<slug>",
    "listed": "<ListAgents row present: true|false>"
  }
}
```

The `cwd` and `hc` values come from step 4. `messaging.listed` comes from
`references/messaging.md`.

## Error codes

| Code | Source | Behavior |
| --- | --- | --- |
| `messaging_unavailable`, `claude_cli_too_old`, `portal_inside_hc`, `herdr_app_down`, `hc_too_old`, `hc_unreachable`, `cwd_outside_tmp`, `cwd_not_worktree` | gates | stop; create nothing |
| `worktree_exists` | input | stop; do not touch the path or branch |
| `portal_name_conflict` | step 1 | stop; no takeover |
| `portal_space_ambiguous`, `portal_space_missing` | step 2 | stop; the operator opens, picks or renames the space |
| hc or `herdr-app` error | any step | stop; report it; leave the terminal as is |
| `portal_not_listed` | messaging | report the record; manual repair |

The Skill deletes nothing. Normal repo closeout and sweep rules own a worktree
that stays behind.
