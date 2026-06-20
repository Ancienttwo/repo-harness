# repo-harness ChatGPT MCP Connector Setup

## Prerequisites

- A repo-harness adopted repository.
- A local `repo-harness` CLI on PATH.
- ChatGPT workspace access to Developer Mode and custom MCP Connectors.
- A stable public HTTPS `/mcp` endpoint for recurring ChatGPT Connector use. Local Codex can use stdio without a tunnel.

## Start Local MCP Server

Repo-local setup keeps MCP reads scoped to one adopted repository:

```bash
repo-harness mcp serve --repo . --transport http --host 127.0.0.1 --port 8765 --profile planner
```

Developer Mode can also be configured at OS user level when the user explicitly
authorizes broad local file reads. This stores MCP config and auth under
`~/.repo-harness/` and allows read tools to inspect any file the OS user can read:

```bash
repo-harness mcp setup chatgpt --scope user --repo / --allow-full-disk-read --endpoint <https-url>/mcp
repo-harness mcp serve --repo / --transport http --host 127.0.0.1 --port 8765 --profile planner
```

In user-scope mode, ChatGPT should first call `discover_harness_repos` to find
adopted repositories, then pass the selected `repoRoot` as `repo_path` to
`harness_status`, `latest_handoff`, `latest_checks`, and other read tools. Read
tools without `repo_path` report the configured server root; they do not
auto-select a discovered repo.

Health check:

```bash
curl http://127.0.0.1:8765/health
```

The ChatGPT path uses OAuth with a local passphrase. The passphrase is stored in an ignored local file:

```bash
jq -r .passphrase .repo-harness/mcp.oauth.json
```

For user-scope setup, read the passphrase from `~/.repo-harness/mcp.oauth.json`.

Do not commit or paste this passphrase into issue trackers, PRs, or shared logs.

OAuth discovery smoke:

```bash
curl http://127.0.0.1:8765/.well-known/oauth-protected-resource/mcp
```

## Choose Tunnel Endpoint

For recurring ChatGPT Connector use, prefer a stable hostname from a named tunnel or reserved domain. Quick tunnels are useful for one-off smoke tests, but their URL changes and ChatGPT will treat the new URL as a different Connector app.

Stable Cloudflare named tunnel shape:

```bash
cloudflared tunnel login
cloudflared tunnel create repo-harness-mcp
cloudflared tunnel route dns repo-harness-mcp repo-harness-mcp.example.com
cloudflared tunnel run --url http://127.0.0.1:8765 repo-harness-mcp
```

Then regenerate this guide with the stable endpoint:

```bash
repo-harness mcp setup chatgpt --repo . --endpoint <https-url>/mcp
```

The endpoint is stored in ignored local config. The tracked guide stays placeholder-only so real operator domains do not enter source control.

One-off quick tunnel smoke:

```bash
cloudflared tunnel --url http://127.0.0.1:8765
```

Use this Connector URL:

```text
<https-tunnel-url>/mcp
```

## Create ChatGPT Connector

1. Open ChatGPT Settings.
2. Enable Developer Mode if your workspace exposes it.
3. Go to Connectors.
4. Create a Connector using the server name recorded in `.repo-harness/mcp.local.json` under `chatgpt.serverName` (new setup records the default `repo-harness` unless `--server-name` is provided).
5. Paste the HTTPS Connector URL ending in `/mcp`.
6. Configure Connector authentication as OAuth.
7. Click Scan Tools.
8. When the authorization page opens, enter the passphrase from `.repo-harness/mcp.oauth.json`.
9. Wait for the tool scan to finish, then create the Connector.
10. Keep write confirmations enabled.

If `repo-harness mcp doctor --repo . --json` reports `chatgpt.serverNameConfigured:false`, rerun setup with `--server-name <connector-name>` before using GPT Pro MCP read-back prompts.

## Human Workflow

Use ChatGPT for planning and review. Use Codex for local execution.

1. Ask ChatGPT to inspect workflow state with read-only tools first.
2. Ask ChatGPT to turn the idea into a PRD with `write_prd_from_idea`.
3. Ask ChatGPT to turn the PRD into a checklist Sprint with `write_checklist_sprint`.
4. Ask ChatGPT to prepare a Codex Goal with `prepare_codex_goal_from_sprint`.
5. Open Codex locally and run the generated `/goal` prompt.
6. Let Codex execute one Sprint task card at a time, run checks, update the checklist, and stage each completed phase before continuing.

The sidecar is not a remote coding agent. It prepares workflow artifacts for the local agent host.

