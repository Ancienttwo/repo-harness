# repo-harness ChatGPT Browser Engine

`repo-harness chatgpt browser-*` uses a locally authenticated ChatGPT Web browser session for planning and review workflows. It does not use the OpenAI API and does not require `OPENAI_API_KEY`.

## What It Does

- Builds a policy-checked prompt bundle from explicit repo files.
- Can require a fail-closed Gitleaks scan over the exact rendered prompt and
  follow-ups before any session/provider side effect.
- Saves repo-local session records under `.ai/harness/chatgpt/sessions/<sessionId>/`.
- Supports dry-run preview without opening a browser.
- Supports an Oracle provider wrapper for `oracle --engine browser` (the default, recommended main path).
- Supports linked follow-up sessions, conversation URL readback, and safe cleanup planning.
- Exposes optional MCP tools only when the MCP server is started with `--enable-chatgpt-browser`.

## What It Does Not Do

- It does not ask for usernames, passwords, SSO secrets, 2FA codes, cookies, or browser tokens.
- It does not upload arbitrary repo files.
- It does not enable remote CDP by default.
- It does not treat ChatGPT Web as the source of truth; the repo-local session store is the audit record.
- It does not import local artifact paths from ordinary provider stdout.
- It does not auto-fall back from Oracle to another provider. Oracle may have already submitted the prompt before a capture drop, so silent retries would double-ask.
- It does not generate, install, or require a Chrome extension.

## Provider Posture

- **`oracle` — default main path.** Oracle owns the browser engine; repo-harness always passes `--engine browser` and disables auto-archive with `--browser-archive never`. This is the recommended provider.
- **`native` — deprecated.** The homegrown Chrome CDP engine is no longer maintained and is kept only as a short-term diagnostic entry (`browser-doctor --provider native`). It will be removed. Chrome 136+ also blocks remote-debugging switches against the *default* Chrome data directory (custom `--user-data-dir` still works), but the deprecation is a maintenance decision, not a Chrome limitation.

## Runtime Boundary

repo-harness remains a Bun-first CLI package. The Oracle CLI package currently requires `node >=24`, but that requirement belongs to the resolved Oracle binary, not to repo-harness' overall package runtime. Keep Oracle optional and pinned: install it in a runtime that satisfies its own engine requirement, pass an explicit `--oracle-bin`, set `REPO_HARNESS_ORACLE_BIN`, or expose a trusted `oracle` on `PATH`.

`browser-doctor --provider oracle --json` is the authority for this boundary. It probes the resolved binary with `--help` and `--version` and reports `nodeCompatible` plus the capabilities repo-harness may use. If the doctor reports `nodeCompatible:false`, fix or reinstall Oracle's Node runtime before changing repo-harness' `package.json` engines or CI runtime.

When Oracle is missing, too old, or selected through a broken explicit source, the same doctor JSON includes explicit source-aware `agent_actions` such as `chatgpt-oracle-install-pinned`, `chatgpt-oracle-upgrade-pinned`, or `chatgpt-oracle-fix-configured-source`. These actions are for the opt-in GPT Pro setup/repair lane only. Default `repo-harness install`, ordinary setup checks, and dry-run consults still do not install, upgrade, or re-point Oracle automatically.

## First-Time Setup

The canonical ChatGPT Skill is explicit-setup-only and is not part of the
minimal or full install profiles. Project the canonical package into both host
discovery roots with one owned symlink per host:

```bash
repo-harness chatgpt install-skill --target both
```

Use `--dry-run` to inspect the lifecycle or `--target codex|claude` to select
one host. `repo-harness chatgpt uninstall-skill --target <target>` removes only
an exact symlink to the canonical package. Existing directories, broken
symlinks, and symlinks to another source fail closed and are never overwritten.
These commands do not mutate either default install profile.

Projections created from a contract worktree can leave the host symlink
dangling after worktree cleanup; see "Host Skill Projection" in
`assets/skills/repo-harness-chatgpt/references/setup.md` for the recovery steps.

```bash
repo-harness chatgpt browser-setup --repo .
repo-harness chatgpt browser-doctor --repo .
```

`browser-setup` creates the session root and prints recommended ignore rules for local browser state. Browser profile and token files should remain local.

For the default Oracle path, install or point to a pinned Oracle binary first, then verify it:

