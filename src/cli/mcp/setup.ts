import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'fs';
import { dirname, join, relative } from 'path';
import { ensureMcpBearerToken, ensureMcpOAuthPassphrase, loadMcpLocalConfig, mcpOAuthPath, mcpTokenPath } from './auth';
import { resolveMcpRepoRoot } from './repo';

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

function writeFileIfChanged(path: string, content: string, changed: string[]): void {
  if (existsSync(path) && readFileSync(path, 'utf-8') === content) return;
  mkdirSync(dirname(path), { recursive: true });
  writeFileSync(path, content, 'utf-8');
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

export function chatgptGuideMarkdown(endpoint = '<https-tunnel-url>/mcp'): string {
  return `# repo-harness ChatGPT MCP Connector Setup

## Prerequisites

- A repo-harness adopted repository.
- A local \`repo-harness\` CLI on PATH.
- ChatGPT workspace access to Developer Mode and custom MCP Connectors.
- A public HTTPS tunnel for ChatGPT Web. Local Codex can use stdio without a tunnel.

## Start Local MCP Server

\`\`\`bash
repo-harness mcp serve --repo . --transport http --host 127.0.0.1 --port 8765 --profile planner
\`\`\`

Health check:

\`\`\`bash
curl http://127.0.0.1:8765/health
\`\`\`

The ChatGPT path uses OAuth with a local passphrase. The passphrase is stored in an ignored local file:

\`\`\`bash
jq -r .passphrase .repo-harness/mcp.oauth.json
\`\`\`

Do not commit or paste this passphrase into issue trackers, PRs, or shared logs.

OAuth discovery smoke:

\`\`\`bash
curl http://127.0.0.1:8765/.well-known/oauth-protected-resource/mcp
\`\`\`

## Start Tunnel

\`\`\`bash
cloudflared tunnel --url http://127.0.0.1:8765
\`\`\`

Use this Connector URL:

\`\`\`text
${endpoint}
\`\`\`

## Create ChatGPT Connector

1. Open ChatGPT Settings.
2. Enable Developer Mode if your workspace exposes it.
3. Go to Connectors.
4. Create a Connector named \`repo-harness\`.
5. Paste the HTTPS Connector URL ending in \`/mcp\`.
6. Configure Connector authentication as OAuth.
7. Click Scan Tools.
8. When the authorization page opens, enter the passphrase from \`.repo-harness/mcp.oauth.json\`.
9. Wait for the tool scan to finish, then create the Connector.
10. Keep write confirmations enabled.

## Test Prompt

\`\`\`text
Use repo-harness to inspect this repo. Call harness_status, latest_handoff, and list_workflow_files. Do not write files.
\`\`\`

## PRD Prompt

\`\`\`text
Use repo-harness to inspect docs/spec.md, tasks/current.md, latest handoff, and existing plans. Convert this idea into a PRD with write_prd_from_idea. Do not edit source code.
\`\`\`

## Checklist Sprint Prompt

\`\`\`text
Use repo-harness to read the PRD. Convert it into an ordered checklist Sprint with write_checklist_sprint. Every task card must include a stage gate that requires Codex to stage the completed phase before continuing.
\`\`\`

## Codex Goal Prompt

\`\`\`text
Use repo-harness prepare_codex_goal_from_sprint with the PRD path and checklist Sprint path. Return the host-native /goal prompt. Do not run Codex remotely.
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
- If writes fail, verify the target path is a PRD, sprint, plan, or approved handoff file.
- If ChatGPT generated prose instead of checklist Sprint task cards, ask it to use write_checklist_sprint.
- If Codex cannot see the server, run \`repo-harness mcp setup codex --repo . --scope project\`.

## Security Notes

- This MCP server exposes workflow artifacts, not general filesystem access.
- The \`/mcp\` endpoint requires OAuth-issued Bearer tokens by default. Do not expose it through a tunnel without Connector auth configured.
- \`repo-harness mcp serve --auth bearer\` is available for non-ChatGPT clients that can send a static bearer token.
- Planner profile cannot write application source files, package manifests, lockfiles, CI config, secrets, or files outside the repo root.
- MCP does not expose a default Codex runner. It prepares \`.ai/harness/handoff/codex-goal.md\`; the local Codex host owns \`/goal\` execution.
- Do not put tunnel tokens, OAuth tokens, passphrases, or ChatGPT/Codex credentials in git.
`;
}

export function runMcpSetupChatgpt(opts: { repo?: string; host?: string; port?: string; endpoint?: string }): McpSetupResult {
  const repoRoot = resolveMcpRepoRoot(opts.repo ?? '.');
  const changed: string[] = [];
  const host = opts.host ?? '127.0.0.1';
  const port = opts.port ?? '8765';
  const configPath = join(repoRoot, '.repo-harness', 'mcp.local.json');
  const guidePath = join(repoRoot, 'docs', 'repo-harness-chatgpt-mcp-setup.md');
  const token = ensureMcpBearerToken(repoRoot);
  const oauth = ensureMcpOAuthPassphrase(repoRoot);
  if (token.changed) changed.push(token.path);
  if (oauth.changed) changed.push(oauth.path);
  const config = {
    version: 1,
    repo: repoRoot,
    server: { host, port: Number(port), transport: 'http' },
    auth: { mode: 'oauth', oauthFile: '.repo-harness/mcp.oauth.json', tokenFile: '.repo-harness/mcp.tokens.json' },
    profile: 'planner',
  };
  writeFileIfChanged(configPath, `${JSON.stringify(config, null, 2)}\n`, changed);
  writeFileIfChanged(guidePath, chatgptGuideMarkdown(opts.endpoint), changed);
  ensureGitignoreEntries(repoRoot, [
    '.repo-harness/mcp.local.json',
    '.repo-harness/mcp.tokens.json',
    '.repo-harness/mcp.oauth.json',
    '.repo-harness/mcp.oauth-tokens.json',
    '.ai/harness/mcp/audit.log',
  ], changed);

  return {
    status: 'ok',
    repoRoot,
    changed,
    lines: [
      `[repo-harness mcp] Repo: ${repoRoot}`,
      '[repo-harness mcp] Profile: planner',
      `[repo-harness mcp] Local endpoint: http://${host}:${port}/mcp`,
      '[repo-harness mcp] ChatGPT endpoint: requires HTTPS tunnel',
      `[repo-harness mcp] Auth: OAuth passphrase (${relative(repoRoot, oauth.path)})`,
      `[repo-harness mcp] Bearer fallback token: ${relative(repoRoot, token.path)}`,
      `[repo-harness mcp] Config: ${relative(repoRoot, configPath)}`,
      `[repo-harness mcp] Guide: ${relative(repoRoot, guidePath)}`,
      `Next: repo-harness mcp serve --repo . --transport http --host ${host} --port ${port} --profile planner`,
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

Responsibilities:

1. Treat ChatGPT as planner/reviewer and Codex as executor.
2. Do not store or print secrets, OAuth passphrases, tunnel tokens, or ~/.codex/auth.json.
3. Prefer repo-harness CLI commands over manual file edits.
4. Keep ChatGPT write access limited to PRD, sprint, plan, and handoff artifacts.
5. Before execution, read docs/spec.md, tasks/current.md, .ai/harness/handoff/resume.md, and .ai/harness/handoff/codex-goal.md when present.
6. If setting up ChatGPT Connector, run repo-harness mcp doctor, then repo-harness mcp setup chatgpt --repo ., and do not log into ChatGPT unless explicitly asked for assisted setup.
7. If assisted browser setup is requested, never type passwords, 2FA codes, OAuth passphrases, or admin approvals without user instruction.
8. For planning, preserve the chain: idea -> PRD -> checklist Sprint -> Codex Goal.
9. Checklist Sprints must use task cards with stage gates; Codex should stage each completed phase before continuing.
10. MCP may prepare .ai/harness/handoff/codex-goal.md, but it must not run Codex remotely or expose a default codex exec runner.
11. If executing the latest ChatGPT plan, read .ai/harness/handoff/codex-goal.md, run repo-harness workflow checks, execute only the scoped task, and update review evidence plus handoff.
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

The MCP server prepares artifacts only. The local Codex host owns \`/goal\` execution.

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
  const content = chatgptGuideMarkdown(opts.endpoint);
  if (opts.write === true) {
    writeFileIfChanged(join(repoRoot, 'docs', 'repo-harness-chatgpt-mcp-setup.md'), content, changed);
  }
  return {
    status: 'ok',
    repoRoot,
    changed,
    lines: [content.trimEnd()],
  };
}

export function runMcpDoctor(opts: { repo?: string; json?: boolean }): McpSetupResult {
  const repoRoot = resolveMcpRepoRoot(opts.repo ?? '.');
  const localConfig = loadMcpLocalConfig(repoRoot);
  const host = localConfig?.server?.host ?? '127.0.0.1';
  const port = localConfig?.server?.port ?? 8765;
  const authMode = localConfig?.auth?.mode ?? 'missing';
  const codexConfigPath = join(repoRoot, '.codex', 'config.toml');
  const codexConfig = existsSync(codexConfigPath) ? readFileSync(codexConfigPath, 'utf-8') : '';
  const codexHasServer = codexConfig.includes('[mcp_servers.repo_harness]');
  const missingTools = REQUIRED_CODEX_TOOLS.filter((tool) => !codexConfig.includes(`"${tool}"`));
  const codexCommand = Bun.which('codex');
  const report = {
    status: existsSync(join(repoRoot, '.ai', 'harness', 'policy.json')) ? 'ready_local' : 'not_adopted',
    repo: repoRoot,
    mcp: {
      localConfig: existsSync(join(repoRoot, '.repo-harness', 'mcp.local.json')),
      guide: existsSync(join(repoRoot, 'docs', 'repo-harness-chatgpt-mcp-setup.md')),
      authConfigured: (authMode === 'oauth' && existsSync(mcpOAuthPath(repoRoot))) ||
        (authMode === 'bearer' && existsSync(mcpTokenPath(repoRoot))),
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
      localEndpoint: `http://${host}:${port}/mcp`,
      authMode,
      manualStepsRequired: true,
      setup: 'repo-harness mcp setup chatgpt --repo .',
    },
  };
  return {
    status: 'ok',
    repoRoot,
    changed: [],
    lines: opts.json === true ? [JSON.stringify(report, null, 2)] : [
      `[repo-harness mcp] Repo: ${repoRoot}`,
      `[repo-harness mcp] Status: ${report.status}`,
      `[repo-harness mcp] ChatGPT guide: ${report.mcp.guide ? 'present' : 'missing'}`,
      `[repo-harness mcp] ChatGPT auth: ${report.mcp.authConfigured ? `${authMode} present` : 'missing'}`,
      `[repo-harness mcp] Codex config: ${report.codex.configured ? 'present' : 'missing'}`,
      `[repo-harness mcp] Codex CLI: ${report.codex.cliAvailable ? 'present' : 'missing'}`,
      `[repo-harness mcp] Next ChatGPT setup: ${report.chatgpt.setup}`,
    ],
  };
}
