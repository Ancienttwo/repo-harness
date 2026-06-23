# repo-harness ChatGPT MCP Connector Setup

## Prerequisites

- At least one repo-harness adopted repository. New `repo-harness adopt`,
  `repo-harness init`, and user-scope ChatGPT setup register adopted repos in
  `~/.repo-harness/registered-repos.json`.
- A local `repo-harness` CLI on PATH.
- ChatGPT workspace access to Developer Mode and custom MCP Connectors.
- A stable public HTTPS `/mcp` endpoint for recurring ChatGPT Connector use. Local Codex can use stdio without a tunnel.

## Start Local MCP Server

Standard users run one MCP server and configure one ChatGPT Connector URL:

```bash
repo-harness mcp serve --repo . --transport http --host 127.0.0.1 --port 8765 --profile planner
```

The ChatGPT Connector registers the HTTPS endpoint, not a per-repo URL. The
server discovers target repos from the global registry, so any repo registered by
`repo-harness adopt`, `repo-harness init`, or user-scope MCP setup can be
selected by passing `repo_path` to workflow tools. The `--repo` value is only
the default repo/bootstrap context, not the only usable project.

Developer Mode should normally be configured at OS user level. This stores MCP
config, auth, and the registered repo index under `~/.repo-harness/`. Extra
non-repo document roots are optional and require explicit `--allow-root`:

```bash
repo-harness mcp setup chatgpt --scope user --repo . --endpoint <https-url>/mcp
repo-harness mcp serve --repo . --transport http --host 127.0.0.1 --port 8765 --profile planner
```

Optional external non-repo reader roots stay in the same Connector and must be
explicitly authorized:

```bash
repo-harness mcp setup chatgpt \
  --scope user \
  --repo . \
  --enable-reader \
  --allow-root "$HOME/Documents" \
  --allow-root "$HOME/Projects" \
  --endpoint <https-url>/mcp
```

Health check:

```bash
curl http://127.0.0.1:8765/health
```

The ChatGPT path uses OAuth with a local passphrase. The passphrase is stored in an ignored local file:

```bash
jq -r .passphrase .repo-harness/mcp.oauth.json
```

For user-scope setup, read the passphrase from `~/.repo-harness/mcp.oauth.json`.

Do not commit or paste this passphrase into issue trackers, PRs, or shared logs.

OAuth discovery smoke:

```bash
curl http://127.0.0.1:8765/.well-known/oauth-protected-resource/mcp
```

## Choose Tunnel Endpoint

For recurring ChatGPT Connector use, prefer a stable hostname from a named tunnel or reserved domain. Quick tunnels are useful for one-off smoke tests, but their URL changes and ChatGPT will treat the new URL as a different Connector app.

Stable Cloudflare named tunnel shape:

```bash
cloudflared tunnel login
cloudflared tunnel create repo-harness-mcp
cloudflared tunnel route dns repo-harness-mcp repo-harness-mcp.example.com
cloudflared tunnel run --url http://127.0.0.1:8765 repo-harness-mcp
```

Then regenerate this guide with the stable endpoint:

```bash
repo-harness mcp setup chatgpt --repo . --endpoint <https-url>/mcp
```

The endpoint is stored in ignored local config. The tracked guide stays placeholder-only so real operator domains do not enter source control.

One-off quick tunnel smoke:

```bash
cloudflared tunnel --url http://127.0.0.1:8765
```

Use this Connector URL:

```text
<https-tunnel-url>/mcp
```

## Create ChatGPT Connector

1. Open ChatGPT Settings.
2. Enable Developer Mode if your workspace exposes it.
3. Go to Connectors.
4. Create a Connector using the server name recorded in `.repo-harness/mcp.local.json` under `chatgpt.serverName` (new setup records the default `repo-harness` unless `--server-name` is provided).
5. Paste the HTTPS Connector URL ending in `/mcp`.
6. Configure Connector authentication as OAuth.
7. Click Scan Tools.
8. When the authorization page opens, enter the passphrase from `.repo-harness/mcp.oauth.json`.
9. Wait for the tool scan to finish, then create the Connector.
10. Keep write confirmations enabled.

After changing repo-harness versions or any MCP tool schema, restart
`repo-harness mcp serve`, rescan the Connector tools, and start a fresh ChatGPT
chat. If ChatGPT keeps an old schema, delete and recreate the App/Connector.

If `repo-harness mcp doctor --repo . --json` reports `chatgpt.serverNameConfigured:false`, rerun setup with `--server-name <connector-name>` before using GPT Pro MCP read-back prompts.

## Human Workflow

Use ChatGPT for planning and review. Use Codex for local execution.

