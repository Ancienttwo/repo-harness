import { createHash, randomBytes } from 'crypto';
import { existsSync, mkdirSync, readFileSync, realpathSync, renameSync, rmSync, statSync, writeFileSync } from 'fs';
import { isIP } from 'net';
import { homedir } from 'os';
import { dirname, join, relative, resolve } from 'path';
import {
  applyRepoHarnessRegistryBatch,
  readRegisteredRepoHarnessRepos,
  repoHarnessAuthorizationRevision,
} from '../../effects/repo-registry';
import {
  ensureMcpBearerToken,
  ensureMcpOAuthPassphrase,
  loadMcpLocalConfig,
  mcpLocalConfigPath,
  mcpOAuthPath,
  mcpTokenPath,
  readMcpOAuthPassphrase,
  resolveMcpConfigScope,
  type McpConfigScope,
} from './auth';
import { sensitiveAllowedRootReason } from './policy';
import { parseMcpProfile } from './policy';
import { buildCodingToolDefinitions } from './coding-tools';
import { isRepoHarnessAdopted, resolveMcpRepoRoot } from './repo';
import { repoHarnessPackageVersion } from './version';

export interface McpSetupResult {
  status: 'ok';
  repoRoot: string;
  changed: string[];
  lines: string[];
}

const REQUIRED_CODEX_TOOLS = [
  'harness_status',
  'read_workflow_file',
  'latest_handoff',
  'latest_checks',
  'prepare_codex_goal_from_sprint',
  'write_codex_goal',
  'run_workflow_check',
];

const CHATGPT_MCP_ENDPOINT_PLACEHOLDER = '<https-tunnel-url>/mcp';
const DEFAULT_CHATGPT_MCP_SERVER_NAME = 'repo-harness';
const ENDPOINT_ERROR = 'expected a public HTTPS URL exactly ending in /mcp with no username, password, query, or fragment';
const SERVER_NAME_ERROR = 'expected a ChatGPT MCP server name using 1-80 letters, numbers, spaces, dots, underscores, or hyphens';

function writeFileIfChanged(path: string, content: string, changed: string[]): void {
  if (existsSync(path) && readFileSync(path, 'utf-8') === content) return;
  mkdirSync(dirname(path), { recursive: true });
  writeFileSync(path, content, 'utf-8');
  changed.push(path);
}

function writePrivateFileAtomicIfChanged(path: string, content: string, changed: string[]): void {
  if (existsSync(path) && readFileSync(path, 'utf-8') === content) return;
  mkdirSync(dirname(path), { recursive: true, mode: 0o700 });
  const temporary = `${path}.${process.pid}.${Date.now()}.tmp`;
  writeFileSync(temporary, content, { encoding: 'utf-8', mode: 0o600 });
  renameSync(temporary, path);
  changed.push(path);
}

function ensureGitignoreEntries(repoRoot: string, entries: string[], changed: string[]): void {
  const path = join(repoRoot, '.gitignore');
  const current = existsSync(path) ? readFileSync(path, 'utf-8') : '';
  const lines = current.split(/\r?\n/);
  let next = current.trimEnd();
  for (const entry of entries) {
    if (lines.includes(entry)) continue;
    next += `${next.length > 0 ? '\n' : ''}${entry}`;
  }
  next += '\n';
  writeFileIfChanged(path, next, changed);
}

function isPrivateOrLocalIPv4(hostname: string): boolean {
  const parts = hostname.split('.').map((part) => Number(part));
  if (parts.length !== 4 || parts.some((part) => !Number.isInteger(part) || part < 0 || part > 255)) return true;
  const [a, b] = parts;
  return a === 0 ||
    a === 10 ||
    a === 127 ||
    a === 169 && b === 254 ||
    a === 172 && b >= 16 && b <= 31 ||
    a === 192 && b === 168 ||
    a === 100 && b >= 64 && b <= 127 ||
    a === 192 && b === 0 ||
    a === 198 && (b === 18 || b === 19) ||
    a >= 224;
}

function isPrivateOrLocalIPv6(hostname: string): boolean {
  const normalized = hostname.replace(/^\[|\]$/g, '').toLowerCase();
  return normalized === '::' ||
    normalized === '::1' ||
    normalized.startsWith('fc') ||
    normalized.startsWith('fd') ||
    normalized.startsWith('fe8') ||
    normalized.startsWith('fe9') ||
    normalized.startsWith('fea') ||
    normalized.startsWith('feb');
}

function isPrivateOrLocalHost(hostname: string): boolean {
  const normalized = hostname.toLowerCase().replace(/\.$/, '');
  if (!normalized || normalized === 'localhost' || normalized.endsWith('.localhost') || normalized.endsWith('.local')) {
    return true;
  }
  const ipCandidate = normalized.replace(/^\[|\]$/g, '');
  const ipVersion = isIP(ipCandidate);
  if (ipVersion === 4) return isPrivateOrLocalIPv4(ipCandidate);
  if (ipVersion === 6) return isPrivateOrLocalIPv6(ipCandidate);
  return false;
}

function normalizePublicMcpEndpoint(endpoint: string | undefined): string | undefined {
  if (endpoint === undefined) return undefined;
  const trimmed = endpoint.trim();
  if (trimmed.length === 0) return undefined;
  let parsed: URL;
  try {
    parsed = new URL(trimmed);
  } catch (_error) {
    throw new Error(`invalid --endpoint "${endpoint}" (${ENDPOINT_ERROR})`);
  }
  if (
    parsed.protocol !== 'https:' ||
    parsed.pathname !== '/mcp' ||
    parsed.username !== '' ||
    parsed.password !== '' ||
    parsed.search !== '' ||
    parsed.hash !== '' ||
    isPrivateOrLocalHost(parsed.hostname)
  ) {
    throw new Error(`invalid --endpoint "${endpoint}" (${ENDPOINT_ERROR})`);
  }
  return parsed.toString();
}

function normalizeChatgptMcpServerName(value: string | undefined): string {
  const trimmed = (value ?? DEFAULT_CHATGPT_MCP_SERVER_NAME).trim();
  if (
    trimmed.length < 1 ||
    trimmed.length > 80 ||
    !/^[A-Za-z0-9][A-Za-z0-9._ -]*$/.test(trimmed) ||
    / {2,}/.test(trimmed)
  ) {
    throw new Error(`invalid --server-name "${value ?? ''}" (${SERVER_NAME_ERROR})`);
  }
  return trimmed;
}

function parseMcpConfigScope(value: string | undefined): McpConfigScope {
  const normalized = (value ?? 'repo').trim().toLowerCase();
  if (normalized === 'repo' || normalized === 'user') return normalized;
  throw new Error(`invalid --scope "${value}" (expected: repo, user)`);
}

function displayMcpSetupPath(repoRoot: string, path: string, scope: McpConfigScope): string {
  if (scope === 'repo') return relative(repoRoot, path);
  const home = process.env.HOME;
  if (home && path === home) return '~';
  if (home && path.startsWith(`${home}/`)) return `~/${path.slice(home.length + 1)}`;
  return path;
}

function normalizeAllowedRoots(rawRoots: string[]): string[] {
  const roots: string[] = [];
  const seen = new Set<string>();
  for (const rawRoot of rawRoots) {
    const trimmed = rawRoot.trim();
    if (!trimmed) continue;
    const absoluteRoot = resolve(trimmed);
    const fileStat = statSync(absoluteRoot);
    if (!fileStat.isDirectory()) {
      throw new Error(`--allow-root must point to a readable directory: ${rawRoot}`);
    }
    const canonical = realpathSync(absoluteRoot);
    const sensitiveReason = sensitiveAllowedRootReason(canonical, undefined, rawRoot);
    if (sensitiveReason) {
      throw new Error(`--allow-root points at a sensitive directory denied by MCP policy: ${rawRoot} (${sensitiveReason})`);
    }
    if (seen.has(canonical)) continue;
    seen.add(canonical);
    roots.push(canonical);
  }
  return roots;
}

