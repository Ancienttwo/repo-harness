# GitHub events push

A Cloudflare Worker receives the webhooks of one GitHub App, filters them in
code and sends short bot events to the Bot routine webhook. The orchestrator
then does not poll GitHub. An event is a notice: the Bot reads GitHub again
for details. The orchestrator still reads the board at start; that read is the
reconciliation. The Worker never writes to GitHub.

## When to run

Run `repo-harness events install` once when the orchestrator starts to use
pushed events. Run it again to change the Bot webhook, the orchestrator login
or the App, or after an upgrade of repo-harness changes the Worker. Each run
replaces the whole config and makes a new webhook secret.

## Before you run

The owner prepares these items. The command does not create them.

- A GitHub App that the owner owns. Permissions (read): Issues, Pull
  requests, Checks, Actions, Metadata. Events: Issues, Issue comment, Pull
  request, Pull request review, Pull request review comment, Check run,
  Workflow run. The command stops before any change when an event is
  missing.
- The App private key in a file outside every repository. The command reads
  it to sign one GitHub JWT and never copies it.
- `wrangler login` done for the Cloudflare account of the Worker.
- The Bot routine webhook URL and key (`docs/reference-configs/herdr-notify.md`,
  Bot routine webhook).
- The GitHub login that the orchestrator posts as. The Worker drops comments
  from that login. When the orchestrator and the workers post as the same
  login, the Worker drops the worker comments too. Give the orchestrator its
  own login.

## Run

```sh
repo-harness events install --app-id <id> --private-key <path> --orchestrator-login <login>
```

The command asks for the missing values (input is hidden). It lists three
steps and asks once. Each step needs the owner's approval:

1. Deploy the Worker to Cloudflare (production). It creates the queue and the
   KV namespace when they are missing.
2. Write the Worker secrets: the new webhook secret, the Bot webhook URL and
   key (credentials).
3. Set the App webhook URL and secret (repository permissions).

A Bot runs it after the owner approves the three steps in chat:
`--non-interactive --yes`, with `WEBHOOK_URL` and `WEBHOOK_KEY` in the
environment.

The output gives the Worker URL and the App installations. With no
installation, install the App on each repository from the printed link.

## Events

All events use `repo-harness.bot-event/v1` with `source: github` and the
repository name. `data` holds only numbers, URLs, the head SHA, the comment
header and the CI conclusion.

| `kind` | GitHub trigger | `data` |
|---|---|---|
| `issue.comment` | New issue comment whose first line is a protocol header from `templates.md`. Not from the orchestrator login | `number`, `url`, `header` |
| `issue.opened` | New issue | `number`, `url` |
| `issue.ci_repair` | New issue whose title starts with `[CI repair]` | `number`, `url` |
| `pr.review` | Submitted PR review | `number`, `url`, `head_sha` |
| `pr.review_thread` | First comment of a new review thread | `number`, `url`, `head_sha` |
| `pr.pushed` | PR push. Pushes to one PR within 60 s give one event for the last push | `number`, `url`, `head_sha` |
| `pr.merged`, `pr.closed` | PR closed | `number`, `url`, `head_sha` |
| `ci.pr` | `Required / CI` check run completed. Other jobs and runs in progress are dropped | `pull_requests`, `url`, `head_sha`, `conclusion` |
| `ci.main` | Workflow run from a push to the default branch completed | `branch`, `url`, `head_sha`, `conclusion` |

The Worker drops all other deliveries with HTTP 204. It sends each
`X-GitHub-Delivery` once.

## Verify

1. In the App settings, open **Advanced**, then **Recent Deliveries**. A
   delivery shows HTTP 200 (sent), 202 (PR push queued), or 204 (filtered).
2. Post a protocol comment, for example `repo-harness issue claim status`,
   from a login that is not the orchestrator login. The Bot receives
   `issue.comment`.
3. `wrangler tail repo-harness-github-events` shows Worker errors.

## Errors

| Delivery status | Cause | Action |
|---|---|---|
| 401 | The signature does not match the Worker secret. Deliveries between a new deploy and the App update also get 401 | Redeliver them from Recent Deliveries. When new deliveries also get 401, run install again |
| 500 | A Worker secret or the orchestrator login is missing | Run install again |
| 502 | The Bot webhook failed. The queue retries the event | Check the Bot routine webhook. Redeliver when the queue retries also fail |
| 400, 405, 413 | The request is not a GitHub delivery, or it is larger than 1 MiB | None for GitHub. Check the sender |

A command failure prints `GitHub events: <reason>`. A failure before the
three steps changes nothing. A `wrangler` failure stops before the App
update; the App keeps its old webhook config. Run install again after you fix
the cause.
