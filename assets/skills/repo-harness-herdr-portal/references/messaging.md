# Portal messaging

One name is the authority. `portal-<slug>` is the hc terminal name (`--name`)
and the Claude session name (`-n`). No mapping table exists.

## Caller name

The worker replies to a session name. Before the start, confirm that the
calling session has a stable name. If it has none, ask the operator to run
`/rename <name>` in the caller. Do not invent a name.

## Find the worker

1. Run `ListAgents` in the caller.
2. The portal is the row whose name is exactly `portal-<slug>`.
3. Set `messaging.listed` in the portal record to `true` only when that row is
   present in this run.

A CLI session started with `-n` in an hc terminal is not yet verified to show
in `ListAgents` from the App Code tab. Treat a missing row as
`portal_not_listed`. Do not assume success.

## Send work

- Use `SendMessage({to: "portal-<slug>", message: …})` or an @mention of
  `portal-<slug>`.
- Put the task content, scope and expected reply in the message.
- Read the reply in the caller. The terminal screen (`hc read portal-<slug>`)
  is only an observation, not a reply.

## No fallback

The start argv carries the one bootstrap brief. When the row is missing, do not
send task traffic through `hc send`, `hc keys`, pane input or any other
channel.

## Repair `portal_not_listed`

1. Report `portal_not_listed` with the portal record.
2. The operator runs `/rename portal-<slug>` in the worker pane.
3. Run step 1 of `references/spawn.md` again, then find the worker again.

## Worker waits at its prompt

`hc get portal-<slug>` shows `status.state` as `blocked` or `idle`. When the
notify relay is installed, it reports `blocked` for the
`repo-harness.notify=on` label. The operator reads the pane. Do not answer a
dialog in the pane for the operator.
