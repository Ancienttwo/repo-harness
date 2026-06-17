# repo-harness ChatGPT Browser Engine

`repo-harness chatgpt browser-*` uses a locally authenticated ChatGPT Web browser session for planning and review workflows. It does not use the OpenAI API and does not require `OPENAI_API_KEY`.

## What It Does

- Builds a policy-checked prompt bundle from explicit repo files.
- Saves repo-local session records under `.ai/harness/chatgpt/sessions/<sessionId>/`.
- Supports dry-run preview without opening a browser.
- Supports an Oracle provider wrapper for `oracle --engine browser`.
- Supports linked follow-up sessions, conversation URL readback, and safe cleanup planning.
- Exposes optional MCP tools only when the MCP server is started with `--enable-chatgpt-browser`.

## What It Does Not Do

- It does not ask for usernames, passwords, SSO secrets, 2FA codes, cookies, or browser tokens.
- It does not upload arbitrary repo files.
- It does not enable remote CDP by default.
- It does not treat ChatGPT Web as the source of truth; the repo-local session store is the audit record.
- The native Chrome CDP provider is a spike surface. It is available, but selector/login behavior must be validated against ChatGPT Web changes before promotion.

## First-Time Setup

```bash
repo-harness chatgpt browser-setup --repo .
repo-harness chatgpt browser-doctor --repo .
```

`browser-setup` creates the session root and prints recommended ignore rules for local browser state. Browser profile and token files should remain local.

## Dry Run

```bash
repo-harness chatgpt browser-consult \
  --repo . \
  --dry-run \
  --prompt "Review this sprint." \
  --file plans/sprints/example.sprint.md \
  --model "GPT-5.5 Pro" \
  --thinking heavy
```

Dry run validates the prompt, file policy, inline size, and session write path. It saves a `dry_run` session and does not open ChatGPT.

## Oracle Provider

```bash
repo-harness chatgpt browser-consult \
  --repo . \
  --provider oracle \
  --prompt "Review this PRD and return risks." \
  --file plans/prds/example.prd.md \
  --follow-up "Challenge your previous recommendation." \
  --write-output .ai/harness/handoff/chatgpt-review.md
```

The wrapper maps repo-harness input to `oracle --engine browser`, then saves stdout, transcript, metadata, any detected ChatGPT conversation URL, provider session ID, and explicitly reported local artifacts into the repo-local session store.

## Native Provider Spike

```bash
repo-harness chatgpt browser-doctor --repo . --provider native
repo-harness chatgpt browser-consult \
  --repo . \
  --provider native \
  --browser-channel chrome \
  --keep-browser \
  --profile-dir ~/.repo-harness/chatgpt-browser-profile \
  --prompt "Reply exactly OK"
```

The native provider launches installed Google Chrome and drives it through a local Chrome DevTools Protocol websocket. It opens ChatGPT Web, waits for a visible composer, submits the assembled prompt, waits for an assistant response, and saves the captured text into the same repo-local session store.

Failure is explicit:

- Missing Google Chrome reports `NATIVE_PROVIDER_FAILED` with the missing app path.
- Missing login or composer reports `LOGIN_OR_COMPOSER_NOT_READY`.
- A submitted run with no captured assistant text reports `ASSISTANT_CAPTURE_TIMEOUT`.

For first login, run with `--browser-channel chrome --keep-browser`, complete login manually, then rerun with the same `--profile-dir`.

## Sessions

```bash
repo-harness chatgpt browser-list --repo .
repo-harness chatgpt browser-session --repo . chgpt_20260617_120530_review-sprint
repo-harness chatgpt browser-session --repo . chgpt_20260617_120530_review-sprint --metadata-only
repo-harness chatgpt browser-open --repo . chgpt_20260617_120530_review-sprint
```

Each session contains:

```text
.ai/harness/chatgpt/sessions/<sessionId>/
  meta.json
  prompt.md
  transcript.md
  output.md
  events.jsonl
  artifacts/
```

## Follow-Up Sessions

```bash
repo-harness chatgpt browser-followup \
  --repo . \
  --session chgpt_20260617_120530_review-sprint \
  --prompt "Turn that review into a Codex-ready goal."
```

Follow-up sessions are linked with `sourceSessionId` in `meta.json`. The Oracle provider receives the source session as provider context; dry-run follow-ups still write a linked local session without opening a browser.

## Cleanup

```bash
repo-harness chatgpt browser-cleanup --repo . --status dry_run --limit 20
repo-harness chatgpt browser-cleanup --repo . --status dry_run --limit 20 --force
```

Cleanup defaults to dry-run. It only removes candidates when `--force` is passed.

## MCP

Browser tools are disabled by default.

```bash
repo-harness mcp serve \
  --repo . \
  --transport stdio \
  --profile planner \
  --enable-chatgpt-browser
```

Enabled tools:

- `run_chatgpt_browser_consult`
- `read_chatgpt_browser_session`
- `list_chatgpt_browser_sessions`
- `open_chatgpt_browser_session`
- `continue_chatgpt_browser_session`

Use `dryRun: true` for planning or policy inspection. Non-dry-run consults may create a real ChatGPT Web conversation through the configured provider.

## File Policy

Allowed by default:

- `AGENTS.md`, `CLAUDE.md`, `README.md`
- `docs/**`
- `plans/**`
- `tasks/**`
- `.ai/context/**`
- `.ai/harness/**`
- `package.json`

Denied by default:

- `.env`, `.env.*`
- private key and certificate files
- `.ssh/**`, `.git/**`
- `node_modules/**`, `dist/**`, `build/**`, `coverage/**`
- `secrets/**`, `credentials/**`, `private/**`, `_ops/**`
- `.repo-harness/**/*.json`

The engine rejects denied files before browser/provider execution.

## Security Notes

- Keep browser profiles and local config uncommitted.
- Do not expose Chrome remote debugging outside localhost without an explicit tunnel/security plan.
- Use dry-run before sending large or sensitive context.
- Prefer narrow files over whole-repo dumps.
- Treat generated ChatGPT output as review input, not authoritative code truth.
