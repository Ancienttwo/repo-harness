# repo-harness ChatGPT MCP Connector Setup

## Prerequisites

- A repo-harness adopted repository.
- A local `repo-harness` CLI on PATH.
- ChatGPT workspace access to Developer Mode and custom MCP Connectors.
- A public HTTPS tunnel for ChatGPT Web. Local Codex can use stdio without a tunnel.

## Start Local MCP Server

```bash
repo-harness mcp serve --repo . --transport http --host 127.0.0.1 --port 8765 --profile planner
```

Health check:

```bash
curl http://127.0.0.1:8765/health
```

The ChatGPT path uses OAuth with a local passphrase. The passphrase is stored in an ignored local file:

```bash
jq -r .passphrase .repo-harness/mcp.oauth.json
```

Do not commit or paste this passphrase into issue trackers, PRs, or shared logs.

OAuth discovery smoke:

```bash
curl http://127.0.0.1:8765/.well-known/oauth-protected-resource/mcp
```

## Start Tunnel

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
4. Create a Connector named `repo-harness`.
5. Paste the HTTPS Connector URL ending in `/mcp`.
6. Configure Connector authentication as OAuth.
7. Click Scan Tools.
8. When the authorization page opens, enter the passphrase from `.repo-harness/mcp.oauth.json`.
9. Wait for the tool scan to finish, then create the Connector.
10. Keep write confirmations enabled.

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

```text
Use repo-harness to inspect this repo. Call harness_status, latest_handoff, and list_workflow_files. Do not write files.
```

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
- If tools are missing, restart `repo-harness mcp serve` and rescan tools.
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
