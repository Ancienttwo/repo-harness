---
name: herdr
description: "Control Herdr panes and agents when the user explicitly requests Herdr. Discover panes by task path, then reuse a task reviewer or create a new pane."
---

# Herdr

## Resolve the caller context

Check the environment visible to the tool execution process before Herdr control:

```sh
printenv HERDR_ENV HERDR_SESSION HERDR_PANE_ID
```

Missing variables do not prove that the user opened Codex outside Herdr. A tool
shell can run through an app-server daemon without the pane's environment.
Report missing tool context accurately; do not tell the user to reopen an
already identified Herdr pane merely because `HERDR_ENV` is absent.

- With `HERDR_ENV=1`, use the inherited session. Use `--current` only when the
  calling pane context is available; otherwise use an explicit pane or agent.
- Without inherited context, start with `herdr session list --json`. For each
  running session, use `herdr --session <name> pane list` and
  `herdr --session <name> workspace list`. Read-only discovery does not require
  prior task ownership. Do not start stopped sessions during discovery.
- List panes whose live working directory matches the task's canonical absolute
  path. Use `foreground_cwd` when present, otherwise `cwd`; resolve symlinks
  before comparison. Do not match by basename, title, or path prefix. A linked
  worktree is a separate path; use its recorded primary workspace for grouping.
- Prefer the inherited or recorded session. Otherwise select a session and
  workspace from the exact path matches. Record the session, workspace, path,
  and pane IDs. This establishes the location for an authorized reviewer;
  the user does not need to prove ownership of the whole session.
- Read a candidate's live agent state and recent scrollback before reuse.
  Reuse a reviewer only when it belongs to this task and meets the requested
  independence requirement. A matching path or an idle agent alone does not
  authorize repurposing another task's pane.
- If no suitable reviewer exists, create a new pane at the task path in the
  matched workspace. Split right with `--no-focus`; keep at most three panes
  per tab and create a new tab when full. Do not send input to occupied panes.
  This reviewer topology is authorized by the review request; it needs no
  separate layout approval despite the generic CLI guidance below.
- If no pane matches, inspect workspace paths and create a pane or tab in the
  matching workspace. If no workspace matches, create one at the task path in
  the inherited or recorded session, or a new uniquely named task session.
  Record creation results and use their returned IDs.
- Use an explicit session selector and pane or agent ID for later control.
  Do not use `--current` without inherited pane context. Ask only when the
  task requires a particular existing target that discovery cannot identify.
  Do not silently switch delegation runtimes.

Never set `HERDR_ENV=1` to bypass this check, invent an existing session or pane ID, or use
an omitted session selector to target the UI-focused/default session. Merely
finding a running session does not establish task ownership. Explicit session
selection does not grant permission for unrelated actions.

The configuration above owns session selection. The following CLI reference
comes from the installed Herdr binary. In explicit-session mode, prefix every
session-scoped example with `herdr --session <owned-session>` instead of bare
`herdr`; examples using `--current` require inherited caller context.