1. Use the single configured Connector for workflow planning and repo tools.
2. Call `discover_harness_repos` to list registered adopted repos, then pass `repo_path` when targeting a specific project.
3. For registered repo document/code reading, call `list_allowed_roots` to get the stable `repo_id`, then use `get_repo_capabilities`, `repo_manifest`, `list_tree`, `stat_file`, `read_file`, `read_files`, and `search_text`.
4. For registered repo writes, first check `get_repo_capabilities.write_tools`; only repos explicitly configured as `read_write` expose `write_file` and `refresh_repo_index`.
5. Ask ChatGPT to turn the idea into a PRD with `write_prd_from_idea`.
6. Ask ChatGPT to turn the PRD into a checklist Sprint with `write_checklist_sprint`.
7. Ask ChatGPT to prepare a Codex Goal with `prepare_codex_goal_from_sprint`.
8. Open Codex locally and run the generated `/goal` prompt.
9. Let Codex execute one Sprint task card at a time, run checks, update the checklist, and stage each completed phase before continuing.

The sidecar is not a remote coding agent. It prepares workflow artifacts for the local agent host.

## General Repo Reader Contract

The general repo reader uses the registered repo whitelist as the repo-level
authorization boundary. GPT-facing calls use `repo_id` plus repo-relative paths;
they never require or return the local absolute repo root.

Inside an authorized repo, `.ignore` is the only content-level exclusion source
for the general repo API. Dotfiles, hidden directories, unknown extensions,
`.gitignore` matches, and ordinary source files are visible unless `.ignore`
excludes them. The `.ignore` file itself is treated as policy input, not as a
normal manifest entry.

Authorized file content is not implicitly redacted in `read_file`,
`read_files`, or `search_text` responses. The MCP audit path records tool name,
target path, input hash, status, and errors, but not file bodies.

`write_file` is the first general repo mutation tool. It is runtime-gated by the
registered repo access mode and returns `WRITE_DISABLED` for `read_only` repos.
New files require `must_not_exist: true`; replacements require
`expected_sha256`; mismatches return `REVISION_CONFLICT` without writing. A
successful write uses a same-directory temporary file plus atomic rename,
returns `before`, `after`, `diff`, `mutation_id`, and `index_state`, and leaves
CodeGraph refresh explicitly pending. Call `refresh_repo_index` with the changed
paths after a successful write to run CodeGraph sync, invalidate repo snapshot
caches, and receive the new `index_revision`, `snapshot_id`, `index_state`, and
refresh strategy. The bundled CLI adapter uses repo-level `codegraph sync` when
path-only refresh is unavailable and reports that tradeoff with
`path_refresh_supported:false`.

When a repo has a CodeGraph index, `repo_manifest`, `list_tree`, `stat_file`,
`read_file`, `read_files`, and `search_text` share a deterministic
`snapshot_id`, `ignore_digest`, and `index_revision`. CodeGraph inventory is
merged as indexed metadata (`indexed`, `codegraph_language`,
`codegraph_node_count`); the secure filesystem walker remains the source of
truth for complete manifest coverage. If a caller sends a stale `snapshot_id`,
the reader returns `SNAPSHOT_STALE` instead of silently mixing versions.
Each response also reports `snapshot_state`, creation/expiry time, TTL, and a
bounded snapshot cache marker. `snapshot_cache.key` is scoped by tool and
repo-relative path set; `snapshot_cache.snapshot_key` names the underlying repo
snapshot. Entry metadata is cached by repo, registry revision, `.ignore`
digest, path, and current stat signature, so warm calls can reuse unchanged file
metadata while file, registry, and `.ignore` changes produce a different
snapshot. Explicit `snapshot_id` stat/read calls can reuse a cached snapshot and
validate the requested file hash instead of rebuilding the full repo snapshot.
For large manifests, `repo_manifest` streams the visible tree and keeps only the
requested page entries in memory. Returned page entries include exact content
hashes; non-page file content metadata is deferred and reported as
`counts.content_deferred` until a later page, `stat_file`, `read_file`, or
`search_text` returns that content.
If CodeGraph still references a deleted indexed path or returns metadata that
no longer matches the filesystem, the response uses
`snapshot_state: "index_lagging"` and includes lagging paths under the
`codegraph` object.

Large-repo reader baselines are reproducible with:

```bash
bun run benchmark:mcp-reader -- --entries 10000 --json
```

Use `--entries all` for the full 10k/100k/500k fixture sequence.

CodeGraph search support is treated conservatively: current CodeGraph CLI query
is symbol-oriented, so general full-text `search_text` uses the same guarded
filesystem fallback while preserving `.ignore` semantics and indicating whether
the matched file is indexed by CodeGraph.

