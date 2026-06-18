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

5. For Oracle provider readiness, run:

```bash
repo-harness chatgpt browser-doctor --repo . --provider oracle --json
```

6. Oracle's published CLI requires `node >=24`, but that requirement belongs to the resolved Oracle binary. Do not raise repo-harness' overall runtime floor or add Oracle as an implicit dependency just for a GPT Pro consult. If the Oracle doctor reports `nodeCompatible:false`, fix the Oracle install/runtime and rerun doctor.
7. If the Oracle doctor JSON includes `agent_actions` such as `chatgpt-oracle-install-pinned`, `chatgpt-oracle-upgrade-pinned`, or `chatgpt-oracle-fix-configured-source`, run them only when the user has explicitly asked to set up or repair GPT Pro browser consults. Do not run Oracle bootstrap from default repo-harness install or unrelated setup checks.
8. If the user wants Oracle to use an existing signed-in Chrome profile, record the selected profile metadata first:

```bash
repo-harness chatgpt browser-setup --repo . --profile-dir <user-selected-chrome-profile-dir> --browser-channel chrome
repo-harness chatgpt browser-doctor --repo . --provider oracle --json
```

The Oracle path must fail closed rather than silently falling back to an unbound/default browser session. Use `browser-bind` only when the user explicitly asks for the experimental bridge provider; then report the printed `Local authorization URL: http://127.0.0.1:...` and `bridgeExtension=...`, keep the command running while they authorize, and stop it before `browser-consult --provider bridge`.
9. Use browser consult for planning, review, critique, and goal generation. Do not use it as the executor for code edits.
10. Save useful results into repo-harness artifacts with repo-relative, timestamped `--write-output` paths such as:

```text
.ai/harness/handoff/chatgpt-review-<timestamp>.md
.ai/harness/handoff/codex-goal-<timestamp>.md
plans/prds/*.prd.md
plans/sprints/*.sprint.md
```

11. If login, captcha, workspace picker, or SSO is required, stop and ask the user to complete it in the browser.
12. Do not enable remote CDP unless the user explicitly asked for remote browser control and the security boundary is documented.
13. For MCP usage, require the server to be started with:

```bash
repo-harness mcp serve --repo . --enable-chatgpt-browser
```

14. Do not rely on provider stdout `Artifact:` / `Output:` paths being imported. Browser engine session records save prompt, transcript, output, metadata, and trusted provider IDs; ordinary stdout paths are ignored.
15. Native and bridge providers use the current ChatGPT Web model selection. Do not pass `--model` or `--thinking` with `--provider native` or `--provider bridge`; use Oracle when model selection is required.

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
stamp="$(date -u +%Y%m%dT%H%M%SZ)"
repo-harness chatgpt browser-consult \
  --repo . \
  --provider oracle \
  --prompt "Review this PRD and return risks plus a smallest next step." \
  --file plans/prds/example.prd.md \
  --write-output ".ai/harness/handoff/chatgpt-review-${stamp}.md"
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