## Dev Mode Agent Runner

The default planner Connector does not run Codex or Claude. If you intentionally want ChatGPT to trigger a local agent from MCP, use the `orchestrator` profile and enable the dev runner setting yourself.

Local config setting:

```json
{
  "devMode": {
    "agentRunner": true,
    "allowedAgents": ["codex"],
    "timeoutMs": 120000
  }
}
```

Equivalent one-shot launch:

```bash
repo-harness mcp serve --repo . --transport http --host 127.0.0.1 --port 8765 --profile orchestrator --enable-dev-runner --dev-runner-agents codex
```

Environment override:

```bash
REPO_HARNESS_MCP_DEV_RUNNER=1 REPO_HARNESS_MCP_DEV_RUNNER_AGENTS=codex,claude repo-harness mcp serve --repo . --transport http --profile orchestrator
```

When enabled, the server exposes `run_agent_goal`. The tool reads only `.ai/harness/handoff/codex-goal.md` and runs that fixed handoff through the allowed local CLI:

```text
codex exec --json --cd <repo> <goal>
claude -p <goal>
```

Keep this behind local Developer Mode and per-call confirmations. Do not expose an orchestrator tunnel to untrusted users.

## Agent Handoff Contract

The agent-facing Skill is installed at:

```text
.agents/skills/repo-harness-chatgpt-bridge/SKILL.md
```

Use it in Codex when continuing a ChatGPT-generated handoff:

```text
Use repo-harness-chatgpt-bridge.
Execute .ai/harness/handoff/codex-goal.md.
```

The Skill tells Codex to read the PRD and checklist Sprint, preserve stage gates, run focused checks, and stage each completed phase. It does not authorize ChatGPT to edit source code or run shell commands through MCP.

## Tool Chain

Expected planning chain:

```text
idea
  -> write_prd_from_idea
  -> write_checklist_sprint
  -> prepare_codex_goal_from_sprint
  -> local Codex /goal execution
```

Local fallback for the last handoff step:

```bash
repo-harness mcp prepare-goal --repo . --prd plans/prds/<feature>.prd.md --sprint plans/sprints/<feature>.sprint.md --reference-repo <optional-readonly-reference>
```

## Test Prompt

When testing through `repo-harness-gptpro`, pass the configured Connector name
as an explicit browser app selector instead of relying on prompt text:

```bash
serverName="$(repo-harness mcp doctor --repo . --json | jq -r '.chatgpt.serverName // empty')"
repo-harness chatgpt browser-consult --repo . --provider oracle --chatgpt-app "$serverName" --prompt "Call harness_doctor and report MCP Read Evidence."
```

If the selected Oracle binary does not support app preselection yet,
repo-harness fails before prompt submission with `ORACLE_APP_PRESELECT_UNSUPPORTED`.
In that case, manually select the Connector from ChatGPT's composer `+` menu or
upgrade/pin an Oracle binary with `--browser-app` support before treating the
run as MCP read-back evidence.

```text
Use repo-harness to inspect my local development repos. First call discover_harness_repos. Pick the repoRoot that matches the user's target, then call harness_status, latest_handoff, and list_workflow_files with repo_path set to that repoRoot. Do not write files.
```

ChatGPT can only call tools present in the Connector schema it scanned. Selecting
the app in the composer exposes that scanned schema to the conversation; it does
not force ChatGPT to refresh the server's current `tools/list`. After adding a
tool or changing the sidecar scope, restart `repo-harness mcp serve`, verify the
local `/mcp` `tools/list`, then open the ChatGPT Connector settings and run
**Scan Tools** again. If ChatGPT says the app is selected but a tool is
unavailable while local `tools/list` includes it, the ChatGPT Connector schema is
stale.

## Connector Invocation Evidence

Treat Connector readiness as four independent checks:

1. Endpoint: the sidecar and public HTTPS `/mcp` endpoint respond.
2. Schema: ChatGPT Connector settings show the expected Action after Refresh.
3. Selection: a fresh chat has the recorded Connector selected from `+` -> More.
4. Invocation: the current model surface emits a real tool call.

Only a visible `Called tool` event with the selected Action/result, or an
equivalent captured tool-call transcript, proves MCP invocation. Connector
selection, assistant self-report, plausible JSON, or sandbox shell commands do
not prove that ChatGPT called MCP.