```bash
repo-harness chatgpt browser-doctor --repo . --provider oracle --json
```

If the JSON includes `agent_actions`, run the indicated source-aware repair only when the user has explicitly asked to set up GPT Pro browser consults, then rerun the doctor until `status:"ready"`.

For an existing signed-in Chrome profile, bind the selected profile metadata so the Oracle wrapper can pass the matching cookie database instead of silently using an unbound/default browser session:

```bash
repo-harness chatgpt browser-setup \
  --repo . \
  --profile-dir "<user-selected-chrome-profile-dir>" \
  --browser-channel chrome
repo-harness chatgpt browser-doctor --repo . --provider oracle --json
```

`browser-setup` records only product binding metadata in `.repo-harness/chatgpt-browser.local.json`; it does not copy cookies, tokens, passwords, or browser storage. The Oracle provider reads that binding, derives a regular Chrome cookie database path such as `Profile 1/Network/Cookies`, and passes it to the pinned Oracle binary. If the cookie database is missing, the Oracle path fails closed with `ORACLE_PROFILE_COOKIE_NOT_FOUND`.

If the user selects a Chrome profile subdirectory such as `<chrome-user-data-dir>/<profile-name>`, repo-harness stores the parent user data directory and launches Chrome with `--profile-directory <profile-name>`. On macOS this may look like `~/Library/Application Support/Google/Chrome/Profile 1`; Windows and Linux use their own Chrome profile roots. If the user selects the user data directory itself, pass `--profile-directory <name>` explicitly.

The old experimental Chrome extension flow has been removed from the product surface. Do not load an unpacked extension or look for a `browser-bind` authorization page. Use Oracle for real GPT Pro consults; use native CDP only as a deprecated diagnostic path against a non-default automation profile.

Do not use the default Chrome data directory for native CDP validation. Chrome 136+ no longer honors remote-debugging switches against the current user's default Chrome data directory; it requires a non-standard `--user-data-dir`. Existing signed-in real Chrome profiles should use Oracle instead of native CDP.

## Advisory GPT Pro Orchestration

The canonical `repo-harness-chatgpt` Skill has an explicit `orchestrate` mode
for a user-authorized plan -> local implementation -> same-conversation review
loop. It is a policy composition over the existing browser/session commands,
not a managed `agent-fleet` role, a parallel Skill, a runtime adapter, or a new
evidence schema. Enablement is task-scoped: project the Skill, verify the
browser and visible Pro model, select the user's authorized GitHub Connector,
pin the target repository/ref/SHA, and pass the exact local context through the
existing secret-scanned prompt path. The full operator checklist is in
`assets/skills/repo-harness-chatgpt/references/setup.md`; the protocol is in
`assets/skills/repo-harness-chatgpt/references/orchestrate.md`.

The authority split is deliberate. GPT Pro may propose work and review the
returned diff, but it cannot edit the local worktree, run local commands,
claim or release leases, widen allowed paths, assert check results, or approve
commit/push/PR/merge/deploy. Local Codex and repo-harness remain accountable
for task state, execution, verification, and acceptance. ChatGPT Web is not a
source of local truth, and the GitHub Connector cannot describe uncommitted
local changes.

For each round, record the exact remote repository/ref/SHA separately from the
local base commit and the SHA-256 identity of the tracked-diff/untracked-file
bundle. Classify GitHub Connector evidence from observable browser/tool
read-back, never from model self-report:

- `verified`: the Connector invocation and exact repository/SHA are visible;
- `bundle_only`: exact remote facts were supplied in the scanned bundle, but no
  invocation is visible; this is not GitHub MCP proof;
- `unverified`: invocation or revision evidence is absent, stale, or
  conflicting and blocks adoption.

The initial plan and implementation review must use the same browser
conversation/session. Before each submission, run the exact prompt and
attachments through `browser-consult --dry-run --secret-scan`, compare the
saved prompt hash with its receipt, and do not paste or attach changed local
content afterward. The canary is complete only when the visible Pro model,
conversation URL/handle, generation completion, remote SHA, GitHub evidence
classification, local-delta identity, same-conversation review, actual local
checks, and local acceptance outcome are all inspectable. A missing login,
Connector, attachment, completion state, stale SHA, failed scan, or failed
continuation is a blocked run; do not switch transport or infer success.

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

### Delegate Secret Gate

