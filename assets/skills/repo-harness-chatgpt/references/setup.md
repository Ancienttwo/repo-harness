# Setup Mode: Oracle Browser + MCP Connector

Reconciles the `repo-harness-gptpro-setup` facade, the `repo-harness-chatgpt-bridge`
Setup mode, and the `repo-harness-chatgpt-browser` profile-binding rules into one
source.

## Two Lanes

- `gptpro_browser`: local repo-harness calls an already logged-in ChatGPT Web
  session through `repo-harness chatgpt browser-*`, Oracle-first.
- `gptpro_mcp`: ChatGPT connects back to the local repo through
  `repo-harness mcp serve --transport http` and the Connector.
- ChatGPT Pro Web access is not OpenAI API quota or an API key substitute;
  never create API keys or billing projects from a ChatGPT Pro subscription.

## Advisory Orchestration Enablement (Explicit Opt-In)

Use this lane only after the user explicitly enables GPT Pro orchestration for
the current repository and task. Enablement is task-scoped guidance, not a new
install profile, managed fleet role, persistent schema, or grant of local
write/lease/acceptance authority. Do not start an orchestration conversation
until every prerequisite below is observable; a missing prerequisite returns
to this guide and stops closed.

1. Project the canonical Skill from a durable checkout, if it is not already
   discoverable:

   ```bash
   repo-harness chatgpt install-skill --target both
   ```

   Use `--dry-run` first when inspecting an unfamiliar host. A projection from
   a contract worktree is verification-only because worktree cleanup can leave
   a dangling symlink; re-project from the durable checkout before use.
2. Check the selected ChatGPT Web browser path (including the Codex built-in
   browser/IAB when that is the transport) and the visible Pro model. For
   Oracle, run:

   ```bash
   repo-harness chatgpt browser-doctor --repo <repo> --provider oracle --json
   ```

   The user must resolve sign-in, captcha, SSO, or model-plan prompts in the
   browser. Never request credentials or switch silently to native/CDP.
3. If the orchestration prompt needs the repo-harness ChatGPT Connector,
   configure and verify that local server separately:

   ```bash
   repo-harness mcp setup chatgpt --repo <repo> --server-name <name>
   repo-harness mcp doctor --repo <repo> --json
   ```

   `chatgpt.serverNameConfigured:true` and the expected server name are
   required before starting a sidecar. This local Connector is not a substitute
   for the user's separately authorized GitHub Connector in ChatGPT Web.
4. In ChatGPT Web, select the user's authorized GitHub Connector for the new
   conversation. Record the canonical repository, target ref, and exact remote
   commit SHA that the task is allowed to use. A model claim that it used
   GitHub MCP is not invocation evidence; the orchestration protocol classifies
   observable use as `verified`, exact supplied context as `bundle_only`, and
   everything else as `unverified`.
5. Snapshot the local worktree separately from the remote facts. Include the
   current base commit, tracked diff, and hashed untracked-file manifest only
   through the existing policy-checked bundle path; this is the local delta
   identity used by the review loop. Before any real submission,
   run the exact prompt through the fail-closed secret gate:

   ```bash
   repo-harness chatgpt browser-consult \
     --repo <repo> --provider oracle --dry-run --secret-scan \
     --prompt "<orchestration brief>" --file <safe-context-file>
   ```

   Compare the saved `prompt.md` hash with the scan receipt; do not add an
   unscanned attachment or paste a changed local delta into the browser.
6. Only after the checklist passes, read `references/orchestrate.md` and start
   the plan/review loop. If the remote SHA, local-delta hash, Connector
   visibility, Pro model, attachment, generation completion, or conversation
   handle cannot be verified, stop without transport fallback or inferred
   success.

## Host Skill Projection

The canonical package remains under
`assets/skills/repo-harness-chatgpt/`; default minimal/full install profiles do
not expose it. Project that one byte source explicitly into the host discovery
roots:

```bash
repo-harness chatgpt install-skill --target both
```

Use `--target codex` or `--target claude` for one host. The command validates
the complete canonical package and creates an owned symlink named
`repo-harness-chatgpt` under each selected host's `~/.codex/skills/` or
`~/.claude/skills/`. It is idempotent and refuses a directory, broken symlink,
or symlink owned by another source instead of overwriting it. Remove only an
owned projection with `repo-harness chatgpt uninstall-skill --target <target>`.
Both commands support `--dry-run`; neither changes an install profile.

Delegate mode also requires a trusted Gitleaks CLI >= 8.19. Install it through
the operator's normal package-management policy and verify `gitleaks version`;
repo-harness never downloads or upgrades it automatically. The delegate
dry-run with `--secret-scan` is the authoritative readiness check.

The projected symlink binds to the CLI checkout that ran `install-skill`,
not a fixed install location. If that checkout is a contract worktree,
merge-time worktree cleanup leaves the symlink dangling: the host silently
loses skill discovery, and the installer's broken-symlink fail-closed check
then refuses a direct reinstall. Recover by removing the two dangling
symlinks under each host's skills root, then rerunning `install-skill` from
a durable checkout (the primary clone or an already-installed package).
Run the real projection only from a durable checkout; treat a worktree run
as verification-only and re-project from the durable checkout afterward.

