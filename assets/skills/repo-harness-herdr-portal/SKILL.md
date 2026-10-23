---
name: repo-harness-herdr-portal
description: Start or reuse a named Claude CLI worker in a visible Herdr pane from a Claude Code session (App Code tab first), return its portal record, then coordinate through Claude Code cross-session messaging.
when_to_use: "herdr portal, portal worker, start claude in herdr, spawn claude cli worker, App 开 herdr worker, 在 herdr 里起 claude"
---

# repo-harness-herdr-portal

Bot entrypoint. Explicit invoke only. Herdr owns pane and agent identity. Claude Code owns
the message channel. The Skill owns no state, daemon, registry or transport.

## Outcome

One live Claude CLI agent named `portal-<slug>` in a visible Herdr pane, with
its cwd under `/private/tmp`. The caller gets one portal record (v1) copied from
command output in the same run. After one bootstrap brief, all task traffic uses
`SendMessage` or an @mention of `portal-<slug>`.

## Mode Selection

- Spawn or reuse, gates, record and error codes: `references/spawn.md`.
- Find the worker, send work, repair a missing row: `references/messaging.md`.
- Not for review or acceptance: use `repo-harness-cross-review` or
  `repo-harness review round --launch app-terminal`.
- Already inside a Herdr pane (`HERDR_ENV=1`) and only need pane control: use
  the `herdr` skill.
- Not for Codex or any second-model pane in v1.

## Gates

Stop with the failure code. Do not repair a gate.

| Gate | Check | Code |
| --- | --- | --- |
| Messaging | `ListAgents` and `SendMessage` are tools of this session | `messaging_unavailable` |
| CLI | `claude --version` ≥ 2.1.224 | `claude_cli_too_old` |
| Herdr version | `herdr --version` ≥ `HERDR_OBSERVATION_VERSION` (`src/effects/terminal/herdr-observation.ts`) | `herdr_too_old` |
| Herdr server | `herdr status --json`: `server.status == "running"` and `server.endpoint_compatible == true` | `herdr_down` |
| Socket | `herdr status --json` transport error | `herdr_unreachable` |
| cwd | `realpath` under `/private/tmp/`, and it is the worktree top level | `cwd_outside_tmp`, `cwd_not_worktree` |

`herdr_down`: tell the operator to start Herdr in a terminal (`herdr`). Never
run `herdr server` headless. The App Bash sandbox can block the Herdr socket.
Report that transport error as is; this path is not verified yet.

## Boundaries

The Skill and the bootstrap brief never:

- merge, push to `main`, tag, publish, release or deploy;
- approve, close or comment on PRs or issues for the operator;
- drive the App UI, computer-use, Claude in Chrome or other browser automation;
- pass `--dangerously-skip-permissions`, `--permission-mode` or other permission flags;
- read, write or forward credentials, `.env` files or tokens;
- send input to a pane it did not start, or to an agent not named `portal-*`;
- answer an approval or question dialog in the worker pane;
- close, kill or rename a pane, tab or workspace it did not create;
- close a portal pane without an explicit operator request;
- use a worktree outside `/private/tmp`, start a headless Herdr server or change Herdr config.

The real enforcement is the operator's Claude settings, the repo hooks and
GitHub branch protection. This text is guidance.
