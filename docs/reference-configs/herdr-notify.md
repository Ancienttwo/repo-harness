# Herdr notify setup

Use this command to send Herdr agent events to a Bot and selected human channels.
The Bot routine webhook is required. Human channels are optional.
The default event is `blocked`. Each channel can also receive `done`.

## Install

Use macOS or Linux. Install repo-harness, Node 24, and Herdr 0.9.3 or later.
Windows is not supported because this command requires POSIX file permissions.
Run this command in a terminal. Replace `default` with your Herdr session name.

```sh
repo-harness herdr notify install --session default
```

Enter the required Bot URL and key. Then enter each optional channel value.
Press Enter to skip an optional value. Input is hidden.
Each active channel has an “also notify on done” question. Its default is no.

The command asks Herdr for `plugin config-dir aimpact.webhook-notify`.
It copies the shipped plugin to `source/` in that directory.
It links that copy with `herdr plugin link --disabled`.
It writes `.env` with file mode `600`. Then it enables the plugin.
The source copy stays in place when a package cache is removed.
Run the command again to replace the config and update the source copy.
Supply all values again. An omitted value removes that channel.

## Bot routine webhook

1. Create or select the Bot routine that must receive events.
2. Enable the routine's incoming webhook.
3. Get its HTTPS webhook URL and key from the routine config.
4. Enter `WEBHOOK_URL` and `WEBHOOK_KEY` during install.

The Bot needs this webhook to receive pushes.
The plugin sends JSON with the pane, workspace, session, agent, status, and time.
It sends the key in `Authorization: Bearer` and `x-webhook-key` headers.
The receiving routine must check the key before it acts on an event.

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
The plugin disables mentions in its messages.

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
repo-harness herdr notify install --session default --non-interactive
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
The command prints no config values. Do not add `.env` to version control.

## Filters and delivery

The plugin selects only the session named by `--session`.
It skips temporary workspace and pane paths under `/tmp`, `/private/tmp`,
`/var/folders`, `/private/var/folders`, and the system temporary directory.
It also skips workspace labels that start with `rh-herdr-`.
Missing or relative workspace paths and missing required config stop delivery.

Each request has a five-second timeout. Redirects stop delivery.
A successful channel suppresses the same pane and status for two minutes.
A failed channel can retry on the next matching event.
There is no background retry queue. Concurrent events can send duplicates.
Runtime state is in `HERDR_PLUGIN_STATE_DIR`.

Inspect delivery results with `herdr plugin log list --plugin aimpact.webhook-notify`.
HTTP success shows that the endpoint accepted a request.
Check the Bot routine or human channel to confirm receipt.
To stop delivery, run `herdr plugin disable aimpact.webhook-notify`.
If install fails, check the reported stage and run install again.
A failure after linking can leave the plugin disabled.

The command and environment contract come from the [Herdr plugin guide](https://github.com/herdrdev/herdr/blob/master/docs/next/website/src/content/docs/plugins.mdx).