## Oracle Browser Provider

1. Oracle's published CLI requires `node >=24`; satisfy that inside the pinned
   Oracle install or explicit binary path (`--oracle-bin` /
   `REPO_HARNESS_ORACLE_BIN`). Do not raise repo-harness' overall runtime floor
   or add Oracle as an implicit dependency just for GPT Pro.
2. Check readiness: `repo-harness chatgpt browser-doctor --repo <repo> --provider oracle --json`.
3. If the doctor reports `ORACLE_NOT_INSTALLED` or
   `ORACLE_INCOMPATIBLE`/`nodeCompatible:false`, fix the Oracle install/runtime
   and rerun doctor; do not lower repo-harness' own runtime constraints instead.
4. Treat `agent_actions` such as `chatgpt-oracle-install-pinned`,
   `chatgpt-oracle-upgrade-pinned`, or `chatgpt-oracle-fix-configured-source` as
   opt-in GPT Pro setup/repair actions only; never run them from a default
   install or an unrelated setup check.
5. Do not `npx` or auto-download Oracle during setup; prefer an auditable
   pinned binary path.

## Chrome Profile Binding

1. Ask which Chrome profile directory should own the ChatGPT session, or use a
   path the user already gave.
2. `repo-harness chatgpt browser-setup --repo <repo> --profile-dir <dir> --browser-channel chrome`
3. Rerun `browser-doctor --provider oracle --json`; the Oracle path fails
   closed rather than silently falling back to an unbound/default profile.
4. Do not route through the removed Chrome extension provider or `browser-bind`.

## MCP Connector

1. Ask for the Connector/server name the user will create, or default to
   `repo-harness`; record it instead of hard-coding a personal name later.
2. `repo-harness mcp setup chatgpt --repo <repo> --server-name <name>`
3. `repo-harness mcp doctor --repo <repo> --json`; verify
   `chatgpt.serverNameConfigured` is true and matches the selected Connector.
4. Start the sidecar only when the user is ready to connect ChatGPT:
   `repo-harness mcp serve --repo <repo> --transport http --host 127.0.0.1 --port 8765 --profile planner --enable-chatgpt-browser`.
5. ChatGPT Connector setup still needs an HTTPS tunnel/public `/mcp` endpoint
   and manual Connector creation in ChatGPT settings; prefer a stable
   named-tunnel hostname for recurring use over an account-less quick tunnel
   (smoke-test only, URL changes).
6. Never commit or write real domains, account/zone/tunnel IDs, tunnel tokens,
   OAuth passphrases, bearer tokens, or cookie/profile paths into tracked docs,
   notes, plans, reviews, or runbooks; keep real operator state under ignored
   `_ops/*`, `.repo-harness/*`, or `~/.repo-harness/*`.
7. If local Codex also needs repo-harness MCP tools, separately run
   `repo-harness mcp setup codex --repo <repo> --scope project`.

## Failure Modes

- `ORACLE_NOT_INSTALLED` / `ORACLE_INCOMPATIBLE`: fix the pinned Oracle
  binary/runtime before a real consult; do not fall back to native for
  anything but deprecated diagnostics.
- A user asking for `browser-bind` or the old Chrome extension path: report it
  as removed and use Oracle setup instead.
- ChatGPT Web needs manual login/captcha/verification: report the blocker and
  preserve the dry-run session artifact.
- `chatgpt.serverNameConfigured:false` or a missing `chatgpt.serverName`:
  setup is incomplete even when `mcp doctor` otherwise reports `ready_local`.
- A ChatGPT conversation says the selected app/MCP server is not exposed:
  refresh/reselect the app in a fresh conversation rather than trusting prompt
  wording alone.
- Any command that would print `.repo-harness/mcp.tokens.json`,
  `.repo-harness/mcp.oauth.json`, browser profile secrets, or cookies: redact
  the value and report only the file class.
- `PROMPT_SECRET_SCAN_UNAVAILABLE`: Gitleaks is missing, explicitly
  misconfigured, or older than 8.19; fix the selected binary and rerun the
  delegate dry-run without sending the prior bundle.
- Host projection finds an unowned or broken destination: preserve it and
  stop; never overwrite or unlink a user-owned Skill to make setup pass.

## Boundaries

- Does not create OpenAI API keys, billing projects, or credentials from a
  ChatGPT Pro subscription.
- Does not install/upgrade Oracle from a default repo-harness install; Oracle
  bootstrap is explicit GPT Pro setup/repair only.
- Does not install/upgrade Gitleaks or project the ChatGPT Skill from a default
  install profile; both are explicit delegate setup operations.
- Does not bypass ChatGPT Web rate limits, login checks, manual verification,
  or plan restrictions.
- Does not expose a local MCP server to the public internet without explicit
  auth, tunnel, and user intent, and does not enable `--enable-chatgpt-browser`
  silently.
- Does not commit `.repo-harness/` local auth files, browser profiles,
  cookies, tokens, or tunnel state.