For Pro runs, the normal tool-call runtime UI may not appear the way it does for
other models because Pro uses a sandbox/process flow. In the visible ChatGPT Web
UI, click the assistant's `Thinking` / `Thought for ...` disclosure to open the
right-side process pane. Use that pane to confirm whether Pro actually emitted a
`Called tool` event for the selected app, which action it chose, or whether it
only reasoned inside the sandbox without invoking MCP. If the pane shows
sandbox-only exploration, or the answer reports `app_unavailable` without a tool
event, classify the outcome as `surface_blocked`, not as a broken repo or
sidecar.

Detailed Pro Extended planning and review tasks commonly take 15 minutes or
more. When driving Pro through the browser path, do not treat elapsed time as
failure while the session is still alive; wait for a final answer or a concrete
browser, login, capture, or tool-call failure. Keep the Oracle heartbeat enabled;
heartbeat diagnostics such as `no thinking status detected yet` are progress
signals, not blockers by themselves.

Outcome labels:

- `invocation_verified`: real `Called tool` event or captured tool-call transcript.
- `approval_pending`: a real tool request produced a confirmation prompt.
- `surface_blocked`: schema is current, but the current model surface did not call MCP.
- `bundle_fallback`: Pro is reviewing a local evidence bundle and did not read through MCP.

When Pro is `surface_blocked`, use `repo-harness-gptpro` to send a bounded local
evidence bundle through the existing Oracle/browser handoff. The bundle must say
it was produced locally, list included and omitted/truncated material, and
include:

```yaml
source: local_repo_harness_bundle
pro_invoked_mcp: false
working_tree: clean | dirty
```

Do not claim MCP read-back evidence for fallback output. Pro can plan or review
the supplied bundle, while Codex still executes and verifies locally.

Permission scope is separate from invocation evidence. Repo-scope setup is bound
to the configured repo and does not imply arbitrary repo discovery. User-scope
setup with explicit full-disk read is required before broad repo discovery is
authorized.

## PRD Prompt

```text
Use repo-harness to inspect docs/spec.md, tasks/current.md, latest handoff, and existing plans. Convert this idea into a PRD with write_prd_from_idea. Do not edit source code.
```

## Checklist Sprint Prompt

```text
Use repo-harness to read the PRD. Convert it into an ordered checklist Sprint with write_checklist_sprint. Every task card must include a stage gate that requires Codex to stage the completed phase before continuing.
```

## Codex Goal Prompt

```text
Use repo-harness prepare_codex_goal_from_sprint with the PRD path and checklist Sprint path. Return the host-native /goal prompt. Do not run Codex remotely.
```

Equivalent local CLI:

```bash
repo-harness mcp prepare-goal --repo . --prd plans/prds/<feature>.prd.md --sprint plans/sprints/<feature>.sprint.md --reference-repo <optional-readonly-reference>
```

## Codex Executor Prompt

```text
Use repo-harness-chatgpt-bridge. Execute the latest ChatGPT-generated Codex goal from .ai/harness/handoff/codex-goal.md.
```

## Troubleshooting

- If ChatGPT cannot connect, verify the tunnel URL is HTTPS and ends in `/mcp`.
- If ChatGPT returns unauthorized, verify OAuth discovery works and re-run the authorization passphrase flow.
- If tools are missing in ChatGPT but present in local `tools/list`, restart `repo-harness mcp serve`, then run **Scan Tools** in the ChatGPT Connector settings so ChatGPT refreshes its cached schema.
- If writes fail, verify the target path is a PRD, sprint, plan, or approved handoff file.
- If ChatGPT generated prose instead of checklist Sprint task cards, ask it to use write_checklist_sprint.
- If Codex cannot see the server, run `repo-harness mcp setup codex --repo . --scope project`.

## Security Notes

- This MCP server exposes workflow artifacts, not general filesystem access.
- The `/mcp` endpoint requires OAuth-issued Bearer tokens by default. Do not expose it through a tunnel without Connector auth configured.
- `repo-harness mcp serve --auth bearer` is available for non-ChatGPT clients that can send a static bearer token.
- Planner profile cannot write application source files, package manifests, lockfiles, CI config, secrets, or files outside the repo root.
- MCP does not expose a default Codex runner. It prepares `.ai/harness/handoff/codex-goal.md`; the local Codex host owns `/goal` execution unless the user explicitly enables the local orchestrator dev runner.
- The orchestrator dev runner is local-only, opt-in, timeout-bounded, audited, and limited to the fixed Codex goal handoff. It is not arbitrary shell.
- Keep `_ref/` read-only when used as a comparison source.
- Do not put tunnel tokens, OAuth tokens, passphrases, or ChatGPT/Codex credentials in git.
