---
name: repo-harness-chatgpt-browser
description: Use when the user wants Codex to consult their logged-in ChatGPT Web session through repo-harness browser engine for planning, architecture review, PRD critique, or Codex goal generation.
---

# repo-harness ChatGPT Browser

Use this skill when the user asks to consult ChatGPT Web, GPT Pro, browser GPT, or a logged-in ChatGPT account through repo-harness.

## Rules

1. This uses the user's logged-in ChatGPT Web browser session, not the OpenAI API.
2. Do not ask for or handle passwords, SSO secrets, 2FA codes, cookies, browser storage, or tokens.
3. Before a non-dry-run consult, state that it may create or continue a real ChatGPT Web conversation.
4. Prefer dry-run first when files are involved:

```bash
repo-harness chatgpt browser-consult --repo . --dry-run --prompt "<prompt>" --file <path>
```

5. For readiness, run:

```bash
repo-harness chatgpt browser-doctor --repo .
```

6. Use browser consult for planning, review, critique, and goal generation. Do not use it as the executor for code edits.
7. Save useful results into repo-harness artifacts such as:

```text
.ai/harness/handoff/chatgpt-review.md
.ai/harness/handoff/codex-goal.md
plans/prds/*.prd.md
plans/sprints/*.sprint.md
```

8. If login, captcha, workspace picker, or SSO is required, stop and ask the user to complete it in the browser.
9. Do not enable remote CDP unless the user explicitly asked for remote browser control and the security boundary is documented.
10. For MCP usage, require the server to be started with:

```bash
repo-harness mcp serve --repo . --enable-chatgpt-browser
```

## Common Commands

Dry-run consult:

```bash
repo-harness chatgpt browser-consult \
  --repo . \
  --dry-run \
  --prompt "Review this sprint and return execution risks." \
  --file plans/sprints/example.sprint.md
```

Oracle provider consult:

```bash
repo-harness chatgpt browser-consult \
  --repo . \
  --provider oracle \
  --prompt "Review this PRD and return risks plus a smallest next step." \
  --file plans/prds/example.prd.md \
  --write-output .ai/harness/handoff/chatgpt-review.md
```

Native provider spike:

```bash
repo-harness chatgpt browser-doctor --repo . --provider native
repo-harness chatgpt browser-consult \
  --repo . \
  --provider native \
  --browser-channel chrome \
  --keep-browser \
  --prompt "Reply exactly OK"
```

Use native provider only when the user is ready for a visible ChatGPT Web run. If login is required, keep the browser open and have the user complete login manually; do not request or handle credentials.

Read the result:

```bash
repo-harness chatgpt browser-list --repo .
repo-harness chatgpt browser-session --repo . <sessionId>
repo-harness chatgpt browser-open --repo . <sessionId>
```

Continue from a saved session:

```bash
repo-harness chatgpt browser-followup \
  --repo . \
  --session <sessionId> \
  --prompt "Challenge the previous result and return the smallest next step."
```

Plan cleanup before deleting local session records:

```bash
repo-harness chatgpt browser-cleanup --repo . --status dry_run --limit 20
```