export function chatgptGuideMarkdown(endpoint = CHATGPT_MCP_ENDPOINT_PLACEHOLDER): string {
  return `# repo-harness ChatGPT MCP Connector Setup

## Prerequisites

- At least one repo-harness adopted repository. New \`repo-harness adopt\`,
  \`repo-harness init\`, and user-scope ChatGPT setup register adopted repos in
  \`~/.repo-harness/registered-repos.json\`.
- A local \`repo-harness\` CLI on PATH.
- ChatGPT workspace access to Developer Mode and custom MCP Connectors.
- A stable public HTTPS \`/mcp\` endpoint for recurring ChatGPT Connector use. Local Codex can use stdio without a tunnel.

## Start Local MCP Server

Standard users run one MCP server and configure one ChatGPT Connector URL:

\`\`\`bash
repo-harness mcp serve --repo . --transport http --host 127.0.0.1 --port 8765 --profile planner
\`\`\`

The ChatGPT Connector registers the HTTPS endpoint, not a per-repo URL. The
server discovers target repos from the global registry, so any repo registered by
\`repo-harness adopt\`, \`repo-harness init\`, or user-scope MCP setup can be
selected by passing \`repo_path\` to workflow tools. The \`--repo\` value is only
the default repo/bootstrap context, not the only usable project.

Developer Mode should normally be configured at OS user level. This stores MCP
config, auth, and the registered repo index under \`~/.repo-harness/\`. Extra
non-repo document roots are optional and require explicit \`--allow-root\`:

\`\`\`bash
repo-harness mcp setup chatgpt --scope user --repo . --endpoint <https-url>/mcp
repo-harness mcp serve --repo . --transport http --host 127.0.0.1 --port 8765 --profile planner
\`\`\`

Optional external non-repo reader roots stay in the same Connector and must be
explicitly authorized:

\`\`\`bash
repo-harness mcp setup chatgpt \\
  --scope user \\
  --repo . \\
  --enable-reader \\
  --allow-root "$HOME/Documents" \\
  --allow-root "$HOME/Projects" \\
  --endpoint <https-url>/mcp
\`\`\`

Direct coding is a separate, default-off profile. It requires user scope and an
explicit read-write repo grant:

\`\`\`bash
repo-harness mcp setup chatgpt --scope user --profile coding --grant-read-write "$HOME/Projects/my-repo" --endpoint https://mcp.example.com/mcp
repo-harness mcp serve --repo "$HOME/Projects/my-repo" --transport http --host 127.0.0.1 --port 8765 --profile coding
\`\`\`

It exposes \`open_workspace\`, \`read\`, \`apply_patch\`, \`exec_command\`, and
\`write_stdin\`. Bash has local-user authority and is not a filesystem sandbox.
The repo grant selects which workspace can be opened; shell commands can access
anything the local OS user can access on the machine, including outside that repo.
It does not call local Codex or consume Codex quota. Read
\`docs/reference-configs/chatgpt-coding-mcp.md\` before enabling it.

Health check:

\`\`\`bash
curl http://127.0.0.1:8765/health
\`\`\`

The ChatGPT path uses OAuth with a local passphrase. The passphrase is stored in an ignored local file:

\`\`\`bash
jq -r .passphrase .repo-harness/mcp.oauth.json
\`\`\`

For user-scope setup, read the passphrase from \`~/.repo-harness/mcp.oauth.json\`.

Do not commit or paste this passphrase into issue trackers, PRs, or shared logs.

OAuth discovery smoke:

\`\`\`bash
curl http://127.0.0.1:8765/.well-known/oauth-protected-resource/mcp
\`\`\`

## Choose Tunnel Endpoint

Keep the four network values distinct:

| Value | Example |
|---|---|
| Local origin | \`http://127.0.0.1:8765\` |
| Tunnel upstream | \`http://127.0.0.1:8765\` |
| Public origin | \`https://mcp.example.com\` (no \`/mcp\`) |
| ChatGPT MCP server URL | \`https://mcp.example.com/mcp\` |

For recurring ChatGPT Connector use, prefer a stable hostname from a named tunnel or reserved domain. Quick tunnels are useful for one-off smoke tests, but their URL changes and ChatGPT will treat the new URL as a different Connector app.

Stable Cloudflare named tunnel shape:

\`\`\`bash
cloudflared tunnel login
cloudflared tunnel create repo-harness-mcp
cloudflared tunnel route dns repo-harness-mcp repo-harness-mcp.example.com
cloudflared tunnel run repo-harness-mcp
\`\`\`

Then regenerate this guide with the stable endpoint:

\`\`\`bash
repo-harness mcp setup chatgpt --repo . --endpoint <https-url>/mcp
\`\`\`

The endpoint is stored in ignored local config. The tracked guide stays placeholder-only so real operator domains do not enter source control.

One-off quick tunnel smoke:

\`\`\`bash
cloudflared tunnel --url http://127.0.0.1:8765
\`\`\`

| Provider | Intended use |
|---|---|
| Cloudflare named tunnel | Preferred recurring path with stable hostname |
| Cloudflare quick tunnel | One-off smoke only; URL changes |
| ngrok reserved domain | Stable debugging path with provider plan limits |
| Pinggy | Low-setup temporary smoke |
| Tailscale Funnel | Tailnet identity/ACL environments |

Use this Connector URL:

\`\`\`text
${endpoint}
\`\`\`

## Create ChatGPT Developer-mode App / Connector

1. Open ChatGPT **Settings → Security and login** and enable Developer mode.
2. Open **Settings → Plugins** and create a developer-mode app (older UI/material may call it a Connector).
3. Use the server name recorded in \`.repo-harness/mcp.local.json\` under \`chatgpt.serverName\` (new setup records the default \`repo-harness\` unless \`--server-name\` is provided).
4. Provide a description and paste the public MCP server URL ending in \`/mcp\`.
5. Configure Connector authentication as OAuth when prompted.
6. Create/Scan the app and verify the advertised tools.
8. When the authorization page opens, enter the passphrase from \`.repo-harness/mcp.oauth.json\`.
9. Wait for the tool scan to finish, then create the Connector.
10. Keep a permission level that asks before changes; coding tools are destructive and shell is open-world.

After changing repo-harness versions or any MCP tool schema, restart
\`repo-harness mcp serve\`, rescan the Connector tools, and start a fresh ChatGPT
chat. If ChatGPT keeps an old schema, delete and recreate the App/Connector.

If \`repo-harness mcp doctor --repo . --json\` reports \`chatgpt.serverNameConfigured:false\`, rerun setup with \`--server-name <connector-name>\` before using GPT Pro MCP read-back prompts.

## Human Workflow

Use ChatGPT for planning and review. Use Codex for local execution.

1. Use the single configured Connector for workflow planning and repo tools.
2. Call \`discover_harness_repos\` to list registered adopted repos, or pass \`query\`/\`name\`/\`repo_path\` for repo-like user text such as \`my-app/\`; then pass the selected exact \`repo_path\` when targeting a specific project. Registered repo aliases are resolved through the same authorized discovery surface, not by widening filesystem access.
3. For registered repo document/code reading, capture the \`repo_id\` from \`discover_harness_repos\`, then use \`get_repo_capabilities\`, \`repo_manifest\`, \`list_tree\`, \`stat_file\`, \`read_file\`, \`read_files\`, and \`search_text\`.
4. For registered repo writes, first check \`get_repo_capabilities.write_tools\`; mutation tools execute only for a repo registered with \`accessMode: "read_write"\`.
5. Ask ChatGPT to turn the idea into a PRD with \`write_prd_from_idea\`.
6. Ask ChatGPT to turn the PRD into a checklist Sprint with \`write_checklist_sprint\`.
7. Ask ChatGPT to prepare a Codex Goal with \`prepare_codex_goal_from_sprint\`.
8. Open Codex locally and run the generated \`/goal\` prompt.
9. Let Codex execute one Sprint task card at a time, run checks, update the checklist, and stage each completed phase before continuing.

Planner remains a workflow sidecar rather than a remote coding agent. Only the
separate, explicitly granted coding profile provides direct coding and shell.

## General Repo Reader Reference

The general repo reader uses the registered repo whitelist as the repo-level
authorization boundary and \`.ignore\` as the only content-level exclusion
source. GPT-facing calls use \`repo_id\` plus repo-relative paths. CodeGraph is
the indexed metadata backend, while repo-harness owns authorization, fallback,
snapshot semantics, audit, and mutation preconditions.

For tool reference, JSON examples, repo administration, privacy/audit, and
known limits, see:

\`\`\`text
docs/reference-configs/general-repo-mcp.md
\`\`\`

For index stale, CodeGraph down, manifest incomplete, mutation conflict, and
reindex dead-letter operations, see:

\`\`\`text
deploy/runbooks/general-repo-mcp-codegraph.md
\`\`\`

## Dev Mode Agent Runner

The default planner Connector does not run Codex or Claude. If you intentionally want ChatGPT to trigger a local agent from MCP, use the \`orchestrator\` profile and enable the dev runner setting yourself.

Local config setting:

\`\`\`json
{
  "devMode": {
    "agentRunner": true,
    "allowedAgents": ["codex"],
    "timeoutMs": 120000
  }
}
\`\`\`

Equivalent one-shot launch:

\`\`\`bash
repo-harness mcp serve --repo . --transport http --host 127.0.0.1 --port 8765 --profile orchestrator --enable-dev-runner --dev-runner-agents codex
\`\`\`

Environment override:

\`\`\`bash
REPO_HARNESS_MCP_DEV_RUNNER=1 REPO_HARNESS_MCP_DEV_RUNNER_AGENTS=codex,claude repo-harness mcp serve --repo . --transport http --profile orchestrator
\`\`\`

When enabled, the server exposes \`run_agent_goal\`. The tool reads only \`.ai/harness/handoff/codex-goal.md\` and runs that fixed handoff through the allowed local CLI:

\`\`\`text
codex exec --json --cd <repo> <goal>
claude -p <goal>
\`\`\`

Keep this behind local Developer Mode and per-call confirmations. Do not expose an orchestrator tunnel to untrusted users.

## Agent Handoff Contract

The agent-facing Skill is installed at:

\`\`\`text
.agents/skills/repo-harness-chatgpt-bridge/SKILL.md
\`\`\`

Use it in Codex when continuing a ChatGPT-generated handoff:

\`\`\`text
Use repo-harness-chatgpt-bridge.
Execute .ai/harness/handoff/codex-goal.md.
\`\`\`

The Skill tells Codex to read the PRD and checklist Sprint, preserve stage gates, run focused checks, and stage each completed phase. It does not authorize ChatGPT to edit source code or run shell commands through MCP.

## Tool Chain

Expected planning chain:

\`\`\`text
idea
  -> write_prd_from_idea
  -> write_checklist_sprint
  -> prepare_codex_goal_from_sprint
  -> local Codex /goal execution
\`\`\`

Local fallback for the last handoff step:

\`\`\`bash
repo-harness mcp prepare-goal --repo . --prd plans/prds/<feature>.prd.md --sprint plans/sprints/<feature>.sprint.md --reference-repo <optional-readonly-reference>
\`\`\`

## Test Prompt

\`\`\`text
Use repo-harness to inspect this repo. Call harness_status, latest_handoff, and list_workflow_files. Do not write files.
\`\`\`

## Reader Test Prompt

\`\`\`text
Use the repo-harness Connector. First call discover_harness_repos with query/name/repo_path when the user gives repo-like text such as "my-app/", then choose the exact registered repo_id. Call get_repo_capabilities, repo_manifest, list_tree on ".", read_file on README.md or docs/spec.md, and search_text for "repo-harness". Do not write files.
\`\`\`

Blocked-file smoke:

\`\`\`text
Use the general repo reader to try read_file with "../outside", an absolute path, and one path that the repo's .ignore excludes. These must return path-policy errors. If the repo contains an external symlink, read_file on that symlink must return SYMLINK_ESCAPE. Do not print file contents while testing blocked paths.
\`\`\`

## Connector Invocation Evidence

Treat Connector readiness as four independent checks:

1. Endpoint: the sidecar and public HTTPS \`/mcp\` endpoint respond.
2. Schema: ChatGPT Connector settings show the expected Action after Refresh.
3. Selection: a fresh chat has the recorded Connector selected from \`+\` -> More.
4. Invocation: the current model surface emits a real tool call.

Only a visible \`Called tool\` event with the selected Action/result, or an
equivalent captured tool-call transcript, proves MCP invocation. Connector
selection, assistant self-report, plausible JSON, or sandbox shell commands do
not prove that ChatGPT called MCP.

For Pro runs, the normal tool-call runtime UI may not appear the way it does for
other models because Pro uses a sandbox/process flow. In the visible ChatGPT Web
UI, click the assistant's \`Thinking\` / \`Thought for ...\` disclosure to open
the right-side process pane. Use that pane to confirm whether Pro actually
emitted a \`Called tool\` event for the selected app, which action it chose, or
whether it only reasoned inside the sandbox without invoking MCP. If the pane
shows sandbox-only exploration, or the answer reports \`app_unavailable\` without
a tool event, classify the outcome as \`surface_blocked\`, not as a broken repo
or sidecar.

Detailed Pro Extended planning and review tasks commonly take 15 minutes or
more. When driving Pro through the browser path, do not treat elapsed time as
failure while the session is still alive; wait for a final answer or a concrete
browser, login, capture, or tool-call failure. Keep the Oracle heartbeat enabled;
heartbeat diagnostics such as \`no thinking status detected yet\` are progress
signals, not blockers by themselves.

Outcome labels:

- \`invocation_verified\`: real \`Called tool\` event or captured tool-call transcript.
- \`approval_pending\`: a real tool request produced a confirmation prompt.
- \`surface_blocked\`: schema is current, but the current model surface did not call MCP.
- \`bundle_fallback\`: Pro is reviewing a local evidence bundle and did not read through MCP.

When Pro is \`surface_blocked\`, use \`repo-harness-gptpro\` to send a bounded
local evidence bundle through the existing Oracle/browser handoff. The bundle
must say it was produced locally, list included and omitted/truncated material,
and include:

\`\`\`yaml
source: local_repo_harness_bundle
pro_invoked_mcp: false
working_tree: clean | dirty
\`\`\`

Do not claim MCP read-back evidence for fallback output. Pro can plan or review
the supplied bundle, while Codex still executes and verifies locally.

Permission scope is separate from invocation evidence. Standard user-scope setup
uses the global registered repo index, not one Connector per project. Random
external directories are still excluded unless the local user adds explicit
\`--allow-root\` entries; broad full-disk read is not a supported default.
Repo-scope setup remains for repo-local guide/auth compatibility, but it is not
the recommended ChatGPT Connector shape for users working across projects.

## PRD Prompt

\`\`\`text
Use repo-harness discover_harness_repos first, pass query/name/repo_path when the user gives repo-like text such as "my-app/", choose the exact target repo_path, inspect docs/spec.md, tasks/current.md, latest handoff, and existing plans in that repo, then convert this idea into a PRD with write_prd_from_idea using the same repo_path. Do not edit source code.
\`\`\`

## Checklist Sprint Prompt

\`\`\`text
Use repo-harness to read the target repo PRD by repo_path. Convert it into an ordered checklist Sprint with write_checklist_sprint using the same repo_path. Every task card must include a stage gate that requires Codex to stage the completed phase before continuing.
\`\`\`

## Codex Goal Prompt

\`\`\`text
Use repo-harness prepare_codex_goal_from_sprint with repo_path, the PRD path, and the checklist Sprint path. Return the host-native /goal prompt. Do not run Codex remotely.
\`\`\`

Equivalent local CLI:

\`\`\`bash
repo-harness mcp prepare-goal --repo . --prd plans/prds/<feature>.prd.md --sprint plans/sprints/<feature>.sprint.md --reference-repo <optional-readonly-reference>
\`\`\`

## Codex Executor Prompt

\`\`\`text
Use repo-harness-chatgpt-bridge. Execute the latest ChatGPT-generated Codex goal from .ai/harness/handoff/codex-goal.md.
\`\`\`

## Troubleshooting

- If ChatGPT cannot connect, verify the tunnel URL is HTTPS and ends in \`/mcp\`.
- If ChatGPT returns unauthorized, verify OAuth discovery works and re-run the authorization passphrase flow.
- If tools are missing, restart \`repo-harness mcp serve\` and rescan tools.
- Run \`repo-harness mcp doctor --repo . --live\` to verify config, local server, tunnel, OAuth, initialize, and exact \`tools/list\` schema without printing credentials.
- If workflow artifact writes fail, verify the target path is a PRD, sprint, plan, or approved handoff file.
- If general repo writes fail, call \`get_repo_capabilities\`; write tools require a repo registered with \`accessMode: "read_write"\`.
- If ChatGPT generated prose instead of checklist Sprint task cards, ask it to use write_checklist_sprint.
- If Codex cannot see the server, run \`repo-harness mcp setup codex --repo . --scope project\`.

## Security Notes

- The default planner Connector exposes workflow planning tools plus read-only access to registered adopted repos' non-ignored files.
- Registered repo paths are loaded from \`~/.repo-harness/registered-repos.json\` and revalidated against live repo-harness adoption markers before use.
- External read-only workspace roots appear in the same Connector only when the local user enables reader capability with explicit allowed roots.
- The \`/mcp\` endpoint requires OAuth-issued Bearer tokens by default. Do not expose it through a tunnel without Connector auth configured.
- \`repo-harness mcp serve --auth bearer\` is available for non-ChatGPT clients that can send a static bearer token.
- \`repo-harness mcp serve --auth url-token\` is a single-user compatibility mode that accepts the same token in either \`Authorization: Bearer\` or \`?repo_harness_token=\`; logs and shared docs must not include the token.
- Legacy workspace reader mode keeps deny globs for \`.env\`, private keys, SSH keys, credentials, secrets, \`.git\`, and dependency/build output. The general repo API uses \`.ignore\` as the content filter and relies on repo registration plus path guards.
- Planner profile cannot write application source files, package manifests, lockfiles, CI config, secrets, or files outside the repo root.
- Coding profile is user-scoped and fail-closed without explicit \`read_write\` grants. Its shell has local-user authority; allowed roots constrain workspace selection, not shell access.
- MCP does not expose a default Codex runner. It prepares \`.ai/harness/handoff/codex-goal.md\`; the local Codex host owns \`/goal\` execution unless the user explicitly enables the local orchestrator dev runner.
- The orchestrator dev runner is local-only, opt-in, timeout-bounded, audited, and limited to the fixed Codex goal handoff. It is not arbitrary shell.
- Keep \`_ref/\` read-only when used as a comparison source.
- Do not put tunnel tokens, OAuth tokens, passphrases, or ChatGPT/Codex credentials in git.
`;
}

