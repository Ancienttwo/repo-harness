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
- MCP does not expose a default Codex runner. It prepares `.ai/harness/handoff/codex-goal.md`; the local Codex host owns `/goal` execution.
- Do not put tunnel tokens, OAuth tokens, passphrases, or ChatGPT/Codex credentials in git.
