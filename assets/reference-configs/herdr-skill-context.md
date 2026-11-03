---
name: herdr
description: "Control herdr-core terminals and Herdr.app panes when the user explicitly requests Herdr. Find terminals by task path, then reuse a task reviewer or start a new one."
---

# Herdr

## Resolve the caller context

Check the environment visible to the tool execution process before hc control:

```sh
printenv HC_TERMINAL_ID HC_TERMINAL_SOCKET HC_SCOPE
```

Missing variables do not prove that the user opened the agent outside Herdr. A
tool shell can run through an app-server daemon without the terminal's
environment. Report missing tool context accurately; do not tell the user to
reopen an already identified Herdr terminal merely because `HC_TERMINAL_ID` is
absent.

- With `HC_TERMINAL_ID`, that value is your address. Terminals that you start
  are your children, and children report to you with `hc send $HC_TERMINAL_ID`.
- Without `HC_TERMINAL_ID`, `hc` still reaches the user's core. Start with
  `hc ls --json`. It lists all live terminals of the user, not only yours.
  Read-only discovery does not require prior task ownership.
- List terminals whose working directory matches the task's canonical absolute
  path. Resolve symlinks before comparison. Do not match by basename, name, or
  path prefix. A linked worktree is a separate path.
- Read a candidate's status with `hc get <t>` and its recent screen with
  `hc read <t>` before reuse. Reuse a reviewer only when it belongs to this
  task and meets the requested independence requirement. A matching path or an
  idle agent alone does not authorize repurposing another task's terminal.
- If no suitable reviewer exists, start one at the task path with
  `hc run --bg --name <name> --cwd <task path> <template-or-agent> "<task>"`. Record the returned address.
  Do not send input to terminals of another task.
- For a visible pane, use `herdr-app do`. Split right; keep at most three
  panes per tab and create a new tab when full. `herdr-app --skill` gives the
  tab and pane commands. This reviewer topology is authorized by the review
  request; it needs no separate layout approval.
- Use the recorded address for later control. Ask only when the task requires
  a particular existing terminal that discovery cannot identify. Do not
  silently switch delegation runtimes.

Never invent a terminal address, and never stop, restart, or update the user's
hc core. Finding a live terminal does not establish task ownership. Clean up
only the terminals that you started.

The configuration above owns terminal selection. The following manual comes
from the installed hc binary (`hc --skill`).
