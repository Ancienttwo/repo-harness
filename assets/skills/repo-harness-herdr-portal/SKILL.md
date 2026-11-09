---
name: repo-harness-herdr-portal
description: Start or reuse a named Claude CLI worker in a visible herdr-core terminal from a Claude Code session (App Code tab first), return its portal record, then coordinate through Claude Code cross-session messaging.
when_to_use: "herdr portal, portal worker, start claude in herdr, spawn claude cli worker, App 开 herdr worker, 在 herdr 里起 claude"
---

# repo-harness-herdr-portal

Bot entrypoint. Explicit invoke only. herdr-core (`hc`) owns the terminal and
its name. Herdr.app shows it as a pane. Claude Code owns the message channel.
The Skill owns no state, daemon, registry or transport.

## Outcome

One live Claude CLI agent in an hc terminal named `portal-<slug>`, shown in a
Herdr.app pane, with its cwd under `/private/tmp`. The caller gets one portal
record (v2) copied from command output in the same run. The start command
carries the bootstrap brief. After it, all task traffic uses `SendMessage` or
an @mention of `portal-<slug>`.

## Mode Selection

- Spawn or reuse, gates, record and error codes: `references/spawn.md`.
- Find the worker, send work, repair a missing row: `references/messaging.md`.
- Not for review or acceptance: use `repo-harness-cross-review` or
  `repo-harness review round --launch app-terminal`.
- Already in an hc terminal (`HC_TERMINAL_ID` set): use `hc` and `herdr-app`
  directly ([Herdr Dispatch](https://github.com/aimpact-inc/repo-harness/blob/main/docs/reference-configs/herdr-notify.md#herdr-dispatch)).
- Not for Codex or any second-model terminal in v2.

## Gates

Run the gates in this order. Stop with the failure code. Do not repair a gate.

| Gate | Check | Code |
| --- | --- | --- |
| Messaging | `ListAgents` and `SendMessage` are tools of this session | `messaging_unavailable` |
| CLI | `claude --version` ≥ 2.1.224 | `claude_cli_too_old` |
| Caller | `HC_TERMINAL_ID` is not set | `portal_inside_hc` |
| Herdr.app | `herdr-app status` reports a running window | `herdr_app_down` |
| hc version | `runtime.herdr_core.status` of `repo-harness setup check --json` is `present` (`hc --version` ≥ `min_version` of the installed package's `src/core/terminal/herdr-core-pin.json`) | `hc_too_old` |
| hc core | `hc server status --json` exits 0 and prints a `version` | `hc_unreachable` |
| cwd | `realpath` under `/private/tmp/`, and it is the worktree top level | `cwd_outside_tmp`, `cwd_not_worktree` |

`herdr_app_down`: tell the operator to open Herdr.app. Herdr.app runs the hc
core. An hc call can start a stopped core, and that core keeps the caller's
environment for every later terminal. So check the window before any hc call.
Never start, stop or restart the core yourself. The App Bash sandbox can block
the hc socket. Report that transport error as `hc_unreachable` with the
message unchanged.

## Boundaries

The Skill and the bootstrap brief never:

- merge, push to `main`, tag, publish, release or deploy;
- approve, close or comment on PRs or issues for the operator;
- drive the App UI, computer-use, Claude in Chrome or other browser automation;
- pass `--dangerously-skip-permissions`, `--permission-mode` or other permission flags;
- read, write or forward credentials, `.env` files or tokens;
- send input to a terminal it did not start, or to a terminal not named `portal-*`;
- answer an approval or question dialog in the worker terminal;
- close, kill or rename a pane, tab, space or terminal it did not create;
- close or kill a portal terminal without an explicit operator request;
- use a worktree outside `/private/tmp`, start, stop or restart the hc core or
  Herdr.app, or change Herdr config.

The real enforcement is the operator's Claude settings, the repo hooks and
GitHub branch protection. This text is guidance.
