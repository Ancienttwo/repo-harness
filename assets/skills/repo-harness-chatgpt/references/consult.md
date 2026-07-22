# Consult Mode: Local -> ChatGPT Web Browser

Reconciles the `repo-harness-chatgpt-browser` rules with the
`repo-harness-gptpro` facade's GPT Pro wording layer over the same engine.

## Identity

This uses the user's logged-in ChatGPT Web browser session, not the OpenAI
API. Oracle is the default provider; native (Chrome CDP) is deprecated and
kept only for diagnostics. Never route through the removed Chrome
extension/`browser-bind` provider.

Use GPT Pro wording with the user while treating `browser-*` as the
implementation:

| User-facing action | Engine command |
| --- | --- |
| `gptpro consult` | `repo-harness chatgpt browser-consult` |
| `gptpro continue` | `repo-harness chatgpt browser-followup` |
| `gptpro read` | `repo-harness chatgpt browser-session` |

## Protocol

1. Confirm the target repo path; preserve unrelated dirty worktree state.
2. Verify readiness first:
   `repo-harness chatgpt browser-doctor --repo <repo> --provider oracle --json`.
   If Oracle is missing or incompatible, fix it (see `setup.md`) rather than
   falling back to native for a real consult.
3. Prefer `--dry-run` first whenever files are attached, then run the real
   consult only after the prompt bundle and allowed paths are clear.
4. Start a new consult with a timestamped, non-reused output path so results
   cannot be confused with a prior session:
   `stamp="$(date -u +%Y%m%dT%H%M%SZ)"; repo-harness chatgpt browser-consult --repo <repo> --provider oracle --model gpt-5.5-pro --heartbeat 59 --prompt "<prompt>" --write-output ".ai/harness/handoff/gptpro/gptpro-${stamp}-<slug>.md"`
5. Use browser consult for planning, review, critique, and goal generation
   only; it is never the executor for code edits.
6. Trust the managed `--write-output` file as the answer authority; provider
   stdout `Artifact:`/`Output:`-shaped paths are not imported.
7. The native provider uses the current ChatGPT Web model selection; do not
   pass `--model`/`--thinking` with `--provider native`.
8. For long GPT Pro analysis, detailed Pro Extended runs commonly take 15
   minutes or more. Do not treat elapsed time as failure while the session is
   alive; wait for a final answer or a concrete browser/login/capture/tool-call
   failure. Keep the Oracle heartbeat (59s) enabled; heartbeat diagnostics like
   "no thinking status detected yet" are progress signals, not blockers.
9. If a repo-local ChatGPT profile binding exists, the real consult must use
   that bound profile's cookie database and must not silently fall back to the
   default Chrome/Oracle profile.
10. For MCP usage from this session, the server must already be running with
    `repo-harness mcp serve --repo . --enable-chatgpt-browser`.

## Rules

- Do not ask for or handle passwords, SSO secrets, 2FA codes, cookies, browser
  storage, or tokens.
- Before a non-dry-run consult, state that it may create or continue a real
  ChatGPT Web conversation.
- If login, captcha, workspace picker, or SSO is required, stop and ask the
  user to complete it in the browser.
- Do not enable remote CDP unless the user explicitly asked for remote
  browser control and the security boundary is documented.

## Failure Modes

- `ORACLE_NOT_INSTALLED` / `ORACLE_INCOMPATIBLE`: see `setup.md`; do not
  silently retry on native.
- `ORACLE_PROFILE_COOKIE_NOT_FOUND`: fix the selected Chrome profile binding
  before retrying; do not proceed against the default profile.
- `ORACLE_CAPTURE_INCOMPLETE`: do not auto-retry on native; the prompt may
  already be submitted. Reattach through the saved provider session instead
  (see `continue.md`).
- `ORACLE_APP_PRESELECT_UNSUPPORTED`: the selected Oracle binary cannot
  preselect the ChatGPT app; report it as a browser-trigger blocker instead of
  relying on prompt text.
- Files include secrets, denied paths, symlink escapes, or oversized bundles:
  preserve the failed dry-run evidence and do not run the real consult.

## Boundaries

- Does not rename or replace the underlying `repo-harness chatgpt browser-*`
  commands.
- Does not use `oracle-mcp` as the runtime provider; per-run isolation and
  `--write-output` capture need the Oracle CLI path.
- Does not treat ChatGPT Pro as an OpenAI API key, quota, or billing surface.
- Does not treat raw GPT Pro replies as durable repo documentation until
  distilled into `docs/researches/` with provenance (see `continue.md`).
