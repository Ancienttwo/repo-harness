# Oracle Local GPT Session Research Notes

Date: 2026-06-17

Reference:

- Repo: `https://github.com/steipete/oracle`
- Local checkout: `_ref/oracle`
- Commit: `bc66fad88396330445dbaf44890a12cf390372ef`

Question:

- Can local CLI/MCP initiate a GPT/ChatGPT session and retrieve the final result?

Findings:

- Oracle supports both API-backed and browser-backed local sessions.
- API path uses OpenAI/other provider APIs and stores response metadata/logs under `~/.oracle/sessions`.
- Browser path drives a signed-in ChatGPT web session through Chrome/CDP, creates a local session, captures assistant output, and saves artifacts/transcripts locally.
- Oracle MCP exposes `consult`, `sessions`, `chatgpt_image`, and `project_sources`.
- `consult` starts a session and returns `structuredContent.sessionId`, `status`, `output`, model summaries, artifacts, and image paths when present.
- `sessions` reads stored session metadata/log/request bodies from the same local store used by CLI.
- Browser mode supports manual login profile, attach-running Chrome, follow-up prompts in one conversation, Deep Research, generated images, and local artifact capture.
- Remote browser service exists for cases where the signed-in browser runs on another host; it uses bearer auth and serializes browser runs.

Key source paths:

- `_ref/oracle/docs/mcp.md`
- `_ref/oracle/docs/browser-mode.md`
- `_ref/oracle/src/mcp/tools/consult.ts`
- `_ref/oracle/src/mcp/tools/sessions.ts`
- `_ref/oracle/src/cli/sessionRunner.ts`
- `_ref/oracle/src/browser/sessionRunner.ts`
- `_ref/oracle/src/oracle/run.ts`
- `_ref/oracle/src/remote/server.ts`
- `_ref/oracle/src/remote/client.ts`

Design implication for repo-harness:

- Local -> GPT should be modeled as a local session runner with a durable session store and result readback, not as reverse-calling ChatGPT Web Connector.
- API engine is the stable automation path.
- Browser engine is a useful dev-mode/pro-subscription path, but should remain opt-in, visible/audited, timeout-aware, and separated from planner-profile MCP.
- A repo-harness integration can either shell out to `oracle` as an optional provider or implement a narrower equivalent: `start_consult`, `read_consult`, and `list_consults` over a local session directory.