export function runMcpSetupChatgpt(opts: {
  repo?: string;
  host?: string;
  port?: string;
  endpoint?: string;
  serverName?: string;
  enableReader?: boolean;
  allowRoot?: string[];
  scope?: string;
  allowFullDiskRead?: boolean;
  profile?: string;
  grantReadWrite?: string[];
}): McpSetupResult {
  const repoRoot = resolveMcpRepoRoot(opts.repo ?? '.');
  const scope = parseMcpConfigScope(opts.scope);
  if (opts.allowFullDiskRead === true) {
    throw new Error('repo-harness mcp setup chatgpt --allow-full-disk-read is deprecated; use --enable-reader with one or more --allow-root paths');
  }
  const changed: string[] = [];
  const existingConfig = loadMcpLocalConfig(repoRoot, scope) ?? (scope === 'user' ? loadMcpLocalConfig(repoRoot, 'repo') : null);
  const requestedProfile = parseMcpProfile(opts.profile ?? existingConfig?.profile ?? 'planner');
  if (requestedProfile === 'coding' && scope !== 'user') {
    throw new Error('coding profile setup requires --scope user so grants and authorization revision live in user-owned ignored state');
  }
  const grantReadWrite = Array.from(new Set((opts.grantReadWrite ?? []).map((entry) => resolve(entry)).filter(Boolean)));
  if (requestedProfile === 'coding' && existingConfig?.coding?.enabled !== true && grantReadWrite.length === 0) {
    throw new Error('coding profile setup requires at least one explicit --grant-read-write <repo>');
  }
  for (const grantRoot of grantReadWrite) {
    if (!isRepoHarnessAdopted(grantRoot)) {
      throw new Error(`cannot grant coding access: repo is not repo-harness adopted: ${grantRoot}`);
    }
  }
  const requestedRoots = normalizeAllowedRoots(opts.allowRoot ?? []);
  const existingRoots = normalizeAllowedRoots(existingConfig?.permissions?.allowedRoots ?? []);
  const allowedRoots = Array.from(new Set([
    ...(requestedRoots.length > 0 ? requestedRoots : existingRoots),
  ]));
  const currentRepoAdopted = isRepoHarnessAdopted(repoRoot);
  const existingRegisteredRepos = readRegisteredRepoHarnessRepos({ adoptedOnly: true });
  const registeredRepoCount = existingRegisteredRepos.length + (
    scope === 'user' && currentRepoAdopted && !existingRegisteredRepos.some((entry) => entry.path === repoRoot) ? 1 : 0
  );
  const readerEnabled = requestedProfile !== 'coding' && opts.enableReader !== false && (
    allowedRoots.length > 0 ||
    currentRepoAdopted ||
    registeredRepoCount > 0 ||
    existingConfig?.capabilities?.workspaceReader === true
  );
  const legacyFullDiskReadDetected = existingConfig?.permissions?.fullDiskRead === true;
  const host = opts.host ?? existingConfig?.server?.host ?? '127.0.0.1';
  const port = opts.port ?? String(existingConfig?.server?.port ?? 8765);
  const serverName = normalizeChatgptMcpServerName(opts.serverName ?? existingConfig?.chatgpt?.serverName);
  const endpoint = normalizePublicMcpEndpoint(opts.endpoint ?? existingConfig?.chatgpt?.endpoint);
  const configPath = mcpLocalConfigPath(repoRoot, scope);
  const existingConfigBytes = existsSync(configPath) ? readFileSync(configPath, 'utf-8') : null;
  const guidePath = join(repoRoot, 'docs', 'repo-harness-chatgpt-mcp-setup.md');
  const token = ensureMcpBearerToken(repoRoot, scope);
  const oauth = ensureMcpOAuthPassphrase(repoRoot, scope);
  if (token.changed) changed.push(token.path);
  if (oauth.changed) changed.push(oauth.path);
  const defaultRedirectHosts = ['chatgpt.com', 'localhost', '127.0.0.1', '::1'];
  const auth = scope === 'repo'
    ? {
        mode: existingConfig?.auth?.mode ?? 'oauth',
        oauthFile: existingConfig?.auth?.oauthFile ?? '.repo-harness/mcp.oauth.json',
        tokenFile: existingConfig?.auth?.tokenFile ?? '.repo-harness/mcp.tokens.json',
        allowedRedirectHosts: existingConfig?.auth?.allowedRedirectHosts ?? defaultRedirectHosts,
      }
    : {
        mode: existingConfig?.auth?.mode ?? 'oauth',
        oauthFile: displayMcpSetupPath(repoRoot, oauth.path, scope),
        tokenFile: displayMcpSetupPath(repoRoot, token.path, scope),
        allowedRedirectHosts: existingConfig?.auth?.allowedRedirectHosts ?? defaultRedirectHosts,
      };
  const profile = requestedProfile;
  const profileAuthorizationChanged = (existingConfig?.coding?.enabled === true) !== (profile === 'coding');
  const { reader: _legacyReader, ...existingCapabilities } = existingConfig?.capabilities ?? {};
  const config = {
    version: 3,
    scope,
    repo: repoRoot,
    server: { ...existingConfig?.server, host, port: Number(port), transport: existingConfig?.server?.transport ?? 'http' },
    auth,
    chatgpt: {
      ...existingConfig?.chatgpt,
      serverName,
      ...(endpoint ? { endpoint } : {}),
    },
    capabilities: {
      ...existingCapabilities,
      workspaceReader: readerEnabled,
      workflowPlanner: profile === 'planner' || profile === 'coding',
      workflowExecutor: profile === 'executor',
      agentRunner: profile === 'orchestrator' && existingConfig?.devMode?.agentRunner === true,
      workspaceCoder: profile === 'coding',
    },
    permissions: {
      ...existingConfig?.permissions,
      allowedRoots,
      discoveryRoots: allowedRoots,
      ...(legacyFullDiskReadDetected ? { legacyFullDiskReadDetected: true } : {}),
      fullDiskRead: false,
    },
    profile,
    coding: {
      ...existingConfig?.coding,
      enabled: profile === 'coding',
      environmentAllowlist: existingConfig?.coding?.environmentAllowlist ?? [],
    },
    devMode: existingConfig?.devMode ?? {
      agentRunner: false,
      allowedAgents: ['codex'],
      timeoutMs: 120000,
    },
  };
  if (scope === 'repo') {
    writeFileIfChanged(guidePath, chatgptGuideMarkdown(), changed);
    ensureGitignoreEntries(repoRoot, [
      '.repo-harness/mcp.local.json',
      '.repo-harness/mcp.tokens.json',
      '.repo-harness/mcp.oauth.json',
      '.repo-harness/mcp.oauth-tokens.json',
      '.ai/harness/mcp/audit.log',
      '.ai/harness/mcp/index-events.jsonl',
      '.ai/harness/mcp/metrics.jsonl',
      '.ai/harness/mcp/trace.jsonl',
    ], changed);
  }
  const registryEntries = [
    ...(scope === 'user' && currentRepoAdopted ? [{ repoRoot, source: 'mcp-setup' as const }] : []),
    ...grantReadWrite.map((grantRoot) => ({ repoRoot: grantRoot, source: 'manual' as const, accessMode: 'read_write' as const })),
  ];
  const registryBatch = applyRepoHarnessRegistryBatch(registryEntries, {
    bumpAuthorizationRevision: profileAuthorizationChanged,
    beforeCommit: (authorizationRevision) => {
      writePrivateFileAtomicIfChanged(configPath, `${JSON.stringify({ ...config, authorizationRevision }, null, 2)}\n`, changed);
    },
    onCommitFailure: () => {
      if (existingConfigBytes === null) rmSync(configPath, { force: true });
      else writePrivateFileAtomicIfChanged(configPath, existingConfigBytes, []);
    },
  });
  if (registryBatch.changed) changed.push(registryBatch.registryPath);
  const registered = {
    registered: scope === 'user' && currentRepoAdopted,
    path: repoRoot,
  };

  return {
    status: 'ok',
    repoRoot,
    changed,
    lines: [
      `[repo-harness mcp] Repo: ${repoRoot}`,
      `[repo-harness mcp] Config scope: ${scope}`,
      `[repo-harness mcp] Reader capability: ${readerEnabled ? `enabled (${registeredRepoCount} registered repo${registeredRepoCount === 1 ? '' : 's'}, ${allowedRoots.length} explicit root${allowedRoots.length === 1 ? '' : 's'})` : 'disabled'}`,
      ...(registered.registered ? [`[repo-harness mcp] Registered repo: ${displayMcpSetupPath(repoRoot, registered.path, scope)}`] : []),
      ...(legacyFullDiskReadDetected ? ['[repo-harness mcp] Legacy full-disk read: detected and disabled; use --allow-root to authorize reader roots'] : []),
      `[repo-harness mcp] Profile: ${profile}`,
      `[repo-harness mcp] ChatGPT MCP server name: ${serverName}`,
      `[repo-harness mcp] Local endpoint: http://${host}:${port}/mcp`,
      endpoint
        ? `[repo-harness mcp] ChatGPT endpoint: ${endpoint}`
        : '[repo-harness mcp] ChatGPT endpoint: requires stable HTTPS tunnel',
      `[repo-harness mcp] Auth: OAuth passphrase (${displayMcpSetupPath(repoRoot, oauth.path, scope)})`,
      `[repo-harness mcp] Bearer fallback token: ${displayMcpSetupPath(repoRoot, token.path, scope)}`,
      `[repo-harness mcp] Config: ${displayMcpSetupPath(repoRoot, configPath, scope)}`,
      ...(scope === 'repo'
        ? [`[repo-harness mcp] Guide: ${relative(repoRoot, guidePath)} (generic; endpoint stays in ignored local config)`]
        : ['[repo-harness mcp] Guide: user-scope setup does not write repo docs']),
      `Next: repo-harness mcp serve --repo ${scope === 'user' ? repoRoot : '.'} --transport http --host ${host} --port ${port} --profile ${profile}`,
    ],
  };
}

