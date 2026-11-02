# Herdr dispatch and notify

## Herdr Dispatch

- Claude, Codex and Pi peers run in visible Herdr panes through the herdr skill (`herdr agent start|prompt|wait|read`). Receipt-bearing acceptance uses `repo-harness review round`; its OAR host runs the reviewer. Select Pi with `--harness pi`. Never call a vendor CLI directly for acceptance.
- Pi review uses an OAR RPC subprocess under Seatbelt. Its private agent directory links native model configuration and credentials for read-only access. An owner-written mode-0600 `settings.json` contains only native `defaultProvider`, `defaultModel` and `defaultThinkingLevel`; packages, proxy and trust policy are excluded. User extensions, skills, context files, prompt templates and MCP are disabled. The Pi reviewer uses the user's Pi default model. The Receipt's `actual_model` records OAR's actual `provider/model`. An unobserved model is `null`: the Receipt still records the verdict and grants no cross-model claim.
- A cross-model review means Receipt `model_relation: different-family`. The OAR host records the reviewer model and the model of each ended turn of the one author task session bound to the caller pane, campaign and reviewed root. One closed family table in `src/core/review/acceptance-receipt.ts` compares vendor families, not routing providers. Harness kind does not prove a model difference. A shared family is `same-family`. A missing author binding, an unobserved or running turn, a Claude turn (its model is not observed) or a model outside the table is `unknown`. Interactive authors are not OAR-observed, so they give `unknown` and a High-tier cross-model review stays a manual Herdr peer review. The review runtime records identity; it adds no cross-model gate.
- Exception: in the Claude desktop app, operator-attended acceptance review can use `repo-harness review round --launch app-terminal`. The CLI prints the fixed OAR host command. Claude runs that exact command once in an app Terminal tab, then repeats the same round. The same OAR host, Seatbelt profile and Receipt apply.
- Send the root tests-and-implementation review to the other model through Herdr when it is available. Otherwise, run that read-only review in a separate same-model pane.

### Issue-flow topology

This topology applies to issue-flow work (`repo-harness-issue-flow`) on herdr-core (`hc` with Herdr.app) and on classic Herdr.

