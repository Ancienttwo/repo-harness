---
name: repo-harness-gptpro
description: Direct GPT Pro consult facade for repo-harness. Use when the user asks for repo-harness:gptpro, GPT Pro advice, GPT Pro review, gptpro consult, or continuing/opening a GPT Pro browser session through the Oracle-first local ChatGPT Web browser provider.
when_to_use: "repo-harness-gptpro, repo-harness:gptpro, gptpro, gptpro consult, GPT Pro consult, GPT Pro review, browser_session consult, browser-session consult, continue GPT Pro session"
---

# repo-harness-gptpro

Use this command when the user wants local Codex to consult GPT Pro through the repo-harness ChatGPT Web browser provider. Oracle is the default main path; native is deprecated and kept only for diagnostics.

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
   `repo-harness chatgpt browser-doctor --repo <repo> --provider oracle --json`
3. If Oracle is missing, install or point to a pinned `oracle` CLI (`--oracle-bin` or `REPO_HARNESS_ORACLE_BIN`) before a real consult. Do not silently fall back to another provider.
4. If Oracle doctor reports `ORACLE_INCOMPATIBLE`, stop and report the missing capabilities from `oracle.missingCapabilities`; do not run a consult that would pass unsupported Oracle flags.
5. If a repo-local ChatGPT profile binding exists, keep it in the Oracle path. The real consult should use the selected profile cookie DB (for example `Profile 1/Cookies`) and must not silently fall back to the default Chrome/Oracle browser profile.
6. If the user provides an existing GPT Pro session id, inspect it with:
   `repo-harness chatgpt browser-session --repo <repo> <sessionId>`
7. Continue an existing GPT Pro conversation with:
   `repo-harness chatgpt browser-followup --repo <repo> --session <sessionId> --prompt <prompt>`
8. Open the saved GPT Pro conversation when the user asks to view it:
   `repo-harness chatgpt browser-open --repo <repo> <sessionId>`
9. Start a new GPT Pro consult with GPT Pro wording in the report, while running the browser engine underneath. Keep GPT Pro replies under `.ai/harness/handoff/gptpro/`, never reuse a fixed output filename, and include a timestamp plus short slug so local output cannot be confused with a previous ChatGPT session:
   `stamp="$(date -u +%Y%m%dT%H%M%SZ)"; slug="<short-purpose>"; mkdir -p .ai/harness/handoff/gptpro; out=".ai/harness/handoff/gptpro/gptpro-${stamp}-${slug}.md"; repo-harness chatgpt browser-consult --repo <repo> --provider oracle --model gpt-5.5-pro --heartbeat 59 --title "gptpro-${stamp}-${slug}" --prompt <prompt> --write-output "$out"`
10. Use `--dry-run` first when attaching files, then run the real consult only after the prompt bundle and allowed paths are clear.
11. For GPT Pro reviews or acceptance checks, resolve the recorded ChatGPT MCP server name from `repo-harness mcp doctor --repo <repo> --json` or `.repo-harness/mcp.local.json` (`chatgpt.serverName`). Treat `chatgpt.serverNameConfigured:false` or a missing `chatgpt.serverName` as setup-incomplete, then route to `repo-harness:gptpro_setup` before an MCP read-back review. Do not substitute a user-specific hard-coded MCP name.
12. When MCP read-back is required, pass the recorded server name as an explicit ChatGPT app preselect: `serverName="$(repo-harness mcp doctor --repo <repo> --json | jq -r '.chatgpt.serverName // empty')"` and add `--chatgpt-app "$serverName"` to `browser-consult` or `browser-followup`. If the command fails with `ORACLE_APP_PRESELECT_UNSUPPORTED`, the selected Oracle binary cannot click the ChatGPT app selector yet; report that as a browser-trigger blocker instead of relying on prompt text like `@serverName`.
13. When the user asks for a reasoning mode, pass repo-harness `--thinking <light|standard|extended|heavy>` only after `browser-doctor --provider oracle` reports `browserThinkingTime:true`; repo-harness maps it to Oracle `--browser-thinking-time`.
14. For long GPT Pro analysis tasks, expect detailed Pro Extended planning/review runs to take 15 minutes or more. Do not treat elapsed time as failure while the session is still alive; wait for a final answer or a concrete browser, login, capture, or tool-call failure.
15. Keep Oracle heartbeat enabled at 59 seconds unless the user explicitly disables it; repo-harness streams heartbeat/diagnostic lines to stderr and reserves stdout for final JSON. Heartbeat lines like `no thinking status detected yet` are progress diagnostics, not a blocker by themselves.
16. Report the GPT Pro result with: session id, timestamped output path, conversation URL if present, whether it was a new consult or follow-up, and any visible-browser blocker.

## MCP Read-Back Acceptance

When asking GPT Pro to review repo updates, include an explicit acceptance requirement in the prompt:

