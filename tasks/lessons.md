# Lessons Learned (Self-Improvement Loop)

> Capture correction-derived prevention rules here.
> Promote repeated patterns into durable project rules during spa day.

## Template
- Date:
- Triggered by correction:
- Mistake pattern:
- Prevention rule:
- Where to apply next time:

## Command facade skills must register standalone, not only the umbrella
- Date: 2026-06-18
- Triggered by correction: User reported only the umbrella `repo-harness` skill was discoverable in Claude Code; the 19 `assets/skill-commands/repo-harness-*` facades were invisible.
- Mistake pattern: `sync-codex-installed-copies.sh` linked only the package root as `~/.claude/skills/repo-harness` (and the Codex canonical copy), so facades existed only nested inside that copy and the host never registered them as their own skills.
- Prevention rule: When facades are added/removed under `assets/skill-commands/repo-harness-*`, the installed-copy sync must register each as a standalone host skill in both the Codex and Claude skill roots, for link and copy modes. Drive it off the directory glob (each facade dir has a self-contained `SKILL.md`).
- Where to apply next time: `scripts/sync-codex-installed-copies.sh` (`sync_command_facades`) plus its coverage in `tests/installed-copy-sync.test.ts`; keep both in sync with the facade catalog in `assets/skill-commands/manifest.json`.

## ChatGPT browser engine is Oracle-first; native deprecated, bridge experimental
- Date: 2026-06-18
- Triggered by correction: User rejected the heavy "reliable bridge capture" plan and re-scoped to Oracle-owned browser automation, keeping only two cheap bridge safety patches.
- Mistake pattern: Investing in the bridge DOM-capture path (MAIN-world SSE hook, read-only extraction) as if bridge were a near-product fallback, when the maintained main path should be `oracle --engine browser` and bridge is not yet reliable enough to be a fallback.
- Prevention rule: Treat `oracle` as the default main path (always pass `--engine browser` plus explicit runtime flags that are present in `oracle --help`), `native` as deprecated (diagnostic-only, slated for removal), and `bridge` as experimental/explicit-only with no auto-fallback. Never auto-fall back from Oracle to another provider — Oracle may have already submitted the prompt before a capture drop, so post-submit failures are `recoverable` (return `providerSessionId` to reattach), not retried. Oracle output authority is the `--write-output` answer file plus the terminal exit state; stdout/stderr are logs only. Resolve the oracle binary through a fixed order (`--oracle-bin` → `REPO_HARNESS_ORACLE_BIN` → `node_modules/.bin` → PATH) and never implicitly download/`npx` an unpinned oracle. Doctor must run a `--help`/`--version` capability probe and use a per-provider status taxonomy instead of a single overloaded `partial`.
- Where to apply next time: `src/cli/chatgpt-browser/oracle-provider.ts`, `engine.ts` (`browserDoctor`, `runBrowserConsult`, `runBrowserFollowup`), and `docs/repo-harness-chatgpt-browser-engine.md`; the localhost bridge also requires a per-binding capability token and a server-side `completed`→`failed` backstop for empty/status-only captures.
- Follow-up correction: Oracle doctor readiness must require every flag repo-harness may send at runtime (`--browser-archive`, `--browser-follow-up`, `--followup`, `--browser-model-strategy`, `--browser-cookie-path`, `--browser-thinking-time`, `--chatgpt-url`, etc.), not only the initial consult flags. Hidden Oracle browser flags may be absent from normal `--help`, so probe `--debug-help` and use an isolated no-send parser/dry-run check for `--browser-thinking-time`. Explicit binary configuration (`--oracle-bin` or `REPO_HARNESS_ORACLE_BIN`) must fail closed when invalid and must not silently fall through to PATH. Oracle runs must use a repo-harness-controlled `ORACLE_HOME_DIR`, neutral cwd, absolute attachment paths, and sanitized `ORACLE_*` env so user/repo `.oracle/config.json` cannot append prompt suffixes, flip manual-login, switch model strategy, or route to a remote browser. Oracle must honor the repo-local ChatGPT profile binding; if `Profile 1` is bound, derive that profile's readable regular cookie DB file and do not silently run against the default Chrome/Oracle browser profile. Follow-ups must use the parent session binding; do not inject a changed current binding into an old saved session.
