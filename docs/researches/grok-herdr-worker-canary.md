# Grok interactive Herdr worker canary

Date: 2026-10-02 (Asia/Singapore). Implementation base: `9aef6693`.
Scope: MCP interactive worker admission and a local TTY canary. Generic review,
Receipt, main, and E2/S4 worktrees are outside this change.

## P1: boundary

`src/cli/mcp/types.ts` owns the MCP runner name type; `server.ts` parses CLI,
environment and user-config allowlists; `policy.ts` supplies the orchestrator
runtime default; `tools.ts` owns the advertised schema and admission checks;
`setup.ts` owns new-install defaults, the generated guide and doctor output.
The runner stays disabled until explicitly enabled. Existing operator allowlists
are preserved. Defaults add Grok to Codex; Claude remains explicitly selectable.

`src/effects/terminal/task-session.ts` owns pane/process identity, request/result
binding and cleanup. `herdr.ts` owns explicit endpoint addressing. Both already
accept Grok without edits. The external Grok CLI owns its permissions, MCP,
hooks and TUI; repo-harness does not reinterpret these as verified capabilities.

## P2: traced path

`createMcpToolContext` resolves `devRunnerAgents` → environment → local config,
normalizes and deduplicates the names, and passes them to `getMcpPolicy`.
`run_agent_goal {agent: "grok", herdr: {endpoint, parent_pane}}` checks enablement,
agent admission and the fixed task-goal path before constructing
`TaskAgentSpec.harness_kind = "grok"`. `startTaskAgent` launches Herdr's
`agent start --kind grok`; task-session requires the same pane, process and
`agent.agent === binding.harness_kind`. Request delivery names `context_ref`
and `result_ref`; a matching Result, rather than an idle heartbeat, owns
completion. Failures and missing results cancel the owned pane.

The deterministic existing Herdr lifecycle fixture now also exercises Grok
through MCP, a real disposable Herdr server, result writing and owned cleanup.
Its fake model peer proves transport, not the Grok CLI's capabilities.
The separate real canary below uses the installed CLI directly in a scratch
pane and checks its output file; it does not claim an end-to-end real-model
`run_agent_goal` invocation or Receipt acceptance.

## P3: decision

Extend existing admission surfaces directly. Update `policy.ts` as well as setup
and doctor so launches without stored config use the same default. Retain the
explicit enablement and allowlist gates, task-session identity checks and
unverified real-harness capabilities. No dependency or abstraction is added.
At 10x concurrency, interactive startup/approval waits and provider request
latency are the first pressure points; this change does not widen that scope.

## Real CLI canary

Local Grok: `1.0.44 (5b807183dd79)`. Herdr client: `0.9.3`; live server:
`0.9.1`, protocol 22, endpoint compatible. Grok's selected model was displayed
as `Grok 4.7 (high)`; no model identity attestation is claimed.
Scratch: `/private/tmp/grok-herdr-canary-uu80t7xv`, pane `w8:pF`, name
`grok-canary`. Raw local observations: `start-2.json`, owner live `agent get` output,
`request-1.json`, `result-1.json`, `transcript-1.md` in that scratch directory.

```sh
herdr agent start grok-canary --kind grok --pane w8:pF --timeout 30000 -- \
  --permission-mode dontAsk --no-subagents --disable-web-search \
  --allow 'Bash(python3 *)'
```

- Start returned exit 0, `agent: "grok"`, `interactive_ready: true`, `idle`,
  state sequence 2310. A submitted request produced `working` (2311), then
  `done` (2313). Herdr's `done` is a settled idle state awaiting input.
- Prompt: `Read task request <scratch>/request-1.json; write its result only to
  <scratch>/result-1.json. Follow context_ref. Use python3 for the authorized
  result write.` Grok read the request and context, used Python to write a
  sibling temporary file, flush/fsync it and `os.replace` it to `result_ref`,
  then read the final JSON. Owner readback matched the exact request id
  `1ad7daf7-45c4-418e-ab8f-ef7ecd831da0`, context SHA256
  `b1d6a7ede501de884789dd58d062159c8c59beb5f526493099879d11d3cd6b8b`
  and `value: "grok-canary-ok"`.
- First-run UI observed on this already-authenticated operator installation:
  “Help improve Grok”, `[Opt out] [Opt in]`, retention off by default; no opt-in
  was selected. No authentication or folder-trust dialog was observed. This is
  not evidence about a clean installation's onboarding.
- The update banner offered `1.0.46` / `Ctrl+U`. Grok updated its executable
  links automatically on exit, without Ctrl+U being sent. The cached 1.0.44
  executable links were restored, and subsequent scratch launches exported
  `GROK_DISABLE_AUTOUPDATER=1`. The brief 1.0.46 startup is excluded from
  1.0.44 evidence. Final CLI version and pane cleanup are recorded below.

### Herdr detection result

