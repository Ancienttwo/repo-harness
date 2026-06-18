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

5. For existing signed-in Chrome profile readiness, run:

```bash
repo-harness chatgpt browser-doctor --repo . --provider bridge --json
```

6. If the bridge doctor reports no bound ChatGPT product session, bind the user-selected Chrome profile first:

```bash
repo-harness chatgpt browser-setup --repo . --profile-dir <user-selected-chrome-profile-dir> --browser-channel chrome
repo-harness chatgpt browser-bind --repo . --open
repo-harness chatgpt browser-doctor --repo . --provider bridge --json
```

Report the printed `Local authorization URL: http://127.0.0.1:...` and `bridgeExtension=...` to the user and keep the command running while they authorize. The authorization page must guide the user to open Chrome Extensions, enable **Developer mode**, click **Load unpacked**, select `bridgeExtension`, open or refresh ChatGPT, then click **Bind ChatGPT**. The Bind button must call repo-harness locally; do not treat a direct link to ChatGPT as authorization. If the authorization page reports login required, have the user click **Open ChatGPT Login**, sign in, return, and bind again. After authorization succeeds, stop `browser-bind` before `browser-consult --provider bridge` because they use the same local bridge port. Do not route native CDP through the user's default Chrome data directory; Chrome 136+ blocks remote debugging against the default directory. Existing signed-in real Chrome profiles use `--provider bridge`.
7. Use browser consult for planning, review, critique, and goal generation. Do not use it as the executor for code edits.
8. Save useful results into repo-harness artifacts with repo-relative `--write-output` paths such as:

```text
.ai/harness/handoff/chatgpt-review.md
.ai/harness/handoff/codex-goal.md
plans/prds/*.prd.md
plans/sprints/*.sprint.md
```

9. If login, captcha, workspace picker, or SSO is required, stop and ask the user to complete it in the browser.
10. Do not enable remote CDP unless the user explicitly asked for remote browser control and the security boundary is documented.
11. For MCP usage, require the server to be started with:

```bash
repo-harness mcp serve --repo . --enable-chatgpt-browser
```

12. Do not rely on provider stdout `Artifact:` / `Output:` paths being imported. Browser engine session records save prompt, transcript, output, metadata, and trusted provider IDs; ordinary stdout paths are ignored.
13. Native and bridge providers use the current ChatGPT Web model selection. Do not pass `--model` or `--thinking` with `--provider native` or `--provider bridge`; use Oracle when model selection is required.

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

Bridge provider for an existing signed-in profile:

```bash
repo-harness chatgpt browser-doctor --repo . --provider bridge
repo-harness chatgpt browser-setup --repo . --profile-dir <user-selected-chrome-profile-dir> --browser-channel chrome
repo-harness chatgpt browser-bind --repo . --open
repo-harness chatgpt browser-consult \
  --repo . \
  --provider bridge \
  --prompt "Reply exactly OK"
```

Use bridge/native providers only when the user is ready for a visible ChatGPT Web run. If login is required, have the user complete it from the local authorization page; do not request or handle credentials.

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