Code-delivery delegations must add `--secret-scan` to both dry-run and real
`browser-consult` calls:

```bash
repo-harness chatgpt browser-consult \
  --repo . \
  --dry-run \
  --secret-scan \
  --prompt "Review this bounded implementation brief." \
  --file .ai/harness/chatgpt/delegations/example/bundle/src/example.ts
```

The gate resolves a trusted Gitleaks >= 8.19 in this order:
`--gitleaks-bin`, `REPO_HARNESS_GITLEAKS_BIN`, then `PATH`. It scans the exact
rendered `prompt.md` and every follow-up through `gitleaks stdin` before a
session directory is allocated or a provider is invoked. The scan runs from an
isolated temporary directory, clears inherited Gitleaks config overrides,
ignores repo-controlled allow comments, and captures only a generic redacted
failure. A missing/incompatible scanner, finding, timeout, or scanner error
returns `PROMPT_SECRET_SCAN_UNAVAILABLE` or `PROMPT_SECRET_SCAN_FAILED` and
creates no session.

On the Oracle path, scan-bound attachments are rebuilt from the already
captured PromptBundle bytes in a private per-run temporary directory and each
staged file is rechecked against its original SHA-256. Oracle receives only
those immutable staged paths, so a repository file changed after the scan
cannot alter what is sent. The staging directory is removed when the provider
run ends.

Successful sessions persist `meta.security.promptSecretScan` and expose the
same receipt in dry-run JSON. The receipt binds scanner version/source plus the
byte count and SHA-256 for every scanned payload. Compare the prompt receipt to
the saved `prompt.md` before transporting it through Codex's built-in browser.
`--gitleaks-bin` is accepted only with `--secret-scan`. Ordinary planning and
review consults retain the path gate without silently enabling this delegate
contract.

## Oracle Provider

```bash
stamp="$(date -u +%Y%m%dT%H%M%SZ)"
mkdir -p .ai/harness/handoff/gptpro
repo-harness chatgpt browser-consult \
  --repo . \
  --provider oracle \
  --prompt "Review this PRD and return risks." \
  --file plans/prds/example.prd.md \
  --follow-up "Challenge your previous recommendation." \
  --write-output ".ai/harness/handoff/gptpro/chatgpt-review-${stamp}.md"
```

The wrapper maps repo-harness input to `oracle --engine browser --browser-archive never`, passing an internal managed `--write-output` answer file. Oracle runs in a repo-harness-controlled `ORACLE_HOME_DIR` under `.ai/harness/chatgpt/oracle-home/`, with a neutral temporary working directory and absolute `--file` paths. The child process also drops inherited `ORACLE_*` environment variables before setting that controlled home. This prevents user or repository `.oracle/config.json` defaults such as `promptSuffix`, `browser.manualLogin`, remote browser routing, or model strategy from influencing the submitted prompt. When a ChatGPT profile binding exists, repo-harness also derives the selected Chrome profile cookie database (for example `<user-data-dir>/Profile 1/Cookies`) and passes it through Oracle `--browser-cookie-path`; the cookie DB must be a readable regular file, and the provider fails closed with `ORACLE_PROFILE_COOKIE_NOT_FOUND` rather than silently falling back to Oracle's own/default browser session. If no explicit `--model` is requested, repo-harness passes `--browser-model-strategy current` so Oracle keeps the signed-in browser's current ChatGPT model instead of depending on the model picker. If `--model` is requested, repo-harness passes `--browser-model-strategy select` so GPT Pro facades can guarantee a Pro model request. **The answer file plus the process terminal state are authoritative; stdout/stderr are treated as logs only** (used to detect the ChatGPT conversation URL and provider session ID, never as the answer). A clean exit that produces no answer file is reported as `recoverable` / `ORACLE_CAPTURE_INCOMPLETE` (the prompt may already be submitted — reattach with `browser-followup` rather than re-sending).