- Use the recorded ChatGPT MCP server name from `chatgpt.serverName` to read the current repo state before producing findings or a merge/readiness verdict.
- Before a Pro MCP attempt, open ChatGPT Settings -> Connectors for the recorded server name, run Refresh or Scan Tools, verify the expected Action is listed, then start a fresh chat with Deep research enabled when the review requires Pro research, and select the Connector from `+` -> More.
- For multi-repo or user-scope reads, first call `discover_harness_repos` with `query`, `name`, or `repo_path` for repo-like text such as `my-app/`; use the returned exact target for follow-up workflow reads. Do not rely on a literal relative path guess.
- Read at least the changed-file list or status, the relevant diffs or changed files, and any requested session/handoff artifacts through that recorded MCP server; pasted summaries are context, not sufficient evidence.
- Include a short `MCP Read Evidence` section in the final answer naming the recorded MCP server, the reads performed, and the files, diffs, or artifacts inspected.
- If the recorded MCP server name is missing, or `mcp doctor --json` reports `chatgpt.serverNameConfigured:false`, route to `repo-harness:gptpro_setup` so initialization can record it before review.
- If the recorded MCP server is unavailable, blocked, stale, or cannot read the requested paths, classify the result as blocked or partial instead of issuing a merge-ready verdict.
- A prompt that asks ChatGPT to use the recorded MCP server is not sufficient by itself; the ChatGPT conversation must expose the app/action schema. If the conversation reports that the app is not exposed, use a fresh app-enabled conversation or a GitHub PR/diff evidence source instead of claiming MCP read-back evidence.
- For Pro runs, the normal tool-call runtime UI may not appear the way it does for other models because Pro uses a sandbox/process flow. In the visible ChatGPT Web UI, click the assistant's `Thinking` / `Thought for ...` disclosure to open the right-side process pane. Use that pane to confirm whether Pro actually emitted a `Called tool` event for the selected app, which action it chose, or whether it only reasoned inside the sandbox without invoking MCP.
- Treat `Called tool` with an action/result, or an equivalent captured tool-call transcript, as the only accepted MCP invocation evidence. Reject connector selection, assistant self-report, plausible JSON, and sandbox shell exploration as proof.
- Classify Pro outcomes explicitly: `invocation_verified` for a real tool call, `approval_pending` for a real confirmation prompt, `surface_blocked` for sandbox-only reasoning or `app_unavailable` with no tool event, and `bundle_fallback` when Pro reviews a local evidence bundle instead of reading through MCP.
- Do not ask GPT Pro to retrieve secrets, cookies, browser storage, ignored private operations state, or other denied paths through the recorded MCP server.

## Pro Surface Fallback

- When Pro is `surface_blocked`, stop retrying the same connector prompt after one explicit-tool retry. Do not delete/recreate the Connector as the first response to a Pro-only dispatch failure.
- Reuse the existing local GPT Pro/Oracle handoff path. Build a bounded evidence bundle from local files, diffs, checks, and known external findings, then ask Pro for a plan or review over that bundle.
- The fallback prompt must include a provenance header:

```yaml
source: local_repo_harness_bundle
pro_invoked_mcp: false
working_tree: clean | dirty
included_paths: [...]
omitted_or_truncated: [...]
```

- Tell Pro that anything outside the bundle is unknown. Codex executes and verifies locally, then creates a fresh post-change bundle for another Pro review if needed.
- Distinguish permissions: repo-scope setup is repo-bound; broad repo discovery requires explicit user-scope setup with full-disk read. Do not recommend full-disk read by default.

## Research Promotion

- Treat `.ai/harness/handoff/gptpro/*.md` as raw local GPT Pro evidence. These files are timestamped and ignored so repeated reviews do not collide or pollute tracked workflow handoff files.
- When a GPT Pro result contains durable repo knowledge, create or update `docs/researches/YYYYMMDD-<topic>.md` with a curated synthesis instead of copying the raw answer as authority.
- The research note should include the conclusion, key findings, implementation implications, open questions, and a short provenance block: raw artifact path, repo-harness `sessionId`, upstream provider session id when present, requested model, capture timestamp, and conversation URL when available.
- Keep task-local decisions in `tasks/notes/` and repeated correction rules in `tasks/lessons.md`; `docs/researches/` is for stable cross-task knowledge.

## Failure Modes

- If `browser-doctor --provider oracle` reports `ORACLE_NOT_INSTALLED`, install or configure a pinned Oracle CLI and rerun doctor before a real consult.
- If Oracle reports `ORACLE_PROFILE_COOKIE_NOT_FOUND`, fix the selected Chrome profile binding before retrying; do not let the run proceed against the default profile.
- If Oracle reports `ORACLE_CAPTURE_INCOMPLETE`, do not auto-retry on native; the prompt may already have been submitted. Reattach through the saved provider session when available.
- Do not route GPT Pro consults through the removed Chrome extension provider or `browser-bind`; use Oracle for real runs and native only for deprecated diagnostics.
- If ChatGPT Web needs login, captcha, SSO, workspace selection, or manual verification, report the blocker and ask the user to complete it in the visible browser.
- If the user asks for `gptpro_mcp`, Connector setup, or ChatGPT -> local repo access, route to `repo-harness:gptpro_setup`; this command is for local -> GPT Pro consults.
- If a session id is invalid or missing, list recent GPT Pro sessions with `repo-harness chatgpt browser-list --repo <repo>` and ask for the intended session.
- If files include secrets, denied paths, symlink escapes, or oversized prompt bundles, preserve the failed dry-run evidence and do not run the real consult.

## Boundaries

- Does not rename or replace the underlying `repo-harness chatgpt browser-*` CLI commands; it only presents GPT Pro wording at the skill layer.
- Does not configure MCP Connector, HTTPS tunnels, OAuth passphrases, or bearer tokens; use `repo-harness:gptpro_setup` for setup.
- Does not use `oracle-mcp` as the default runtime provider; repo-harness needs the Oracle CLI path for per-run isolation and `--write-output` capture authority.
- Does not hard-code a personal MCP server name or use the recorded ChatGPT MCP server as the local runtime provider; that server name is only a GPT Pro read-back evidence surface for review prompts.
- Does not request or handle ChatGPT passwords, 2FA codes, cookies, browser storage, or session tokens.
- Does not use ChatGPT Pro as an OpenAI API key, API quota, or billing surface.
- Does not treat raw GPT Pro replies as durable repo documentation until they have been distilled into `docs/researches/` with provenance.
- Does not treat GPT Pro advice as implementation authority; Codex still owns repo edits and verification.