- Pane layout: put at most 3 panes side by side in one tab. Do not stack panes vertically. When the tab is full, open a new tab.
- Tab 1 holds two panes: the orchestrator on the left and its advisor on the right. Tab 1 may take one worker as its third pane.
- The orchestrator holds the issue-flow coordinator and integrator seats. It only dispatches, accepts and merges. It does not implement a child issue.
- The advisor serves only the orchestrator. It does research and writes proposals. It does not edit code, commit or write to GitHub. It may use read-only probe sub-agents, for example `explorer`, for research. The orchestrator asks it for a board replan by [Replan](https://github.com/Ancienttwo/repo-harness/blob/main/assets/skills/repo-harness-issue-flow/references/replan.md).
- One PR has one pane and one worker agent. Each further worker gets its own pane, as the right split of a tab that is not full or in a new tab. The worker may use the agent-fleet sub-agents (`agents/fleet/`) inside its own pane.
- Recommended models for a Claude-only setup: the orchestrator runs Opus at high effort, and the advisor runs Opus at max effort. This is a recommendation, not a requirement. No seat requires a specific model (issue-flow D7).
- Cleanup: after a PR is accepted and merged, the orchestrator closes the worker's pane, which ends the worker process. It then removes the worker's worktree with `git worktree remove <path>` and deletes the merged branch. A pane or worktree with unmerged or dirty work stays, and the orchestrator reports it.

### Runtime commands

Select the runtime from the caller environment:

- `HC_TERMINAL_ID` set: herdr-core. Use `hc` for terminals and `herdr-app do` for tabs and panes.
- `HERDR_ENV=1` set: classic Herdr. Use the `herdr` commands of the herdr skill (`herdr agent start|prompt|wait|read`, `herdr pane close`).
- Both set: the multiplexers are nested. Refuse and report.
- Do not fall back from one runtime to the other.

herdr-core commands for the topology steps:

| Step | Command |
|---|---|
| New worker tab | `herdr-app do tab.new --name <PR> --space <id> --folder <worktree> --argv '[...]' --task <packet>` |
| Start the advisor | `herdr-app do pane.split --direction right --pane <orchestrator pane> --argv '[...]'` |
| Second worker in a tab | `herdr-app do pane.split --direction right --pane <pane> --argv '[...]'` |
| Message a worker | `hc send <t> <comment URL>` |
| Read a worker | `hc read <t>` |
| Wait for a worker | `hc wait <t>` |
| Close a worker pane | `herdr-app do pane.close --pane <pane>` |

The `argv` starts the agent in the new pane, for example `'["claude"]'`. Without it, the pane opens a shell.

Classic Herdr starts the advisor in two steps: `herdr pane split --pane <orchestrator pane> --direction right`, then `herdr agent start advisor --kind <kind> --pane <new pane>`. A second worker in a tab uses the same two steps with the worker's name.

### Test and Review Rules

- The merge gate is typecheck plus affected tests. Run `bash scripts/check-ci.sh affected --base origin/main` locally.
- Run the full suite for dependency manifests, shared test/runtime foundations, releases, the daily run, or a named integration invariant that focused checks cannot cover.
- When full coverage is required, run `bun run test:full` once on the final rebased head.
- `test:core` excludes the slow integration files. `test:integration` runs those files. `test:full` runs their complete union.
- Full runs use eight isolated file workers. Run files with shared ports or shared HOME writes in the serial tail.
- Tests with port 0 and an isolated HOME can run in parallel.
- For a baseline comparison, run only the test files that failed.
- Run long tasks in the background.
- Wait for the completion notice, or check at intervals of 5 to 10 minutes.
- Do not report each check.
- Before commit, remove debug writes to `/tmp` and other debug instrumentation.

## Notify setup

The notify relay sends herdr-core agent events to a Bot and selected human channels.
The Bot routine webhook is required. Human channels are optional.
The default event is `blocked`. Each channel can also receive `done`.

## Install

Use macOS or Linux. Install repo-harness, Bun, and herdr-core (`hc`).
Windows is not supported because this command requires POSIX file permissions.
Run this command in a terminal. The hc core must run.

```sh
repo-harness herdr notify install
```

Enter the required Bot URL and key. Then enter each optional channel value.
Press Enter to skip an optional value. Input is hidden.
Each active channel has an “also notify on done” question. Its default is no.

The command writes the config to `~/.repo-harness/herdr/notify.env` with file mode `600`.
Then it starts the relay with `hc run --bg --no-parent` in an hc terminal named `rh-notify-relay` with the label `repo-harness.role=notify-relay`.
The relay terminal has no parent, so it stays when the install terminal ends.
An hc terminal starts with the core's environment, so install passes the repo-harness home to the relay as `--home <absolute path>`.
When a live relay terminal already exists, install starts no second one.
The relay reads the config again on each event, so a new config takes effect without a restart.
Last, the command writes `~/.repo-harness/herdr/notify-install.json` with file mode `600`. It names the relay terminal and its label.
The operator console finds the relay only through that record and reads it on each collection.
Without the record, the console shows `notify_session_missing`. A record from classic Herdr notify names a session and is refused as `notify_session_invalid`. Run install once to write a new record.
Run the command again to replace the config.
Supply all values again. An omitted value removes that channel.

To stop delivery, run `repo-harness herdr notify uninstall`.
It ends and removes the relay terminal with `hc kill` and `hc rm`. Then it removes the config, the install record and the delivery record.
When hc fails, uninstall keeps the files.

## Bot routine webhook

1. Create or select the Bot routine that must receive events.
2. Enable the routine's incoming webhook.
3. Get its HTTPS webhook URL and key from the routine config.
4. Enter `WEBHOOK_URL` and `WEBHOOK_KEY` during install.

The Bot needs this webhook to receive pushes.
The relay sends one bot event envelope as JSON. `assets/herdr/github-events/bot-event.mjs` is the one source of its shape.
The GitHub event Worker sends the same envelope.
It sends the key in `Authorization: Bearer` and `x-webhook-key` headers.
The receiving routine must check the key before it acts on an event.

```json
{
  "protocol": "repo-harness.bot-event/v1",
  "source": "herdr",
  "repository": "repo-harness",
  "kind": "agent.blocked",
  "ts": "2026-11-01T08:00:00.000Z",
  "data": { "host": "mac", "terminal": "t7", "name": "rh-d26-1479", "agent": "codex", "blocked_kind": "permission", "task": "1479", "request_id": "r1" }
}
```

| Field | Rule |
|---|---|
| `protocol` | Exactly `repo-harness.bot-event/v1`. |
| `source` | `herdr` or `github`. The notify relay sends `herdr`. |
| `repository` | The `repo-harness.repository` label value, or `null` when the terminal has no valid label. It never holds a path. |
| `kind` | Lowercase dotted name. The relay sends `agent.done` or `agent.blocked`. |
| `ts` | ISO-8601 UTC time in `Date.prototype.toISOString` form. |
| `data` | A plain object. The relay puts `host`, `terminal` (the hc address), `name`, `agent` (the 7501 `app`), and `blocked_kind` (the 7501 `kind` of a blocked turn) in it, and `task` and `request_id` when the labels give them. |

`assertBotEvent` checks a received body against these rules. It throws `invalid bot event: <field>` for the first invalid field.

`data` names the task and the request id only from the terminal's `repo-harness.task` and `repo-harness.request` labels.
A label value that is not a valid id is left out. The relay never reads them from the working directory or the screen.
The event does not name the branch.
On `done`, the Bot assesses the worker's checks with `repo-harness-check`.
When the branch changed source files, the Bot also reads the architecture evidence in that skill.
On `blocked`, the Bot reads the terminal with `hc read` and resolves the blocker.

## Slack incoming webhook

1. Create a Slack app for your workspace.
2. Open **Incoming Webhooks**. Enable incoming webhooks.
3. Select **Add New Webhook to Workspace**. Choose the target channel.
4. Enter the webhook URL as `SLACK_WEBHOOK_URL`.

See [Slack's setup steps](https://api.slack.com/messaging/webhooks).

## Discord webhook

1. Open the server's **Server Settings** and **Integrations**.
2. Create a webhook. Choose its text channel.
3. Copy the webhook URL.
4. Enter it as `DISCORD_WEBHOOK_URL`.

See [Discord's webhook guide](https://support.discord.com/hc/en-us/articles/228383668-Intro-to-Webhooks).
The relay disables mentions in its messages.

## Telegram bot

1. Open `@BotFather` in Telegram. Send `/newbot`.
2. Follow its steps. Keep the bot token private.
3. Send a message to the new bot. For a group, add the bot and send a message there.
4. Use the Bot API `getUpdates` method. Read `message.chat.id` for the target chat.
5. Enter `TELEGRAM_BOT_TOKEN` and `TELEGRAM_CHAT_ID`.

A bot with an existing webhook cannot use `getUpdates` at the same time.
Use that bot's received update to get the chat id.
See [Telegram's tutorial](https://core.telegram.org/bots/tutorial) and [Bot API](https://core.telegram.org/bots/api#getupdates).

## Non-interactive install

Use `--non-interactive` to disable prompts.
Flags take priority over environment values.
Pass secrets through your CI secret environment. Shell arguments can enter shell history.

```sh
# Set WEBHOOK_URL and WEBHOOK_KEY through your secret store first.
repo-harness herdr notify install --non-interactive
```

| Value | Flag | Environment variable |
| --- | --- | --- |
| Bot URL | `--webhook-url` | `WEBHOOK_URL` |
| Bot key | `--webhook-key` | `WEBHOOK_KEY` |
| Slack URL | `--slack-webhook-url` | `SLACK_WEBHOOK_URL` |
| Discord URL | `--discord-webhook-url` | `DISCORD_WEBHOOK_URL` |
| Telegram token | `--telegram-bot-token` | `TELEGRAM_BOT_TOKEN` |
| Telegram chat id | `--telegram-chat-id` | `TELEGRAM_CHAT_ID` |

Use `--webhook-notify-done`, `--slack-notify-done`, `--discord-notify-done`,
or `--telegram-notify-done` to add `done` for that channel.
Telegram needs both its token and chat id. URLs must use HTTPS.
Config values cannot contain quotes, backslashes, or control characters.
The command prints no config values. The relay terminal's environment and argv carry no config value.

## Filters and delivery

The relay runs `repo-harness herdr notify relay --home <path>`. It follows `hc events --json --label repo-harness.notify=on`.
Only terminals that carry `repo-harness.notify=on` reach it. repo-harness sets this label when it starts or labels an agent terminal.
A terminal that gets the label after it starts is followed from that point.
The relay sends on each hc `turn` event whose state is `blocked` or `done`. hc raises a turn when the program's OSC 7501 status leaves `working`.
A terminal without 7501 reports has no turns and sends nothing.
Missing Bot config stops delivery for the event.

Each request has a five-second timeout. Redirects stop delivery.
Channels are independent: a failure or an exception in one channel does not stop or hide another channel.
A successful channel suppresses the same terminal and state for two minutes.
A failed channel can retry on the next matching event.
There is no background retry queue.

The relay writes the newest result of each channel, and the result of the newest event, to `~/.repo-harness/herdr/notify-deliveries.json` with file mode `600`.
The operator console reads each channel's result from that record. A failed channel does not change the result of another channel.
The relay terminal screen shows one line per attempt, for example `[notify-relay] SLACK: HTTP 200`. Read it with `hc read rh-notify-relay`.
Slack, Discord, and Telegram messages end with the same repository name, task, and request id when known.
HTTP success shows that the endpoint accepted a request.
Check the Bot routine or human channel to confirm receipt.

The relay does not restart itself. When the hc core stops or the relay terminal ends, the operator console shows `relay_stopped`. Run install again to start a new relay.