The oracle binary is resolved in a fixed, auditable order — `--oracle-bin`, then `REPO_HARNESS_ORACLE_BIN`, then repo-local `node_modules/.bin/oracle`, then `oracle` on `PATH`. A missing binary fails with `ORACLE_NOT_INSTALLED`; explicitly configured binaries (`--oracle-bin` or `REPO_HARNESS_ORACLE_BIN`) fail closed when invalid and do not silently fall through to the next source. repo-harness never implicitly downloads or `npx`-executes an unpinned oracle. `browser-doctor --provider oracle --json` runs `--help`, `--debug-help`, `--version`, plus an isolated `--browser-thinking-time` dry-run parser probe, and reports `installed`, resolved `binary`, `version`, `nodeCompatible`, a `capabilities` map (`browserEngine`, `writeOutput`, `browserFollowup`, `sessionFollowup`, `browserArchive`, `browserModelStrategy`, `browserCookiePath`, `browserThinkingTime`, `chatgptUrl`, `heartbeat`), and opt-in `agent_actions` when a GPT Pro setup repair can install, upgrade, or re-point the selected pinned external CLI; `status:"ready"` requires every capability for every flag repo-harness may send at runtime.

When a ChatGPT MCP Connector app must be active for read-back, use `--chatgpt-app <serverName>` with the server name recorded by `repo-harness mcp doctor --repo <repo> --json` under `chatgpt.serverName`. repo-harness maps that to Oracle `--browser-app <serverName>` so Oracle selects the composer app before submitting the prompt. This is an opt-in capability: it is reported under `oracle.optionalCapabilities.browserAppPreselect` and is required only when `--chatgpt-app` is present. If the selected Oracle binary lacks `--browser-app`, the run fails before prompt submission with `ORACLE_APP_PRESELECT_UNSUPPORTED`; do not rely on plain prompt text such as `@serverName` as evidence that ChatGPT exposed MCP tools.

App selection and tool availability are separate gates. `--chatgpt-app` only
selects the Connector in the composer; ChatGPT can still see a stale scanned
tool schema. If a run proves the app is selected but ChatGPT reports a specific
tool unavailable, compare the live MCP `/mcp` `tools/list` against the
Connector's visible tools and use ChatGPT Connector **Scan Tools** to refresh the
schema.

Long Oracle browser runs default to `--heartbeat 59`. repo-harness streams Oracle diagnostics and heartbeat lines to stderr while preserving stdout for the final JSON payload, so humans and agents get a periodic liveness signal without breaking automation that parses command output.

Oracle browser mode supports model selection through `--model` and thinking intensity through `--browser-thinking-time <level>`. repo-harness passes its `--thinking` value through to that Oracle browser flag verbatim after doctor has verified parser support; Oracle is the validation authority and rejects invalid levels fail-closed (Oracle 0.18 accepts `light`, `standard`, `extended`, `extra-high`, `pro`, `heavy`, plus ChatGPT UI aliases `instant`, `medium`, `high`, `xhigh` — e.g. GPT-5.6 Pro is `--model gpt-5.6-sol --thinking pro`). Oracle also supports `--browser-manual-login`, but repo-harness intentionally does not send it on the bound-profile path because it skips cookie copy and would make the selected Chrome profile cookie DB non-authoritative.

Use the Oracle CLI, not `oracle-mcp`, as the repo-harness provider runtime. `oracle-mcp` is useful when an external MCP host wants Oracle as a tool, but repo-harness needs per-run isolation for `ORACLE_HOME_DIR`, working directory, `ORACLE_*` environment, `--write-output` answer authority, session metadata, and fail-closed capability probes. A long-lived MCP server would move those boundaries into process state, so it remains an optional external integration surface rather than the default ChatGPT browser provider.

Multi-turn works two ways: repeat `--follow-up` within one run, or reopen a saved conversation later with `browser-followup --session <id>` (which passes oracle `--followup <providerSessionId>`). A follow-up records the parent `providerSessionId`, only resumes from a session that reached a resumable terminal state, and uses the binding recorded on the parent repo-harness session. If the parent session predates binding metadata, repo-harness does not inject the current repository binding into the follow-up command.

The doctor status taxonomy is distinct per provider (no single overloaded `partial`): oracle -> `ready` | `unavailable` (`ORACLE_NOT_INSTALLED`) | `action_required` (`ORACLE_INCOMPATIBLE`); native -> `deprecated` (`NATIVE_PROVIDER_DEPRECATED`).

`--write-output` is validated by repo-harness before the provider runs. By default it must be repo-relative, must not target denied paths, and must not overwrite an existing file unless `--overwrite-output` is passed. GPT Pro review/handoff outputs should live under `.ai/harness/handoff/gptpro/` and include a timestamp (and, when known, the reported session id) in the filename; fixed names such as `chatgpt-review.md` are too easy to confuse with a previous ChatGPT session. Absolute output paths require the human-only `--allow-absolute-output` flag and are not available through MCP browser tools.