The older `open_workspace`, `tree`, and `read_text` tools remain compatibility
tools for the previous workspace reader surface. They still apply the legacy
deny/redaction behavior and should not be used as proof of the general repo
access contract.

## Dev Mode Agent Runner

The default planner Connector does not run Codex or Claude. If you intentionally want ChatGPT to trigger a local agent from MCP, use the `orchestrator` profile and enable the dev runner setting yourself.

Local config setting:

```json
{
  "devMode": {
    "agentRunner": true,
    "allowedAgents": ["codex"],
    "timeoutMs": 120000
  }
}
```

Equivalent one-shot launch:

```bash
repo-harness mcp serve --repo . --transport http --host 127.0.0.1 --port 8765 --profile orchestrator --enable-dev-runner --dev-runner-agents codex
```

Environment override:

```bash
REPO_HARNESS_MCP_DEV_RUNNER=1 REPO_HARNESS_MCP_DEV_RUNNER_AGENTS=codex,claude repo-harness mcp serve --repo . --transport http --profile orchestrator
```

When enabled, the server exposes `run_agent_goal`. The tool reads only `.ai/harness/handoff/codex-goal.md` and runs that fixed handoff through the allowed local CLI:

```text
codex exec --json --cd <repo> <goal>
claude -p <goal>
```

Keep this behind local Developer Mode and per-call confirmations. Do not expose an orchestrator tunnel to untrusted users.

## Agent Handoff Contract

The agent-facing Skill is installed at:

```text
.agents/skills/repo-harness-chatgpt-bridge/SKILL.md
```

Use it in Codex when continuing a ChatGPT-generated handoff:

```text
Use repo-harness-chatgpt-bridge.
Execute .ai/harness/handoff/codex-goal.md.
```

The Skill tells Codex to read the PRD and checklist Sprint, preserve stage gates, run focused checks, and stage each completed phase. It does not authorize ChatGPT to edit source code or run shell commands through MCP.

## Tool Chain

Expected planning chain:

```text
idea
  -> write_prd_from_idea
  -> write_checklist_sprint
  -> prepare_codex_goal_from_sprint
  -> local Codex /goal execution
```

Local fallback for the last handoff step:

```bash
repo-harness mcp prepare-goal --repo . --prd plans/prds/<feature>.prd.md --sprint plans/sprints/<feature>.sprint.md --reference-repo <optional-readonly-reference>
```

## Test Prompt

```text
Use repo-harness to inspect this repo. Call harness_status, latest_handoff, and list_workflow_files. Do not write files.
```

## Reader Test Prompt

```text
Use the repo-harness Connector. First call discover_harness_repos and choose the target repo. Then call list_allowed_roots and use the matching repo_id with get_repo_capabilities, repo_manifest, list_tree on ".", stat_file on README.md, read_file on README.md or docs/spec.md, and search_text for "repo-harness". Do not write files.
```

Blocked-file smoke:

```text
Use the general repo reader to try read_file with "../outside", an absolute path, and one path that the repo's .ignore excludes. These must return path-policy errors. If the repo contains an external symlink, read_file on that symlink must return SYMLINK_ESCAPE. Do not print file contents while testing blocked paths.
```

## Connector Invocation Evidence

Treat Connector readiness as four independent checks:

1. Endpoint: the sidecar and public HTTPS `/mcp` endpoint respond.
2. Schema: ChatGPT Connector settings show the expected Action after Refresh.
3. Selection: a fresh chat has the recorded Connector selected from `+` -> More.
4. Invocation: the current model surface emits a real tool call.

Only a visible `Called tool` event with the selected Action/result, or an
equivalent captured tool-call transcript, proves MCP invocation. Connector
selection, assistant self-report, plausible JSON, or sandbox shell commands do
not prove that ChatGPT called MCP.

For Pro runs, the normal tool-call runtime UI may not appear the way it does for
other models because Pro uses a sandbox/process flow. In the visible ChatGPT Web
UI, click the assistant's `Thinking` / `Thought for ...` disclosure to open
the right-side process pane. Use that pane to confirm whether Pro actually
emitted a `Called tool` event for the selected app, which action it chose, or
whether it only reasoned inside the sandbox without invoking MCP. If the pane
shows sandbox-only exploration, or the answer reports `app_unavailable` without
a tool event, classify the outcome as `surface_blocked`, not as a broken repo
or sidecar.

Detailed Pro Extended planning and review tasks commonly take 15 minutes or
more. When driving Pro through the browser path, do not treat elapsed time as
failure while the session is still alive; wait for a final answer or a concrete
browser, login, capture, or tool-call failure. Keep the Oracle heartbeat enabled;
heartbeat diagnostics such as `no thinking status detected yet` are progress
signals, not blockers by themselves.

