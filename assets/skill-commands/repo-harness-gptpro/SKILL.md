---
name: repo-harness-gptpro
description: Direct GPT Pro consult facade for repo-harness. Use when the user asks for repo-harness:gptpro, GPT Pro advice, GPT Pro review, gptpro consult, or continuing/opening a GPT Pro browser session through the local ChatGPT Web browser/session bridge.
when_to_use: "repo-harness-gptpro, repo-harness:gptpro, gptpro, gptpro consult, GPT Pro consult, GPT Pro review, browser_session consult, browser-session consult, continue GPT Pro session"
---

# repo-harness-gptpro

Use this command when the user wants local Codex to consult GPT Pro through the repo-harness ChatGPT Web browser/session bridge.

Use GPT Pro language with the user. Treat the `browser-*` command names as implementation details:

| User-facing action | Engine command |
| --- | --- |
| `gptpro consult` | `repo-harness chatgpt browser-consult` |
| `gptpro continue` | `repo-harness chatgpt browser-followup` |
| `gptpro read` | `repo-harness chatgpt browser-session` |
| `gptpro open` | `repo-harness chatgpt browser-open` |
| `gptpro list` | `repo-harness chatgpt browser-list` |

## Protocol

1. Confirm the target repo path with `git rev-parse --show-toplevel` or the user's explicit path. Preserve unrelated dirty worktree state.
2. Verify GPT Pro browser readiness before any real consult:
   `repo-harness chatgpt browser-doctor --repo <repo> --provider native --json`
3. If setup is missing, route to `repo-harness-gptpro-setup` / `repo-harness:gptpro_setup` instead of improvising configuration.
4. If the user provides an existing GPT Pro session id, inspect it with:
   `repo-harness chatgpt browser-session --repo <repo> <sessionId>`
5. Continue an existing GPT Pro conversation with:
   `repo-harness chatgpt browser-followup --repo <repo> --session <sessionId> --prompt <prompt>`
6. Open the saved GPT Pro conversation when the user asks to view it:
   `repo-harness chatgpt browser-open --repo <repo> <sessionId>`
7. Start a new GPT Pro consult with GPT Pro wording in the report, while running the browser engine underneath:
   `repo-harness chatgpt browser-consult --repo <repo> --provider native --manual-login --prompt <prompt> --write-output .ai/harness/handoff/gptpro-consult.md`
8. Use `--dry-run` first when attaching files, then run the real consult only after the prompt bundle and allowed paths are clear.
9. Report the GPT Pro result with: session id, output path, conversation URL if present, whether it was a new consult or follow-up, and any manual-login blocker.

## Failure Modes

- If `browser-doctor` reports native provider unavailable, route to `repo-harness:gptpro_setup` and stop before claiming GPT Pro access works.
- If ChatGPT Web needs login, captcha, SSO, workspace selection, or manual verification, report the blocker and ask the user to complete it in the visible browser.
- If the user asks for `gptpro_mcp`, Connector setup, or ChatGPT -> local repo access, route to `repo-harness:gptpro_setup`; this command is for local -> GPT Pro consults.
- If a session id is invalid or missing, list recent GPT Pro sessions with `repo-harness chatgpt browser-list --repo <repo>` and ask for the intended session.
- If files include secrets, denied paths, symlink escapes, or oversized prompt bundles, preserve the failed dry-run evidence and do not run the real consult.

## Boundaries

- Does not rename or replace the underlying `repo-harness chatgpt browser-*` CLI commands; it only presents GPT Pro wording at the skill layer.
- Does not configure MCP Connector, HTTPS tunnels, OAuth passphrases, or bearer tokens; use `repo-harness:gptpro_setup` for setup.
- Does not request or handle ChatGPT passwords, 2FA codes, cookies, browser storage, or session tokens.
- Does not use ChatGPT Pro as an OpenAI API key, API quota, or billing surface.
- Does not treat GPT Pro advice as implementation authority; Codex still owns repo edits and verification.