GPT Pro consults often behave like research. Keep raw model replies in `.ai/harness/handoff/gptpro/` as local evidence, then promote durable conclusions into `docs/researches/YYYYMMDD-<topic>.md` as a curated synthesis. A promoted research note should cite the raw artifact path, repo-harness `sessionId`, upstream provider session id when present, requested model, capture timestamp, and conversation URL when available. Do not make the raw model answer itself the long-term source of truth; Codex or the human reviewer still owns the distilled conclusion and verification.

## Native Provider Spike

```bash
repo-harness chatgpt browser-doctor --repo . --provider native
repo-harness chatgpt browser-consult \
  --repo . \
  --provider native \
  --prompt "Reply exactly OK"
```

The native provider launches installed Google Chrome and drives it through a local Chrome DevTools Protocol websocket. It opens ChatGPT Web, waits for a visible composer, submits the assembled prompt, waits for an assistant response, and saves the captured text into the same repo-local session store.

Native provider consults require a bound ChatGPT product session in a non-default automation profile. Configure it with `browser-setup --profile-dir <dir>` and sign in to ChatGPT in that selected profile, or pass an explicit non-default `--profile-dir` for an ad hoc diagnostic run. Existing default Chrome profiles should use `--provider oracle`. The saved binding also carries the Chrome channel and ChatGPT URL, so normal consult and follow-up commands do not need to repeat them.

Native provider runs use the current model and thinking mode already selected in the ChatGPT Web UI. Passing `--model` or `--thinking` with `--provider native` fails closed with `NATIVE_MODEL_SELECTION_UNSUPPORTED`; use the Oracle provider when provider-side model selection is required.

Failure is explicit:

- Missing Google Chrome reports `NATIVE_PROVIDER_FAILED` with the missing app path.
- Missing profile binding reports `NATIVE_PROFILE_NOT_BOUND`.
- Default Chrome data directory usage reports `NATIVE_DEFAULT_PROFILE_CDP_BLOCKED` / `blocked_default_profile`.
- Unsupported native model/thinking selection reports `NATIVE_MODEL_SELECTION_UNSUPPORTED`.
- Missing login or composer reports `LOGIN_OR_COMPOSER_NOT_READY`.
- A submitted run with no captured assistant text reports `ASSISTANT_CAPTURE_TIMEOUT`.
- A submitted run whose assistant text did not stabilize before timeout reports `ASSISTANT_CAPTURE_INCOMPLETE`.

For first login on the deprecated native path, run `browser-setup --profile-dir <non-default-dir>`, open Chrome with that profile, sign in to ChatGPT, then rerun `browser-doctor --provider native --validate-session`.

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

Follow-up sessions are linked with `sourceSessionId` in `meta.json`. The Oracle provider receives `providerSessionId` from the source session as upstream provider context; it does not pass the repo-harness local `chgpt_...` session ID as an Oracle session. Dry-run follow-ups still write a linked local session without opening a browser. A source session carrying `meta.security.promptSecretScan` makes every follow-up scan-bound automatically; Gitleaks must remain resolvable, and scan failure occurs before the linked session or provider call.

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

MCP browser consults restrict `writeOutput` to repo-harness workflow artifacts such as `.ai/harness/handoff/*.md`, `tasks/reviews/**`, `.ai/harness/checks/**`, `plans/prds/**`, and `plans/sprints/**`. Absolute paths, source paths, package manifests, lockfiles, secrets, and existing files without `overwriteOutput: true` are rejected before provider execution.

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
Allowed-path symlinks that resolve outside the repository are rejected.
For delegate mode, path policy is only the first gate: `--secret-scan` also
scans the fully rendered allowed content. Path acceptance alone is not evidence
that a file is safe to send.

## Security Notes

- Keep browser profiles and local config uncommitted.
- Prefer product-session binding over copying cookies or launching an unrelated fresh profile.
- Do not expose Chrome remote debugging outside localhost without an explicit tunnel/security plan.
- Use `--dry-run --secret-scan` before sending any delegate context; transport
  the exact saved and hash-verified `prompt.md`, without later additions.
- Prefer narrow files over whole-repo dumps.
- Treat generated ChatGPT output as review input, not authoritative code truth.
