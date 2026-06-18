# MCP Agent Skill and Human README Notes

Date: 2026-06-17

Scope:

- Expanded the repo-harness ChatGPT MCP bridge agent workflow reference.
- Added a human-facing MCP Connector quickstart to README.
- Expanded the generated ChatGPT MCP setup guide with the human workflow, agent handoff contract, and tool chain.
- Clarified stable tunnel setup for recurring ChatGPT Connector use: quick tunnels are smoke-only, while named tunnels or reserved domains should be passed through `repo-harness mcp setup chatgpt --endpoint <https-url>/mcp`.
- Synced `src/cli/mcp/setup.ts` templates so generated Skill/reference/guide content matches the tracked docs.
- Added an explicit local `orchestrator` dev-mode runner setting for users who want ChatGPT Developer Mode to trigger a local Codex/Claude CLI against the fixed Codex Goal handoff.

Decision:

- Keep planner/executor MCP as a workflow-artifact sidecar. It prepares PRD, checklist Sprint, and Codex Goal handoff artifacts, but does not authorize source-code writes or arbitrary shell tools.
- Recurring ChatGPT Connectors should not depend on account-less Cloudflare quick tunnel URLs because each URL is a distinct Connector app from ChatGPT's perspective; store only the stable public `/mcp` endpoint in ignored local config and generated setup docs.
- The only runner exception is explicit local Developer Mode: `orchestrator` profile plus `devMode.agentRunner=true`, `--enable-dev-runner`, or `REPO_HARNESS_MCP_DEV_RUNNER=1`.
- The runner tool reads only `.ai/harness/handoff/codex-goal.md`, allows only configured local agents (`codex`/`claude`), applies timeout/output caps/redaction, and writes MCP audit entries.
