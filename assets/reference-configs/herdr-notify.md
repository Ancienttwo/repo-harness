# Herdr dispatch and notify

`repo-harness herdr`, `events`, and `review round|status|close|cancel` need
`peer-runtime` in the recorded plugin set. Their help stays open. An absent
plugin exits 1 with empty stdout and `install_plugin_unavailable` before any
prompt, credential read or process start. Run the printed repair: for `all`,
`repo-harness update`; for an explicit list, add `peer-runtime` with
`repo-harness install --plugins <your plugins>,peer-runtime`. No migration runs.
The plugin is available on every target; its portal skill installs on Claude
only. `hc`, the Herdr skill, fleet files, worktree closeout and doctor stay in
core. The hidden Operator cleanup-investigation job also needs `peer-runtime`;
the server records `host_failed` when the guard refuses that child.

## Herdr Dispatch

- Claude, Codex and Pi peers run in herdr-core terminals that Herdr.app shows as panes. Start them with `herdr-app do` and talk to them with `hc` ([Runtime commands](#runtime-commands)). Receipt-bearing acceptance uses `repo-harness review round`; its OAR host runs the reviewer. Select Pi with `--harness pi`. Never call a vendor CLI directly for acceptance.
- Pi review uses an OAR RPC subprocess under Seatbelt. Its private agent directory links native model configuration and credentials for read-only access. An owner-written mode-0600 `settings.json` contains only native `defaultProvider`, `defaultModel` and `defaultThinkingLevel`; packages, proxy and trust policy are excluded. User extensions, skills, context files, prompt templates and MCP are disabled. The Pi reviewer uses the user's Pi default model. The Receipt's `actual_model` records OAR's actual `provider/model`. A null actual model records `model_relation: unknown` and grants no cross-model claim. A non-string or blank model fails with `review_actual_model_unverified`.
- A cross-model review means Receipt `model_relation: different-family`. The OAR host records the reviewer model and the model of each ended turn of the one author task session bound to the caller pane, campaign and reviewed root. One closed family table in `src/core/review/acceptance-receipt.ts` compares vendor families, not routing providers. Harness kind does not prove a model difference. A shared family is `same-family`. A missing author binding, an unobserved or running turn, a Claude turn (its model is not observed) or a model outside the table is `unknown`. Interactive authors are not OAR-observed, so they give `unknown` and a High-tier cross-model review stays a manual Herdr peer review. The review runtime records identity; it adds no cross-model gate.
- Exception: in the Claude desktop app, operator-attended acceptance review can use `repo-harness review round --launch app-terminal`. The CLI prints the fixed OAR host command. Claude runs that exact command once in an app Terminal tab, then repeats the same round. The same OAR host, Seatbelt profile and Receipt apply.
- Send the root tests-and-implementation review to the other model through Herdr when it is available. Otherwise, run that read-only review in a separate same-model pane.

### Issue-flow topology

This topology applies to issue-flow work (`repo-harness-issue-flow`) on herdr-core (`hc` with Herdr.app).

- Pane layout: put at most 3 panes side by side in one tab. Do not stack panes vertically. When the tab is full, open a new tab.
- Tab 1 holds two panes: the orchestrator on the left and its advisor on the right. Tab 1 may take one worker as its third pane.
- The orchestrator holds the issue-flow coordinator and integrator seats. It only dispatches, accepts and merges. It does not implement a child issue.
- The advisor serves only the orchestrator. It does research and writes proposals. It may edit files for its proposals. It does not commit or write to GitHub. It collects evidence through the sub-agents of its seat (`seats.advisor.fleet`) and keeps judgment, synthesis and the proposal. The orchestrator asks it for a board replan by [Replan](https://github.com/aimpact-inc/repo-harness/blob/main/assets/skills/repo-harness-issue-flow/references/replan.md).
- Owner decisions and seat authority (owner, 2026-11-09, #2008): the root `CLAUDE.md` and `AGENTS.md` hold the life-cycle rules and the owner list. The orchestrator dispatches an owner-approved batch plan in order, merges by rule 2 at every tier and runs fix rounds up to round 5 by rule 1. A seat that receives an owner decision in its pane posts it on the issue or PR; that comment authorizes the other seats. A seat message carries pointers, not content: it names the issue, the PR, the comment URL or the sha, and the content lives in GitHub. The message still wakes the receiving seat; it does not replace the record. The advisor sends the orchestrator only a mismatch between a seat report and the GitHub state, not a confirmation. A comment is a record: a local seat writes it, and a locally run command may read it as data; it never starts an action. The orchestrator and the advisor make a non-security decision together when both agree, and the orchestrator posts it first as `Joint decision (orchestrator + advisor)` with the reason. The advisor makes no GitHub write. A "stop" or "no" comment from any participant, the owner account included, is a reference that the orchestrator and the advisor weigh by joint decision.
- One PR has one pane and one worker agent. Each further worker gets its own pane, as the right split of a tab that is not full or in a new tab. The worker may use the agent-fleet sub-agents (`agents/fleet/`) inside its own pane.
- Recommended models for a Claude-only setup: the orchestrator runs Opus at high effort, and the advisor runs Fable at high effort. This is a recommendation, not a requirement. No seat requires a specific model (issue-flow D7).
- Cleanup: after a PR merges, the orchestrator runs `repo-harness board closeout --pr <n>` in the primary checkout. It first proves the merge and the worktree: merge commit in the fetched `origin/main`, PR head worktree at the PR head sha, not locked, clean, and no owner marker but its own. A missing proof stops before any pane closes. It then closes each seat terminal bound to the PR (its `pr` label, or the `issue` label of a closing issue in this repository, or a cwd in the PR head worktree on the PR head branch when the seat has an `issue` label that the PR body names after `Refs`; a cwd in the primary checkout never binds; a binding without the PR's `pr` label next to another PR's `pr` label is a conflict) whose checkout belongs to this repository, is clean and has no commit outside `origin/<branch>`. When every bound pane is closed and no process runs in the worktree, it removes the worktree and the local branch through the exact closeout path of `contract-worktree cleanup`, which drops only the worktree's own active-worktree marker. A dirty, unpushed, conflicting, locked, other-owner or unmerged pane or worktree stays; the JSON names the reason, and the board rule A9 reports each live seat of a merged PR. The remote branch is left to GitHub.
- Before a worker reports DONE, it stops the background programs it started (a dev server, a daemon started with `nohup` or `setsid`). On Linux and macOS, herdr-core 0.1.19 keeps a deliberately detached program running after its terminal closes, and Windows ends it.

### Runtime commands

Use `hc` for terminals and `herdr-app do` for tabs and panes. In an hc terminal, `HC_TERMINAL_ID` is your address. `hc --help` and `herdr-app commands` are the syntax authority.

Find every live seat of the repository with `repo-harness board seats --json`, including seats without a parent issue. Wait with `hc wait <t>` or follow `hc events`. Never use `sleep` loops to wait for seats.

Commands for the topology steps:

| Step | Command |
|---|---|
| Start the orchestrator | `herdr-app do tab.new --name "$(repo-harness seats argv orchestrator --repository-id <repository-id> --json \| jq -r .tab)" --space <id> --folder <repository> --argv "$(repo-harness seats argv orchestrator --repository-id <repository-id>)"` |
| New worker tab | `herdr-app do tab.new --name "$(repo-harness seats argv worker --repository-id <repository-id> --parent <n> --issue <n> --json \| jq -r .tab)" --space <id> --folder <worktree> --argv "$(repo-harness seats argv worker --repository-id <repository-id> --parent <n> --issue <n>)" --task <packet>` |
| Start the advisor | `herdr-app do pane.split --direction right --pane <orchestrator pane> --argv "$(repo-harness seats argv advisor --repository-id <repository-id>)"` |
| Second worker in a tab | `herdr-app do pane.split --direction right --pane <pane> --argv "$(repo-harness seats argv worker --repository-id <repository-id> --parent <n> --issue <n>)"` |
| Message a worker | `hc send <t> <comment URL>` |
| Read a worker | `hc read <t>` |
| Wait for a worker | `hc wait <t>` |
| Close a worker pane | `herdr-app do pane.close --pane <pane>` |

The board of a parent selects a worker, gatekeeper or reviewer seat by its `issue` label (an item of the parent) or its `pr` label (a pull request of the board). `--parent` is optional for that. It names the worker tab `#<n>` (`other` without it), so the worker rows keep it.

A Codex worker seat in a linked contract worktree edits files and runs checks only. It runs no `git fetch`, `git commit` or `git push`. Its last message gives the commit subject and body, the PR title and body, and the check results. The orchestrator commits the worktree diff with that message and explicit paths only, pushes the branch and opens the PR. The orchestrator is the head owner of record and pushes each fix round; no other agent pushes to that PR. The Codex seat remains the content author and answers review threads through the orchestrator. A seat with the `net` tool group can use the network. A writable Codex seat with `net` can reach loopback services, including the Operator console and herdr-core socket (#1961).

`repo-harness seats argv <seat>` prints the argv of the seat from the `seats` section of `~/.repo-harness/config.json`, or from the seat defaults when the section is absent. The argv holds the model, the effort, the tool limits and the seat brief. Its stderr names the source and each limit. A limit marked `instructions_only` is written into the launch instructions only; the host does not enforce it. Without `--argv`, the pane opens a shell.

Before each dispatch wave, run `repo-harness quota`. Launch each task with `repo-harness seats argv <seat>` on the seat that its route line names. State the task boundary in the packet. `--json` keeps the account report unchanged.

| Seat | Default runtime, model and effort |
|---|---|
| `worker` | Codex, `gpt-6.1-terra`, high |
| `worker-deep` | Codex, `gpt-6.1-sol`, high |
| `worker-important` | Claude, `opus`, medium |
| `worker-important-fast` | Claude, `sonnet`, medium |
| `worker-light` | Pi, `magpie/cursor/deepseek-v41-flash-1017`, no effort and no account; worker tool groups; no fleet. A Pi seat on `magpie/codex/<model>` ("pi-gpt") is a user-selected alternative to a Codex seat: it runs the same GPT models, takes an effort (`--thinking`) and counts against the `chatgpt` account |
| `gatekeeper` | Codex, `gpt-6.1-terra`, high; read, shell and network |
| `gatekeeper-fallback` | `null` (not configured); when configured, the gatekeeper ranges: read, shell and network, no fleet |
| `reviewer` | Claude, `opus`, high; read, shell and network |

All worker seats use worker briefs, labels and pane names. `gatekeeper` and `reviewer` need `--pr <n>`; their pane names are `<prefix>-gk-<pr>` and `<prefix>-rv-<pr>`. They report a read-only verdict first and do not edit, commit, push or write to GitHub.

`gatekeeper-fallback` is optional and is no launch target: `seats argv gatekeeper-fallback` returns `seat_unknown`. While the gatekeeper account is exhausted and the fallback account is not, the route line names the fallback, for example `gatekeeper: gatekeeper-fallback (pi magpie/cursor/deepseek-v41-flash-1017; gatekeeper: chatgpt exhausted)`, and `seats argv gatekeeper --pr <n>` prints the fallback argv with the gatekeeper label, pane name and brief. A tight, unknown or reserved gatekeeper keeps its own rule; with no usable fallback the line stays `gatekeeper: none (...)`. `repo-harness board review` starts a gatekeeper only when this effective gatekeeper has a known model family, and not `anthropic` when the head needs a non-Claude gatekeeper. Its family must differ from the writer's only where it gives the different-family row: a Medium head, or a High head that needs no Claude review. A High head with a Claude review may use a gatekeeper of the writer's family; else it skips the PR with `review_family_unavailable` and the route line. A stored section without the key needs `repo-harness update`, which sets it to `null`.

On Pi, review seats pass `--exclude-tools edit,write`. Direct edit/write tools are off. The edit limit is `common_commands` because the shell stays available; shell writes remain prohibited by the brief. Codex review seats use the read-only sandbox.

`seats.routing` holds ordered lists for `important_deep`, `important_fast`, `simple_deep`, `simple_fast` and `frontend`. Lists are non-empty and distinct. The first four accept configured worker seats only; a list cannot name a null seat. `frontend` accepts only `worker-important` and `worker-important-fast`, and both must run Claude when selected in that list. Defaults are `[worker-important, worker-deep]`, `[worker-important-fast, worker]`, `[worker-deep, worker-important]`, `[worker]` and `[worker-important, worker-important-fast]`, in that order. `worker-light` defaults to the Pi seat above. A stored `null` stays null during migration; its argv returns `seat_not_configured`. Each configured seat must use an enabled runtime when saved. The default Pi seat prevents a Seats page save until Pi is enabled or `worker-light` is set to `null`.

Routing selects the first eligible seat with a known account state, or a Pi seat without an account (the DeepSeek `worker-light`). A Pi seat on `magpie/codex/` has the `chatgpt` account. It selects an unknown account only when no such seat is eligible. Exhausted accounts are excluded; only the explicit `--spend-credits` of `repo-harness quota` and `repo-harness seats argv` admits a ChatGPT account that still has credits, and only while an owner authorization for credits is recorded. Claude in saving mode or exhausted stays reserved for the advisor and orchestrator. Important non-frontend work then uses a configured Pi `worker-light`; a null or non-Pi seat gives a `none` route. Frontend waits for Claude. `tight` is a display state only. When Claude is reserved, the explorer line uses `routing.low_quota_explorer` (default `haiku` high). Pass its model when you call the explorer. Otherwise the line says `default`.

`routing.claude_saving_below_remaining` defaults to 20. Claude saving mode applies when weekly remaining quota is below that percent; otherwise its mode is normal. `routing.codex_hyper_at_or_above_remaining` defaults to 50. Codex hyper mode applies when weekly remaining quota is at or above that percent; otherwise its mode is normal. A missing weekly reading gives an unknown mode. Modes are derived, never stored. Codex hyper uses the code constant `gpt-6-astra` high for Codex seats. Reserved Claude advisor and orchestrator seats use `opus` high. There is no Codex advisor fallback. A Pi seat on `magpie/codex/` gets the Codex hyper model as `magpie/codex/gpt-6-astra` with the hyper effort. Other Pi seats, tools, fleet and class lists stay as configured. An absent seats section uses defaults. Run `repo-harness update` for the one-shot migration of stored sections. The decoder refuses old keys before and after migration; a POST writes the full section.

With `--repository-id`, the argv labels its own terminal before the agent starts: it runs `repo-harness seats label`, which sets the seat labels on `HC_TERMINAL_ID`, and then starts the agent. The board finds seats only by these labels; a terminal without them leaves the execution axis `unavailable` (`no_seat_terminals`). When the label fails, the agent does not start and the terminal shows the error. Each start prints the new `terminal`. `<repository-id>` is the GitHub numeric repository id (`gh api repos/<owner>/<repo> --jq .id`). Leave out `--issue` and `--pr` for the orchestrator and the advisor.

### Seat reset

A Claude orchestrator or advisor seat resets through a handoff before auto-compaction (#1972). Opus auto-compaction started at 461k-467k context tokens on Max. With `--repository-id`, `seats argv` sets `REPO_HARNESS_SEAT` and `REPO_HARNESS_SEAT_REPOSITORY` in the env of these two seats. Only that env names the seat for the Stop hook. Worker seats do not reset.

1. When the context of the last assistant entry of the transcript is 380,000 tokens or more, the Stop hook blocks the stop once per session segment. A segment ends when the SessionStart hook records a new session (`startup`, `clear` or `compact`): a request is open while no `session.json` record is newer than it. The hook is the one authority for the action (#2625). A transcript file below 32 MiB gives `compact`; 32 MiB or more gives `reset`. It records the request time, the transcript path, the `action` and the `transcript_bytes` in `/tmp/repo-harness-seats/<repository-id>/<seat>/request.json`, and the block reason names the action. `/compact` keeps the transcript file, so it grows by 3.4-4.7 MB per cycle; the bound gives 6 to 9 compactions before a `/clear` starts a new file.
2. The seat finishes the planning and the dispatch that it has in hand and starts nothing new; this is not a hard stop (joint decision on #2625, owner word 2026-11-12). Then it writes `/tmp/repo-harness-seats/<repository-id>/<seat>/handoff.md` with the fixed sections that the block reason gives: role, hard rules, current state, in progress, owner decisions pending, next actions and the resume checklist. It sends `RESET-REQUEST <path> <sha256>` to the peer seat.
3. The peer runs `repo-harness seats reset <path> <sha256>` in the background; one run can take about 10 minutes. The command finds the requester by the `repo-harness.seat` and `repo-harness.repository` labels. When the handoff is not newer than the request, its sha256 is different, or a section is missing, it sends `REWRITE` to the requester and resets nothing. Otherwise it waits with `hc wait` and types the recorded action: `/compact` for `compact`, `/clear` for `reset`. It does not measure the transcript again. One validator reads the request for the Stop hook and for `seats reset`. A request without a valid time or `action` (for example from the old code), or a file that is not a JSON object (for example `null`), is not open for the Stop hook. `seats reset` types nothing for it: after the peer and requester checks it sends `NO-RESET` (`request_invalid`), and the next crossing writes a fresh request. A missing request is `request_missing` and sends nothing. After the claim, a `session.json` record newer than the request (an auto-compaction or another reset) means a new segment: the command types nothing and sends `NO-RESET` (`request_closed`). The SessionStart hook writes `session.json` next to the handoff. After `/clear` the command sends the resume prompt only after that file names a new transcript (budget 60 s). After `/compact` it waits for a `compact` record of the same transcript (budget 300 s: a compaction took 71 s median and 237 s max). The resume prompt asks for `RESUMED` first. The resume evidence is an assistant Bash tool call in the transcript, after the user entry that holds the prompt, whose command is exactly the one simple command `hc send <peer> RESUMED` (the message bare or in plain quotes), and then its tool result without an error. A compound command, another address and a command that only prints the text are no evidence. Only the bytes appended after the prompt send are read.
4. The requester reads the handoff and sends `RESUMED` to the peer. After `/clear` it then checks the current state with git and gh and continues. After `/compact` it continues: the compaction summary holds the live state.

Protocol rules. The reset runs with no human step; an owner command is never part of it (owner decision 2026-11-08):

- One reset at a time. When both seats cross the threshold, the advisor resets first.
- The peer sends no other message to the requester from `RESET-REQUEST` until `RESUMED`.
- Handoff check fails: the peer asks for a rewrite, at most 3 times. Then no reset: the seat continues, and Claude Code auto-compaction handles its context.
- Peer seat missing or not answering: no reset, same as above.
- No new-session signal after `/clear`: `/clear` is typed again. No signal after `/compact`: no second `/compact`; one log entry and one notice, the seat continues, and auto-compaction stays as the net. No answer to the resume prompt (no `RESUMED` send): the prompt is sent again. One attempt and at most 3 retries in total, then the other seat starts the requester again in the same terminal from `repo-harness seats argv <seat> --repository-id <id>` and sends the resume prompt with the git and gh check. The restart is a new process with no compaction summary.
- Each of these failures writes one entry to a reset log next to the handoff and sends one notice. The flow does not wait for anyone to read it.

`seats reset` runs these rules. It types `/compact`, `/clear`, `/exit` and the relaunch line (`sh <reset dir>/relaunch.sh`) with `hc keys`: `hc send` wraps its text in an envelope, so Claude reads a sent slash command as chat text. The reset log `reset-log.jsonl` is the only record of the rewrite and resend counts across runs; one run also stops after one attempt and 3 retries when the log cannot be written. Before the first typed command, a run claims the request with an exclusive create of `claim-<requested_at digits>` next to the handoff. A second run for the same request, also after an uncertain first run, sends nothing (`already_claimed`); a claim that cannot be created types nothing (`claim_failed`). A completed reset adds a `reset` entry with the detail `compacted`, `cleared` or `relaunched`. Each failure first appends its log entry, then posts one `seat.reset_failed` bot event to the notify channels; the run waits at most 5 s in total for the notices at its end. A log entry that cannot be written is reported in the result as `logErrors`. Without a notify config, the log entry records `not_configured`. A handoff path that is not `/tmp/repo-harness-seats/<repository-id>/<seat>/handoff.md` names no seat, so it gives only the command error, with no log entry and no notice.

### Pane and tab names

With `--repository-id`, `seats argv` also prints the pane name (`name`) and the base tab name (`tab`). Do not type a name.

`herdr-app do tab.new` and `pane.split` set no terminal name: the `--name` of `tab.new` is the tab name, and `pane.split` takes no name. So a seat terminal started by the launch rows has no hc name. Only a Claude seat carries the pane name, as its session name (`-n`) in the argv. A Codex seat has no session-name flag and carries no name. Find a seat terminal with `repo-harness board seats --json`, which reads its labels.

The pane name is `<prefix>-<role>[-<item>][-<qualifier>]`: at most 32 characters of `a-z 0-9 -`. Examples: `rh-orch`, `rh-adv`, `rh-w-1508`, `rh-w-rel0252`, `rh-rv-1536-codex`, `aip-w-485-device`.

| Part | Values | Source |
|---|---|---|
| `prefix` | 2-6 characters, `[a-z][a-z0-9]{1,5}`, one per registered repository, unique on the machine | `panePrefix` of the repository entry in `~/.repo-harness/registered-repos.json` |
| `role` | `orch`, `adv`, `w`, `gk`, `rv` | the seat |
| `item` | worker: the issue number (`--issue`) or `rel<digits>` for release prep (`--release`); reviewer: the PR number. None for `orch` and `adv` | the dispatch |
| `qualifier` | worker: a slice word when one issue has two live worker panes (`--qualifier`); reviewer: the review runtime id (`claude`, `codex`) | the dispatch |

- Set `panePrefix` with `repo-harness seats prefix --repo <path> --pane-prefix <p>`. Every registry writer keeps it. The registry read refuses a malformed or duplicate prefix.
- `seats argv` reads the entry of the primary checkout of the current directory; a linked worktree resolves to its primary checkout. No entry, or an entry without `panePrefix`, fails with `pane_name_invalid`. A name over 32 characters fails the same way.
- One pane serves one item. Do not reuse a pane for another issue: close it and start a new one. Only `hc run --name` sets an hc terminal name, and hc refuses a second live terminal with that name.
- The name carries no state (round, status, PR state). The board reads those from GitHub and the labels.
- Reserved names stay as they are: `rh-notify-relay` and `task-<uuid20>`.

| Tab | Holds | Name |
|---|---|---|
| Tab 1 | the orchestrator (left), the advisor (right), one optional worker | `orch` |
| Worker tab | up to 3 worker panes whose issues have the same parent | `#<parent>` |
| Worker tab, no parent | up to 3 worker panes of issues without a parent | `other` |
| Review tab | up to 3 reviewer panes | `review` |

A new pane goes into the first tab of its kind with fewer than 3 panes. When every tab of that kind is full, add ` 2`, ` 3` to the base name, for example `#1000 2`. A tab closes with its last pane. The space name stays the repository name.

### Test and Review Rules

- A writer runs `bun run check:type`, `bun run check:helpers` and at most 3 test files that own the change. `Required / CI` on the head is the affected-gate evidence.
- `bash scripts/check-ci.sh <lane>` on the host only reproduces a CI failure.
- A reviewer runs no test that CI passed.
- The full suite runs in the daily run and for a release.
- Test commands take the host test queue themselves: `bash scripts/check-ci.sh <lane>`, `bun run test:files` and the `test:*` suites wait their turn, run alone and release. Release checks go first, then FIFO. Do not wait for a coordinator message to start them. `bun scripts/host-test-queue.ts status` shows the holder and the waiters.
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
The relay child runs `repo-harness herdr notify relay`, a `peer-runtime` command. Its plugin gate reads the recorded selection under the `HOME` of the hc core, not under `--home`. Select `peer-runtime` for that `HOME` too. Otherwise the relay exits 1 with `install_plugin_unavailable`.
When a live relay terminal already exists, install starts no second one.
The relay reads the config again on each event, so a new config takes effect without a restart.
Each read applies the install rules: HTTPS URLs without user information, a Bot URL and key, a complete Telegram target and done flags of `0` or `1`. An invalid config sends nothing, and the relay screen names the broken rule without its value.
Last, the command writes `~/.repo-harness/herdr/notify-install.json` with file mode `600`. It names the relay terminal and its label.
The operator console finds the relay only through that record and reads it on each collection.
Without the record, the console shows `notify_session_missing`. A record that names a session in place of a relay terminal is refused as `notify_session_invalid`. Run install once to write a new record.
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
A turn is sent at most once per channel: a successful channel does not send the same terminal, hc turn and state again.
The next hc turn is a new notice and is sent at once.
A failed channel can retry on the next event of the same turn.
There is no background retry queue.

The relay writes the newest result of each channel, and the result of the newest event, to `~/.repo-harness/herdr/notify-deliveries.json` with file mode `600`.
The operator console reads each channel's result from that record. A failed channel does not change the result of another channel.
The relay terminal screen shows one line per attempt, for example `[notify-relay] SLACK: HTTP 200`. Read it with `hc read rh-notify-relay`.
Slack, Discord, and Telegram messages end with the same repository name, task, and request id when known.
HTTP success shows that the endpoint accepted a request.
Check the Bot routine or human channel to confirm receipt.

The relay does not restart itself. When the relay terminal ends, the operator console and `repo-harness doctor` show `relay_stopped`.
Each hc call starts a stopped hc core, and the console status read is an hc call. After the hc core stops, the next status read starts a new core without the relay, so the console shows `relay_stopped`, not `hc_unavailable`.
`hc_unavailable` means that hc did not answer in time. Start a new relay with the written config:

```bash
repo-harness herdr notify start
```

`start` starts nothing when a relay is live. Without a config it stops and names the install command.
`repo-harness herdr notify uninstall` stops a live relay and removes every relay terminal, also finished ones, then the notify files.
