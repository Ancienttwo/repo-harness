---
name: repo-harness-chatgpt
description: Canonical rule owner for repo-harness ChatGPT integration -- Oracle-first browser/GPT Pro consult and continuation, MCP Connector setup, MCP bridge planning handoff, and Connector invocation read-back evidence.
when_to_use: "repo-harness-chatgpt, ChatGPT Web consult, GPT Pro consult, gptpro, browser GPT, ChatGPT MCP Connector, ChatGPT bridge, MCP read-back"
---

# repo-harness-chatgpt

Canonical rule owner for every repo-harness ChatGPT integration surface: Oracle
browser consult, session continuation, MCP Connector/bridge setup and
operation, and MCP invocation read-back evidence. Discoverable only after
explicit ChatGPT setup; never implied by either install profile. Router-only:
mode protocol lives under `references/`.

## Mode Selection

- First-time Oracle browser or MCP Connector configuration -> `references/setup.md`.
- Start a new local -> ChatGPT Web browser consult -> `references/consult.md`.
- Continue, read, or clean up a saved browser session -> `references/continue.md`.
- Verify or accept a ChatGPT MCP tool call as real evidence -> `references/read-back.md`.
- Operate the MCP Connector bridge (planner/executor/orchestrator/coding) -> `references/bridge.md`.

## Boundaries

- Product planning never implies this package; ChatGPT discovery requires explicit setup.
- Never request or handle ChatGPT passwords, 2FA codes, cookies, browser storage, or session tokens; login/captcha/SSO stop and hand back to the user.
- Setup, consult, and bridge modes share these safety rules by reference; none shares secrets, auth state, or tokens with another mode.
- A missing or unreadable canonical reference fails the calling command closed; it never synthesizes replacement prose.
- Do not enable remote CDP or an orchestrator dev runner unless the user explicitly asks and the boundary is documented.