Idle/readiness and active working detection succeeded. **Blocked question
detection did not**: on a second 1.0.44 session Grok invoked
`ask_user_question` for A/B and displayed `Waiting on answers for Which option
do you choose?`, with `Tab:next answer | Esc:scrollback | Shift+x:dismiss`.
Herdr still returned `working`, state sequence 2322. `agent explain --json`
reported manifest `2026.09.18.1`, matched `osc_title_working`, and
`visible_blocker: false`. `herdr agent wait grok-canary --until blocked
--timeout 3000` returned exit 1 / `timeout` while the question was pending.
Artifacts: `question-state.json`, `question-visible.txt`,
`question-explain.json`, `question-process.json`, `blocked-wait.json`.
This is a real question-dialog counterexample; permission-dialog detection
remains unverified because no permission prompt was produced in this environment.
No Herdr detection rules are changed by this PR.

### Permission result

`--permission-mode dontAsk` did **not** deny the unlisted mutation in the real
canary: Grok's Bash tool ran exactly `touch denied-unlisted.txt`, exit 0, and
owner readback confirmed the file exists. Only `Bash(python3 *)` had been added
by this invocation. The exported transcript confirms the exact Bash command;
the result is not inferred from the model's final message alone.

The operator's imported `~/.claude/settings.json` has
`permissions.defaultMode = "bypassPermissions"` and MCP-only allow rules;
Grok inspect reported 10 loaded permission entries. Disabling Claude/Cursor
compatibility imports for hooks, rules and MCP did not remove this settings
permission source. This is a relevant configuration confounder, not proof of
the CLI's internal precedence. A second 1.0.44 launch with `--permission-mode
default` also executed an unlisted scratch `touch` without an approval dialog.
Therefore this environment does not establish a closed allowlist or read-only
security boundary. Grok's installed permission guide describes `dontAsk` as
denying actions needing approval, with built-in read-only handling still
allowed; the observed mutation must take precedence over that documentation
when assessing this canary.

### MCP and hooks controls

Evidence comes from the installed 1.0.44 CLI help, `grok inspect --json`, and
`~/.grok/docs/user-guide/{05-configuration,07-mcp-servers,10-hooks,22-permissions-and-safety}.md`.
No global hooks or permission settings were edited for this change.

- Imported MCP: export `GROK_CLAUDE_MCPS_ENABLED=0` and
  `GROK_CURSOR_MCPS_ENABLED=0`; disable managed MCP with
  `GROK_MANAGED_MCPS_ENABLED=0`. Native server configuration remains a separate
  surface: `grok mcp disable <name>` persists the personal disabled state in
  `~/.grok/config.toml` (`disabled_mcp_servers`, and `enabled = false` on an
  existing native entry). Use `/mcps` for managed gateway connector toggles.
- Imported hooks: export `GROK_CLAUDE_HOOKS_ENABLED=0` and
  `GROK_CURSOR_HOOKS_ENABLED=0`, or configure `[compat.claude] hooks = false`
  and `[compat.cursor] hooks = false` in user config. Inspect showed imported
  Claude hook entries as `compatibilityStatus: "disabled"` with these flags.
  Native and plugin hooks are separate: use `/hooks`, select each hook and
  press Space to disable it; disable the originating plugin if appropriate.
  Enforced policy hooks cannot be disabled this way. The CLI has no advertised
  universal `--no-hooks` / `--no-mcp` switch.
- `GROK_CONFIG_PATH` is an allowlisted **overlay**, not a replacement config.
  The attempted scratch overlay did not disable compatibility tables or
  `disabled_mcp_servers`; do not use that technique as an isolation claim.
  `grok inspect` can show discovery entries and plugin placeholders, so verify
  the live `/hooks` and `/mcps` states before claiming every source is off.

## Capabilities and cleanup

`read_only` and `resume` remain `{status: "unverified", evidence_ref: null}`.
Result-file success and basic TUI detection do not verify those capabilities,
permission isolation, restart/resume continuity or generic review/Receipt.

Owned scratch pane `w8:pF` was closed with `herdr pane close`, exit 0.
Subsequent pane and agent gets returned `pane_not_found` and `agent_not_found`.
Final `grok --version` again returned `1.0.44 (5b807183dd79)`.
The first attempted scratch pane (`w8:pE`, created with `--env`) disappeared
before agent start; no Grok was launched there. No preexisting pane was reused or
closed; only the pane created for this canary was closed.

## Local verification

- `bun install --frozen-lockfile`: exit 0; installed existing locked dependencies
  into this previously empty worktree. No manifest or lockfile changes.
- `bun test tests/cli/mcp-setup.test.ts tests/cli/mcp-tools.test.ts
  tests/cli/mcp-policy.test.ts --timeout 60000`: 70 pass, 0 fail.
- `bun test tests/herdr-task-lifecycle.test.ts --timeout 60000`: 6 pass, 0 fail,
  including MCP→Grok fixture result and cleanup; 133.26 seconds.
- `bun run check:type`: exit 0.
- Root required integrity checks: hook/helper/reference projections,
  deployment SQL order, architecture sync/projection, task sync, strict workflow,
  project-state inspect and `init --dry-run`; final dispositions are recorded in
  the Grok worker workstream.

The two new test cases cover config/environment/CLI normalization and
allowlist/endpoint rejection. Existing setup coverage also checks defaults and
doctor; the lifecycle fixture adds the distinct process/result/cleanup boundary.
No new test file, dependency or abstraction was needed. This research file
preserves the requested real canary and control limitations; the workstream
file satisfies the repository's canonical task-sync evidence boundary.