Outcome labels:

- `invocation_verified`: real `Called tool` event or captured tool-call transcript.
- `approval_pending`: a real tool request produced a confirmation prompt.
- `surface_blocked`: schema is current, but the current model surface did not call MCP.
- `bundle_fallback`: Pro is reviewing a local evidence bundle and did not read through MCP.

When Pro is `surface_blocked`, use `repo-harness-gptpro` to send a bounded
local evidence bundle through the existing Oracle/browser handoff. The bundle
must say it was produced locally, list included and omitted/truncated material,
and include:

```yaml
source: local_repo_harness_bundle
pro_invoked_mcp: false
working_tree: clean | dirty
```

Do not claim MCP read-back evidence for fallback output. Pro can plan or review
the supplied bundle, while Codex still executes and verifies locally.

Permission scope is separate from invocation evidence. Standard user-scope setup
uses the global registered repo index, not one Connector per project. Random
external directories are still excluded unless the local user adds explicit
`--allow-root` entries; broad full-disk read is not a supported default.
Repo-scope setup remains for repo-local guide/auth compatibility, but it is not
the recommended ChatGPT Connector shape for users working across projects.

## PRD Prompt

```text
Use repo-harness discover_harness_repos first, choose the target repo_path, inspect docs/spec.md, tasks/current.md, latest handoff, and existing plans in that repo, then convert this idea into a PRD with write_prd_from_idea using the same repo_path. Do not edit source code.
```

## Checklist Sprint Prompt

```text
Use repo-harness to read the target repo PRD by repo_path. Convert it into an ordered checklist Sprint with write_checklist_sprint using the same repo_path. Every task card must include a stage gate that requires Codex to stage the completed phase before continuing.
```

## Codex Goal Prompt

```text
Use repo-harness prepare_codex_goal_from_sprint with repo_path, the PRD path, and the checklist Sprint path. Return the host-native /goal prompt. Do not run Codex remotely.
```

Equivalent local CLI:

```bash
repo-harness mcp prepare-goal --repo . --prd plans/prds/<feature>.prd.md --sprint plans/sprints/<feature>.sprint.md --reference-repo <optional-readonly-reference>
```

## Codex Executor Prompt

```text
Use repo-harness-chatgpt-bridge. Execute the latest ChatGPT-generated Codex goal from .ai/harness/handoff/codex-goal.md.
```

## Troubleshooting

- If ChatGPT cannot connect, verify the tunnel URL is HTTPS and ends in `/mcp`.
- If ChatGPT returns unauthorized, verify OAuth discovery works and re-run the authorization passphrase flow.
- If tools are missing, restart `repo-harness mcp serve` and rescan tools.
- If writes fail, verify the target path is a PRD, sprint, plan, or approved handoff file.
- If ChatGPT generated prose instead of checklist Sprint task cards, ask it to use write_checklist_sprint.
- If Codex cannot see the server, run `repo-harness mcp setup codex --repo . --scope project`.

## Security Notes

- The default planner Connector exposes workflow planning tools plus read-only access to registered adopted repos' non-ignored files.
- Registered repo paths are loaded from `~/.repo-harness/registered-repos.json` and revalidated against live repo-harness adoption markers before use.
- External read-only workspace roots appear in the same Connector only when the local user enables reader capability with explicit allowed roots.
- The `/mcp` endpoint requires OAuth-issued Bearer tokens by default. Do not expose it through a tunnel without Connector auth configured.
- `repo-harness mcp serve --auth bearer` is available for non-ChatGPT clients that can send a static bearer token.
- `repo-harness mcp serve --auth url-token` is a single-user compatibility mode that accepts the same token in either `Authorization: Bearer` or `?repo_harness_token=`; logs and shared docs must not include the token.
- Reader mode never disables deny globs for `.env`, private keys, SSH keys, credentials, secrets, `.git`, or dependency/build output.
- Planner profile cannot write application source files, package manifests, lockfiles, CI config, secrets, or files outside the repo root.
- MCP does not expose a default Codex runner. It prepares `.ai/harness/handoff/codex-goal.md`; the local Codex host owns `/goal` execution unless the user explicitly enables the local orchestrator dev runner.
- The orchestrator dev runner is local-only, opt-in, timeout-bounded, audited, and limited to the fixed Codex goal handoff. It is not arbitrary shell.
- Keep `_ref/` read-only when used as a comparison source.
- Do not put tunnel tokens, OAuth tokens, passphrases, or ChatGPT/Codex credentials in git.