const CODEX_MCP_BLOCK = `[mcp_servers.repo_harness]
command = "repo-harness"
args = [
  "mcp",
  "serve",
  "--repo",
  ".",
  "--transport",
  "stdio",
  "--profile",
  "executor"
]
enabled_tools = [
  "harness_status",
  "read_workflow_file",
  "latest_handoff",
  "latest_checks",
  "prepare_codex_goal_from_sprint",
  "write_codex_goal",
  "run_workflow_check"
]
default_tools_approval_mode = "prompt"
`;

export function patchCodexConfigToml(current: string): string {
  const normalized = current.trimEnd();
  const blockPattern = /\n?\[mcp_servers\.repo_harness\][\s\S]*?(?=\n\[|$)/;
  const prefix = normalized.length > 0 ? `${normalized}\n\n` : '';
  if (!blockPattern.test(normalized)) return `${prefix}${CODEX_MCP_BLOCK}`;
  return `${normalized.replace(blockPattern, `\n${CODEX_MCP_BLOCK}`.trimEnd())}\n`;
}

export function runMcpSetupCodex(opts: { repo?: string; scope?: string; dryRun?: boolean }): McpSetupResult {
  if ((opts.scope ?? 'project') !== 'project') {
    throw new Error('repo-harness mcp setup codex currently supports --scope project only');
  }
  const repoRoot = resolveMcpRepoRoot(opts.repo ?? '.');
  const configPath = join(repoRoot, '.codex', 'config.toml');
  const changed: string[] = [];
  const current = existsSync(configPath) ? readFileSync(configPath, 'utf-8') : '';
  const next = patchCodexConfigToml(current);
  if (opts.dryRun === true) {
    return {
      status: 'ok',
      repoRoot,
      changed: [],
      lines: [`[repo-harness mcp] Dry run: would patch ${relative(repoRoot, configPath)}`, next],
    };
  }
  if (existsSync(configPath) && current !== next) {
    const backupPath = `${configPath}.bak`;
    writeFileIfChanged(backupPath, current, changed);
  }
  writeFileIfChanged(configPath, next, changed);
  return {
    status: 'ok',
    repoRoot,
    changed,
    lines: [
      `[repo-harness mcp] Codex config: ${relative(repoRoot, configPath)}`,
      '[repo-harness mcp] Server: repo_harness',
      '[repo-harness mcp] Transport: stdio',
    ],
  };
}

const SKILL_MD = `---
name: repo-harness-chatgpt-bridge
description: Use when setting up or operating the repo-harness ChatGPT MCP Connector, bridging ChatGPT planning artifacts into Codex execution through repo-harness PRDs, sprints, checks, and handoffs.
---

# repo-harness-chatgpt-bridge

You are operating inside a repo-harness adopted repository.

## When To Use

Use this Skill when the user asks to set up, operate, inspect, or continue the repo-harness ChatGPT MCP Connector, or when a ChatGPT-generated repo-harness PRD/Sprint/Goal handoff needs to be consumed by Codex.

This Skill has four modes:

1. Setup mode: configure local MCP server files, ChatGPT guide, or Codex MCP config.
2. Planning handoff mode: preserve the chain idea -> PRD -> checklist Sprint -> Codex Goal.
3. Execution mode: local Codex reads \`.ai/harness/handoff/codex-goal.md\` and executes the referenced checklist Sprint.
4. Direct coding mode: an explicitly enabled \`coding\` profile opens a granted repo workspace and uses the five guarded coding/process tools without invoking Codex.

## First Reads

Before acting, read the repo-local source of truth that matches the mode:

- Setup: \`docs/repo-harness-chatgpt-mcp-setup.md\`, \`.repo-harness/mcp.local.json\` if present, and \`repo-harness mcp doctor --repo .\`.
- Planning handoff: \`docs/spec.md\`, \`tasks/current.md\`, existing \`plans/prds/\`, existing \`plans/sprints/\`, and latest \`.ai/harness/handoff/\`.
- Execution: \`.ai/harness/handoff/codex-goal.md\`, the referenced PRD, the referenced Sprint, \`tasks/current.md\`, and \`.ai/harness/handoff/resume.md\` when present.

Do not rely on chat history when these files exist.

## Agent Responsibilities

1. Treat ChatGPT as planner/reviewer and Codex as executor.
2. Prefer \`repo-harness mcp\` CLI commands over manual file edits when preparing setup or handoff artifacts.
3. In planner mode, keep ChatGPT write access limited to PRD, checklist Sprint, plan, notes, and approved handoff artifacts. Direct source writes require the separate coding profile.
4. Preserve checklist Sprint task cards and stage gates; do not collapse them into prose.
5. Stage each completed execution phase before moving to the next Sprint task card.
6. Report exact commands run, files changed, checks passed, and any remaining blocker.

## Required Planning Chain

For execution-ready planning, keep the chain explicit:

1. idea -> PRD: use \`write_prd_from_idea\`.
2. PRD -> checklist Sprint: use \`write_checklist_sprint\`.
3. Sprint -> Goal: use \`prepare_codex_goal_from_sprint\` or local \`repo-harness mcp prepare-goal\`.
4. Codex execution: use the host-native \`/goal\` prompt from \`.ai/harness/handoff/codex-goal.md\`.

The local CLI equivalent is:

\`\`\`bash
repo-harness mcp prepare-goal --repo . --prd <prd-path> --sprint <sprint-path> --reference-repo <optional-reference-repo>
\`\`\`

The generated \`/goal\` prompt should preserve this shape when absolute paths are useful:

\`\`\`text
/goal
Read: <prd-path>
Open or use a worktree and complete: <sprint-path>
After each completed phase, stage the result before continuing.
Use the user's language for status reports unless repo-local instructions require otherwise.
Reference repo: <optional-reference-repo>
\`\`\`

## Safety Boundaries

Never do these through planner, executor, or orchestrator MCP profiles:

- Do not expose arbitrary shell execution.
- Do not allow ChatGPT to edit application source files.
- Do not commit secrets, OAuth passphrases, bearer tokens, tunnel tokens, or \`~/.codex/auth.json\`.
- Do not paste MCP OAuth passphrases into chat, logs, issues, PRs, or handoff files.
- Do not implement or run a default remote \`codex exec\` runner.
- Do not modify \`_ref/\`, \`_ops/\`, \`.env*\`, \`.git/\`, package lockfiles, or source paths through planner-profile MCP tools.

MCP prepares \`.ai/harness/handoff/codex-goal.md\`; the local Codex host owns \`/goal\` execution.

Coding exception: the user may explicitly run user-scoped setup with \`--profile coding --grant-read-write <repo>\`. That profile exposes only \`open_workspace\`, \`read\`, \`apply_patch\`, \`exec_command\`, and \`write_stdin\` for direct coding, is revision-bound to explicit repo grants, defaults to managed worktrees, and runs Bash with local-user authority. It must remain off by default; shell is not a filesystem sandbox. It still hard-denies secret paths, \`.git/**\`, \`.env*\`, \`_ops/**\`, writable \`_ref/**\`, traversal, and symlink escapes.

Exception: if the user explicitly enables the local \`orchestrator\` dev runner setting, MCP may expose \`run_agent_goal\`. That tool must stay local-only, timeout-bounded, audited, limited to the fixed \`.ai/harness/handoff/codex-goal.md\`, and limited to user-allowed agents such as \`codex\` or \`claude\`. It is not arbitrary shell and must not be exposed through an untrusted tunnel.

## Setup Commands

Use these commands from the adopted repo root:

\`\`\`bash
repo-harness mcp doctor --repo .
repo-harness mcp setup chatgpt --repo .
repo-harness mcp setup codex --repo . --scope project
repo-harness mcp install-skill --repo .
\`\`\`

Enable direct coding only after the user accepts the local-shell trust model:

\`\`\`bash
repo-harness mcp setup chatgpt --scope user --profile coding --grant-read-write <repo> --endpoint https://host/mcp
repo-harness mcp serve --repo <repo> --transport http --host 127.0.0.1 --port 8765 --profile coding
repo-harness mcp doctor --repo <repo> --live
\`\`\`

Run the local HTTP server for ChatGPT:

\`\`\`bash
repo-harness mcp serve --repo . --transport http --host 127.0.0.1 --port 8765 --profile planner
\`\`\`

Run stdio for local Codex MCP config:

\`\`\`bash
repo-harness mcp serve --repo . --transport stdio --profile executor
\`\`\`

Run local dev-mode orchestration only after the user has opted in:

\`\`\`bash
repo-harness mcp serve --repo . --transport http --host 127.0.0.1 --port 8765 --profile orchestrator --enable-dev-runner --dev-runner-agents codex
\`\`\`

## Execution Checklist

When consuming \`.ai/harness/handoff/codex-goal.md\`:

1. Verify the PRD and Sprint paths exist.
2. Confirm the Sprint is checklist-shaped and has stage gates.
3. Open or use the requested worktree.
4. Complete one Sprint task card at a time.
5. Run that task card's focused checks.
6. Update the checklist and stage the completed phase.
7. Continue only after \`git status --short\` shows the intended staged files.
8. At closeout, run repo-required checks or document why the Sprint narrowed the check surface.

## Troubleshooting

- ChatGPT cannot connect: verify the HTTPS tunnel ends in \`/mcp\` and local \`/health\` responds.
- ChatGPT auth loops: prefer \`allow once\`; persistent \`allow always\` may require OAuth/session follow-up.
- Tool scan misses tools: restart \`repo-harness mcp serve\` and rescan the Connector.
- Coding is disabled: verify user-scoped v3 config, a live \`read_write\` grant, and current OAuth authorization revision.
- Coding process sessions are pipe-only under Bun; stdin, polling, Ctrl-C/SIGINT, and process-tree cleanup remain supported.
- Codex cannot see the MCP server: rerun \`repo-harness mcp setup codex --repo . --scope project\`.
- Sprint is prose-only: regenerate with \`write_checklist_sprint\` before execution.
`;

export function runMcpInstallSkill(opts: { repo?: string; overwrite?: boolean; dryRun?: boolean }): McpSetupResult {
  const repoRoot = resolveMcpRepoRoot(opts.repo ?? '.');
  const changed: string[] = [];
  const skillRoot = join(repoRoot, '.agents', 'skills', 'repo-harness-chatgpt-bridge');
  const skillPath = join(skillRoot, 'SKILL.md');
  if (existsSync(skillPath) && opts.overwrite !== true) {
    return {
      status: 'ok',
      repoRoot,
      changed,
      lines: [`[repo-harness mcp] Skill already exists: ${relative(repoRoot, skillPath)}`, '[repo-harness mcp] Use --overwrite to replace it.'],
    };
  }
  if (opts.dryRun === true) {
    return {
      status: 'ok',
      repoRoot,
      changed,
      lines: [`[repo-harness mcp] Dry run: would install ${relative(repoRoot, skillRoot)}`],
    };
  }
  writeFileIfChanged(join(skillRoot, 'SKILL.md'), SKILL_MD, changed);
  writeFileIfChanged(join(skillRoot, 'references', 'workflow.md'), `# Workflow

ChatGPT plans through MCP; Codex executes through repo-harness checks and handoff.

## Planning Chain

Use this chain for execution-ready planning:

1. idea -> PRD: call \`write_prd_from_idea\`.
2. PRD -> checklist Sprint: call \`write_checklist_sprint\`.
3. Sprint -> Goal: call \`prepare_codex_goal_from_sprint\` or run \`repo-harness mcp prepare-goal\`.

Planner/executor MCP prepares artifacts only. The local Codex host owns \`/goal\` execution. The separate user-authorized \`coding\` profile may edit a granted repo and run Bash directly without invoking Codex.

Dev-mode exception:

- A user may explicitly enable \`orchestrator\` + \`run_agent_goal\` for local Developer Mode.
- The runner reads only \`.ai/harness/handoff/codex-goal.md\`.
- It runs only user-allowed local agents such as \`codex\` or \`claude\`.
- It is timeout-bounded, audited, and must not expose arbitrary shell or source-write tools.

## Agent Operating Modes

Setup mode:

- Run \`repo-harness mcp doctor --repo .\`.
- Run \`repo-harness mcp setup chatgpt --repo .\` for ChatGPT Connector files and the human guide.
- Run \`repo-harness mcp setup codex --repo . --scope project\` for local Codex MCP config.
- Run \`repo-harness mcp install-skill --repo .\` to install this Skill into the repo.

Planning handoff mode:

- Ask ChatGPT to inspect workflow state before writing.
- Keep output in \`plans/prds/\`, \`plans/sprints/\`, and \`.ai/harness/handoff/\`.
- Use \`prepare_codex_goal_from_sprint\` or \`repo-harness mcp prepare-goal\` for the final Codex handoff.

Execution mode:

- Codex reads \`.ai/harness/handoff/codex-goal.md\`.
- Codex executes one Sprint task card at a time.
- Codex runs checks and stages each completed phase before continuing.

## Sprint Format

When ChatGPT writes a sprint for Codex execution, use checklist task cards rather than prose-only plans.

Each execution phase should include:

- \`[ ]\` checklist items for concrete implementation steps.
- Acceptance criteria for the phase.
- Verification commands or evidence expected before the phase is considered done.
- A staging gate that tells Codex to stage the completed phase before continuing.

Preferred task card shape:

\`\`\`markdown
## Task Card N: <phase name>

status: pending

Tasks:

- [ ] <step>
- [ ] <step>

Acceptance criteria:

- [ ] <observable outcome>

Verification:

- [ ] \`<command or evidence surface>\`

Stage gate:

- [ ] Stage all files for this completed phase before starting the next task card.
\`\`\`

Codex should update checklist status as work completes and stop at staging gates long enough to verify \`git status --short\` shows the intended staged files.

## Safety Boundary

MCP planner profile is for workflow artifacts only. It must not expose source-code edits, arbitrary shell commands, package manifest writes, lockfile writes, CI writes, secrets, \`_ops/\`, or writable \`_ref/\` access.

The orchestrator dev runner is separate from planner mode. It is off by default and exists only for users who intentionally want ChatGPT Developer Mode to trigger a local Codex/Claude CLI against the fixed Codex goal handoff.

The coding profile is separate from both. It requires user-scoped v3 config and an explicit \`read_write\` grant, defaults to an isolated worktree, and exposes only \`open_workspace\`, \`read\`, \`apply_patch\`, \`exec_command\`, and \`write_stdin\`. Its shell has local-user authority and is not a filesystem sandbox. Secret paths, \`.git/**\`, \`.env*\`, \`_ops/**\`, writable \`_ref/**\`, traversal, and symlink escapes remain denied.
`, changed);
  writeFileIfChanged(join(skillRoot, 'references', 'chatgpt-connector-manual.md'), chatgptGuideMarkdown(), changed);
  return {
    status: 'ok',
    repoRoot,
    changed,
    lines: [`[repo-harness mcp] Skill installed: ${relative(repoRoot, skillRoot)}`],
  };
}

export function runMcpPrintGuide(opts: { repo?: string; endpoint?: string; write?: boolean }): McpSetupResult {
  const repoRoot = resolveMcpRepoRoot(opts.repo ?? '.');
  const changed: string[] = [];
  const endpoint = normalizePublicMcpEndpoint(opts.endpoint);
  const content = chatgptGuideMarkdown(opts.write === true ? undefined : endpoint);
  if (opts.write === true) {
    writeFileIfChanged(join(repoRoot, 'docs', 'repo-harness-chatgpt-mcp-setup.md'), chatgptGuideMarkdown(), changed);
  }
  return {
    status: 'ok',
    repoRoot,
    changed,
    lines: [
      content.trimEnd(),
      ...(opts.write === true && endpoint ? ['', `[repo-harness mcp] ChatGPT endpoint for this session: ${endpoint}`] : []),
    ],
  };
}

export function runMcpDoctor(opts: { repo?: string; json?: boolean }): McpSetupResult {
  const repoRoot = resolveMcpRepoRoot(opts.repo ?? '.');
  const configScope = resolveMcpConfigScope(repoRoot);
  const localConfig = loadMcpLocalConfig(repoRoot);
  const registeredRepoCount = readRegisteredRepoHarnessRepos({ adoptedOnly: true }).length;
  const configuredServerName = localConfig?.chatgpt?.serverName;
  const host = localConfig?.server?.host ?? '127.0.0.1';
  const port = localConfig?.server?.port ?? 8765;
  const authMode = localConfig?.auth?.mode ?? 'missing';
  const configuredAllowedRoots = localConfig?.permissions?.allowedRoots ?? [];
  const allowedRootReports = configuredAllowedRoots.map((rawRoot) => {
    const absolutePath = resolve(rawRoot);
    try {
      const fileStat = statSync(absolutePath);
      return {
        path: absolutePath,
        exists: true,
        readable: fileStat.isDirectory(),
        canonicalPath: fileStat.isDirectory() ? realpathSync(absolutePath) : undefined,
      };
    } catch (_error) {
      return { path: absolutePath, exists: false, readable: false };
    }
  });
  const home = realpathSync(homedir());
  const unsafeAllowedRoots = allowedRootReports
    .filter((entry) => entry.canonicalPath === '/' || entry.canonicalPath === home || (
      entry.canonicalPath !== undefined && sensitiveAllowedRootReason(entry.canonicalPath) !== undefined
    ))
    .map((entry) => entry.path);
  const codexConfigPath = join(repoRoot, '.codex', 'config.toml');
  const codexConfig = existsSync(codexConfigPath) ? readFileSync(codexConfigPath, 'utf-8') : '';
  const codexHasServer = codexConfig.includes('[mcp_servers.repo_harness]');
  const missingTools = REQUIRED_CODEX_TOOLS.filter((tool) => !codexConfig.includes(`"${tool}"`));
  const codexCommand = Bun.which('codex');
  const authConfigured = (authMode === 'oauth' && existsSync(mcpOAuthPath(repoRoot, configScope))) ||
    ((authMode === 'bearer' || authMode === 'url-token') && existsSync(mcpTokenPath(repoRoot, configScope)));
  const status = existsSync(join(repoRoot, '.ai', 'harness', 'policy.json'))
    ? 'ready_local'
    : configScope === 'user' && Boolean(localConfig) && authConfigured
      ? 'ready_user'
      : 'not_adopted';
  const report = {
    status,
    repo: repoRoot,
    mcp: {
      packageVersion: repoHarnessPackageVersion(),
      configScope,
      configVersion: localConfig?.version,
      configVersionOk: localConfig?.version === 3,
      localConfig: Boolean(localConfig),
      guide: existsSync(join(repoRoot, 'docs', 'repo-harness-chatgpt-mcp-setup.md')),
      authConfigured,
      permissions: {
        configurationScope: configScope,
        fullDiskRead: false,
        allowedRootCount: localConfig?.permissions?.allowedRoots?.length ?? 0,
        allowedRoots: allowedRootReports,
        unsafeAllowedRoots,
        registeredRepoCount,
        legacyFullDiskReadDetected: localConfig?.permissions?.fullDiskRead === true || localConfig?.permissions?.legacyFullDiskReadDetected === true,
      },
      capabilities: {
        workspaceReader: localConfig?.capabilities?.workspaceReader === true || localConfig?.capabilities?.reader === true,
        workflowPlanner: localConfig?.capabilities?.workflowPlanner !== false,
        workflowExecutor: localConfig?.capabilities?.workflowExecutor === true,
        agentRunner: localConfig?.capabilities?.agentRunner === true,
        workspaceCoder: localConfig?.capabilities?.workspaceCoder === true,
      },
      authorizationRevision: repoHarnessAuthorizationRevision(),
      devMode: {
        agentRunner: localConfig?.devMode?.agentRunner === true,
        allowedAgents: localConfig?.devMode?.allowedAgents ?? ['codex'],
        timeoutMs: localConfig?.devMode?.timeoutMs ?? 120000,
      },
    },
    codex: {
      cliAvailable: codexCommand !== null,
      configured: codexHasServer && missingTools.length === 0,
      configPath: '.codex/config.toml',
      hasServer: codexHasServer,
      missingTools,
      fix: 'repo-harness mcp setup codex --repo . --scope project',
    },
    chatgpt: {
      ...(configuredServerName ? { serverName: configuredServerName } : {}),
      serverNameConfigured: Boolean(configuredServerName),
      defaultServerName: DEFAULT_CHATGPT_MCP_SERVER_NAME,
      localEndpoint: `http://${host}:${port}/mcp`,
      publicEndpoint: localConfig?.chatgpt?.endpoint,
      publicEndpointConfigured: Boolean(localConfig?.chatgpt?.endpoint),
      authMode,
      healthExpectations: {
        packageVersion: repoHarnessPackageVersion(),
        offlineAccessDiscovery: true,
        mcpDeleteSupported: true,
      },
      manualStepsRequired: true,
      invocationVerification: {
        status: 'manual_required',
        checkableByDoctor: false,
        scope: 'per_chat_model_surface',
        acceptedEvidence: [
          'called_tool_event',
          'captured_tool_call_transcript',
        ],
      },
      setup: configScope === 'user'
        ? `repo-harness mcp setup chatgpt --repo ${repoRoot} --scope user`
        : 'repo-harness mcp setup chatgpt --repo .',
    },
  };
  return {
    status: 'ok',
    repoRoot,
    changed: [],
    lines: opts.json === true ? [JSON.stringify(report, null, 2)] : [
      `[repo-harness mcp] Repo: ${repoRoot}`,
      `[repo-harness mcp] Status: ${report.status}`,
      `[repo-harness mcp] Package version: ${report.mcp.packageVersion}`,
      `[repo-harness mcp] Config scope: ${configScope} (version: ${report.mcp.configVersion ?? 'missing'})`,
      `[repo-harness mcp] Reader capability: ${report.mcp.capabilities.workspaceReader ? `enabled (${report.mcp.permissions.registeredRepoCount} registered repos, ${report.mcp.permissions.allowedRootCount} explicit roots)` : 'disabled'} (configuration scope: ${report.mcp.permissions.configurationScope})`,
      ...(report.mcp.permissions.allowedRoots.length > 0 ? [`[repo-harness mcp] Allowed roots: ${report.mcp.permissions.allowedRoots.map((entry) => `${entry.readable ? 'ok' : 'bad'}:${entry.path}`).join(', ')}`] : []),
      ...(report.mcp.permissions.unsafeAllowedRoots.length > 0 ? [`[repo-harness mcp] Unsafe allowed roots: ${report.mcp.permissions.unsafeAllowedRoots.join(', ')}`] : []),
      ...(report.mcp.permissions.legacyFullDiskReadDetected ? ['[repo-harness mcp] Legacy full-disk read: detected; rerun setup with --enable-reader --allow-root <path>'] : []),
      `[repo-harness mcp] ChatGPT MCP server name: ${
        configuredServerName ?? `missing (run setup; default is ${DEFAULT_CHATGPT_MCP_SERVER_NAME})`
      }`,
      '[repo-harness mcp] ChatGPT tool invocation: manual verification required (doctor checks local MCP health, not per-chat/model dispatch)',
      `[repo-harness mcp] ChatGPT guide: ${report.mcp.guide ? 'present' : 'missing'}`,
      `[repo-harness mcp] ChatGPT auth: ${report.mcp.authConfigured ? `${authMode} present` : 'missing'}`,
      `[repo-harness mcp] Dev runner: ${report.mcp.devMode.agentRunner ? `enabled (${report.mcp.devMode.allowedAgents.join(',')})` : 'disabled'}`,
      `[repo-harness mcp] Codex config: ${report.codex.configured ? 'present' : 'missing'}`,
      `[repo-harness mcp] Codex CLI: ${report.codex.cliAvailable ? 'present' : 'missing'}`,
      `[repo-harness mcp] Next ChatGPT setup: ${report.chatgpt.setup}`,
    ],
  };
}

interface LiveLayer {
  name: 'config_ready' | 'local_ready' | 'tunnel_ready' | 'oauth_ready' | 'mcp_ready';
  ok: boolean;
  detail: string;
}

async function fetchWithTimeout(url: string, init: RequestInit = {}): Promise<Response> {
  return fetch(url, { ...init, signal: AbortSignal.timeout(8_000) });
}

function jsonFromMcpResponse(text: string): Record<string, unknown> | null {
  const trimmed = text.trim();
  if (!trimmed) return null;
  try {
    return JSON.parse(trimmed) as Record<string, unknown>;
  } catch {
    for (const line of trimmed.split(/\r?\n/)) {
      if (!line.startsWith('data:')) continue;
      try {
        return JSON.parse(line.slice(5).trim()) as Record<string, unknown>;
      } catch {
        // Continue to the next SSE data line.
      }
    }
    return null;
  }
}

export async function runMcpLiveDoctor(opts: { repo?: string; json?: boolean }): Promise<McpSetupResult> {
  const repoRoot = resolveMcpRepoRoot(opts.repo ?? '.');
  const configScope = resolveMcpConfigScope(repoRoot);
  const config = loadMcpLocalConfig(repoRoot);
  const host = config?.server?.host ?? '127.0.0.1';
  const port = config?.server?.port ?? 8765;
  const localOrigin = `http://${host}:${port}`;
  const publicEndpoint = config?.chatgpt?.endpoint;
  const publicOrigin = publicEndpoint ? new URL(publicEndpoint).origin : undefined;
  const coding = config?.profile === 'coding';
  const readWriteRepos = readRegisteredRepoHarnessRepos({ adoptedOnly: true }).filter((repo) => repo.accessMode === 'read_write');
  const layers: LiveLayer[] = [];
  const configReady = config?.version === 3 && config?.auth?.mode === 'oauth' && Boolean(publicEndpoint) && (!coding || (
    config.capabilities?.workspaceCoder === true && readWriteRepos.length > 0
  ));
  layers.push({
    name: 'config_ready',
    ok: configReady,
    detail: configReady
      ? `profile=${config?.profile ?? 'planner'} config=v3 authorization_revision=${repoHarnessAuthorizationRevision()}`
      : 'run setup with a stable endpoint and explicit coding grant',
  });

  let localReady = false;
  try {
    const response = await fetchWithTimeout(`${localOrigin}/health`);
    const health = response.ok ? await response.json() as Record<string, unknown> : {};
    localReady = response.ok && health.profile === (config?.profile ?? 'planner');
    layers.push({ name: 'local_ready', ok: localReady, detail: localReady ? `health profile=${String(health.profile)}` : `local health returned ${response.status}` });
  } catch (error) {
    layers.push({ name: 'local_ready', ok: false, detail: error instanceof Error ? error.message : String(error) });
  }

  let tunnelReady = false;
  if (!publicOrigin) {
    layers.push({ name: 'tunnel_ready', ok: false, detail: 'public HTTPS /mcp endpoint is not configured' });
  } else {
    try {
      const response = await fetchWithTimeout(`${publicOrigin}/health`);
      tunnelReady = response.ok;
      layers.push({ name: 'tunnel_ready', ok: tunnelReady, detail: tunnelReady ? `${publicOrigin}/health reachable` : `public health returned ${response.status}` });
    } catch (error) {
      layers.push({ name: 'tunnel_ready', ok: false, detail: error instanceof Error ? error.message : String(error) });
    }
  }

  let oauthReady = false;
  let mcpReady = false;
  let toolNames: string[] = [];
  const probeOrigin = tunnelReady && publicOrigin ? publicOrigin : localReady ? localOrigin : undefined;
  const passphrase = readMcpOAuthPassphrase(repoRoot, configScope);
  if (!probeOrigin || !passphrase) {
    layers.push({ name: 'oauth_ready', ok: false, detail: !probeOrigin ? 'no reachable endpoint for OAuth probe' : 'OAuth passphrase is missing' });
    layers.push({ name: 'mcp_ready', ok: false, detail: 'OAuth probe did not produce a bearer token' });
  } else {
    let accessToken = '';
    let clientId = '';
    let clientSecret = '';
    try {
      const metadataResponse = await fetchWithTimeout(`${probeOrigin}/.well-known/oauth-protected-resource/mcp`);
      if (!metadataResponse.ok) throw new Error(`OAuth metadata returned ${metadataResponse.status}`);
      const redirectUri = 'http://127.0.0.1/callback';
      const registrationResponse = await fetchWithTimeout(`${probeOrigin}/register`, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          client_name: 'repo-harness-live-doctor',
          redirect_uris: [redirectUri],
          grant_types: ['authorization_code', 'refresh_token'],
          response_types: ['code'],
          token_endpoint_auth_method: 'none',
        }),
      });
      if (!registrationResponse.ok) throw new Error(`OAuth registration returned ${registrationResponse.status}`);
      const client = await registrationResponse.json() as { client_id?: string; client_secret?: string };
      clientId = client.client_id ?? '';
      clientSecret = client.client_secret ?? '';
      if (!clientId) throw new Error('OAuth registration omitted client_id');
      const verifier = randomBytes(32).toString('base64url');
      const challenge = createHash('sha256').update(verifier).digest('base64url');
      const scope = ['repo-harness', ...(coding ? ['repo-harness.coding'] : []), 'offline_access'].join(' ');
      const authorize = new URLSearchParams({
        passphrase,
        response_type: 'code',
        client_id: clientId,
        redirect_uri: redirectUri,
        code_challenge: challenge,
        code_challenge_method: 'S256',
        scope,
        state: 'doctor',
      });
      const authorizationResponse = await fetchWithTimeout(`${probeOrigin}/authorize`, {
        method: 'POST',
        headers: { 'content-type': 'application/x-www-form-urlencoded' },
        body: authorize.toString(),
        redirect: 'manual',
      });
      const location = authorizationResponse.headers.get('location');
      const code = location ? new URL(location).searchParams.get('code') ?? '' : '';
      if (!code) throw new Error(`OAuth authorization did not return a code (${authorizationResponse.status})`);
      const tokenBody = new URLSearchParams({
        grant_type: 'authorization_code',
        client_id: clientId,
        code,
        redirect_uri: redirectUri,
        code_verifier: verifier,
        ...(clientSecret ? { client_secret: clientSecret } : {}),
      });
      const tokenResponse = await fetchWithTimeout(`${probeOrigin}/token`, {
        method: 'POST',
        headers: { 'content-type': 'application/x-www-form-urlencoded' },
        body: tokenBody.toString(),
      });
      if (!tokenResponse.ok) throw new Error(`OAuth token exchange returned ${tokenResponse.status}`);
      const token = await tokenResponse.json() as { access_token?: string; scope?: string };
      accessToken = token.access_token ?? '';
      if (!accessToken || (coding && !String(token.scope ?? '').split(' ').includes('repo-harness.coding'))) {
        throw new Error('OAuth token is missing the required coding scope');
      }
      oauthReady = true;
      layers.push({ name: 'oauth_ready', ok: true, detail: `DCR + PKCE succeeded${coding ? ' with repo-harness.coding' : ''}` });

      const initializeResponse = await fetchWithTimeout(`${probeOrigin}/mcp`, {
        method: 'POST',
        headers: { authorization: `Bearer ${accessToken}`, accept: 'application/json, text/event-stream', 'content-type': 'application/json' },
        body: JSON.stringify({ jsonrpc: '2.0', id: 1, method: 'initialize', params: { protocolVersion: '2024-11-05', capabilities: {}, clientInfo: { name: 'repo-harness-live-doctor', version: '1' } } }),
      });
      const sessionId = initializeResponse.headers.get('mcp-session-id') ?? '';
      if (!initializeResponse.ok || !sessionId) throw new Error(`MCP initialize failed (${initializeResponse.status})`);
      await fetchWithTimeout(`${probeOrigin}/mcp`, {
        method: 'POST',
        headers: { authorization: `Bearer ${accessToken}`, accept: 'application/json, text/event-stream', 'content-type': 'application/json', 'mcp-session-id': sessionId },
        body: JSON.stringify({ jsonrpc: '2.0', method: 'notifications/initialized' }),
      });
      const toolsResponse = await fetchWithTimeout(`${probeOrigin}/mcp`, {
        method: 'POST',
        headers: { authorization: `Bearer ${accessToken}`, accept: 'application/json, text/event-stream', 'content-type': 'application/json', 'mcp-session-id': sessionId },
        body: JSON.stringify({ jsonrpc: '2.0', id: 2, method: 'tools/list', params: {} }),
      });
      const toolsPayload = jsonFromMcpResponse(await toolsResponse.text());
      const tools = (toolsPayload?.result as { tools?: Array<{ name?: string }> } | undefined)?.tools ?? [];
      toolNames = tools.map((tool) => tool.name ?? '').filter(Boolean);
      const required = coding ? ['open_workspace', 'read', 'apply_patch', 'exec_command', 'write_stdin'] : REQUIRED_CODEX_TOOLS;
      const missing = required.filter((name) => !toolNames.includes(name));
      const codingSchemaMatches = !coding || JSON.stringify(tools
        .filter((tool) => required.includes(tool.name ?? ''))
        .map((tool) => ({ name: tool.name, inputSchema: (tool as Record<string, unknown>).inputSchema, annotations: (tool as Record<string, unknown>).annotations }))) === JSON.stringify(buildCodingToolDefinitions()
        .map((tool) => ({ name: tool.name, inputSchema: tool.inputSchema, annotations: tool.annotations })));
      mcpReady = toolsResponse.ok && missing.length === 0 && codingSchemaMatches;
      layers.push({
        name: 'mcp_ready',
        ok: mcpReady,
        detail: mcpReady
          ? `initialize + exact tools/list schema succeeded (${toolNames.length} tools)`
          : missing.length > 0 ? `missing tools: ${missing.join(', ')}` : 'coding tool schema mismatch',
      });
      await fetchWithTimeout(`${probeOrigin}/mcp`, {
        method: 'DELETE',
        headers: { authorization: `Bearer ${accessToken}`, 'mcp-session-id': sessionId },
      }).catch(() => undefined);
    } catch (error) {
      if (!oauthReady) layers.push({ name: 'oauth_ready', ok: false, detail: error instanceof Error ? error.message : String(error) });
      layers.push({ name: 'mcp_ready', ok: false, detail: error instanceof Error ? error.message : String(error) });
    } finally {
      if (accessToken && clientId) {
        const revokeBody = new URLSearchParams({ token: accessToken, client_id: clientId, ...(clientSecret ? { client_secret: clientSecret } : {}) });
        await fetchWithTimeout(`${probeOrigin}/revoke`, {
          method: 'POST',
          headers: { 'content-type': 'application/x-www-form-urlencoded' },
          body: revokeBody.toString(),
        }).catch(() => undefined);
      }
    }
  }

  const report = {
    status: mcpReady && layers.every((layer) => layer.ok)
      ? 'mcp_ready'
      : layers.find((layer) => !layer.ok)?.name ?? 'unknown',
    repo: repoRoot,
    profile: config?.profile ?? 'planner',
    layers,
    tool_names: toolNames,
    invocation_verification: 'manual_required',
    accepted_invocation_evidence: ['called_tool_event', 'captured_tool_call_transcript'],
  };
  return {
    status: 'ok',
    repoRoot,
    changed: [],
    lines: opts.json
      ? [JSON.stringify(report, null, 2)]
      : [
          `[repo-harness mcp] Live status: ${report.status}`,
          ...layers.map((layer) => `[repo-harness mcp] ${layer.name}: ${layer.ok ? 'PASS' : 'FAIL'} - ${layer.detail}`),
          '[repo-harness mcp] ChatGPT invocation: manual Called tool evidence still required',
        ],
  };
}
