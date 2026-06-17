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

## Human Workflow

Use ChatGPT for planning and review. Use Codex for local execution.

1. Ask ChatGPT to inspect workflow state with read-only tools first.
2. Ask ChatGPT to turn the idea into a PRD with \`write_prd_from_idea\`.
3. Ask ChatGPT to turn the PRD into a checklist Sprint with \`write_checklist_sprint\`.
4. Ask ChatGPT to prepare a Codex Goal with \`prepare_codex_goal_from_sprint\`.
5. Open Codex locally and run the generated \`/goal\` prompt.
6. Let Codex execute one Sprint task card at a time, run checks, update the checklist, and stage each completed phase before continuing.

The sidecar is not a remote coding agent. It prepares workflow artifacts for the local agent host.

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
- MCP does not expose a default Codex runner. It prepares \`.ai/harness/handoff/codex-goal.md\`; the local Codex host owns \`/goal\` execution unless the user explicitly enables the local orchestrator dev runner.
- The orchestrator dev runner is local-only, opt-in, timeout-bounded, audited, and limited to the fixed Codex goal handoff. It is not arbitrary shell.
- Keep \`_ref/\` read-only when used as a comparison source.
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
    devMode: {
      agentRunner: false,
      allowedAgents: ['codex'],
      timeoutMs: 120000,
    },
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

## When To Use

Use this Skill when the user asks to set up, operate, inspect, or continue the repo-harness ChatGPT MCP Connector, or when a ChatGPT-generated repo-harness PRD/Sprint/Goal handoff needs to be consumed by Codex.

This Skill has three modes:

1. Setup mode: configure local MCP server files, ChatGPT guide, or Codex MCP config.
2. Planning handoff mode: preserve the chain idea -> PRD -> checklist Sprint -> Codex Goal.
3. Execution mode: local Codex reads \`.ai/harness/handoff/codex-goal.md\` and executes the referenced checklist Sprint.

## First Reads

Before acting, read the repo-local source of truth that matches the mode:

- Setup: \`docs/repo-harness-chatgpt-mcp-setup.md\`, \`.repo-harness/mcp.local.json\` if present, and \`repo-harness mcp doctor --repo .\`.
- Planning handoff: \`docs/spec.md\`, \`tasks/current.md\`, existing \`plans/prds/\`, existing \`plans/sprints/\`, and latest \`.ai/harness/handoff/\`.
- Execution: \`.ai/harness/handoff/codex-goal.md\`, the referenced PRD, the referenced Sprint, \`tasks/current.md\`, and \`.ai/harness/handoff/resume.md\` when present.

Do not rely on chat history when these files exist.

## Agent Responsibilities

1. Treat ChatGPT as planner/reviewer and Codex as executor.
2. Prefer \`repo-harness mcp\` CLI commands over manual file edits when preparing setup or handoff artifacts.
3. Keep ChatGPT write access limited to PRD, checklist Sprint, plan, notes, and approved handoff artifacts.
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
阅读： <prd-path>
开worktree完整执行：<sprint-path>
完成阶段性任务，要staging再继续
参考repo: <optional-reference-repo>
\`\`\`

## Safety Boundaries

Never do these through MCP:

- Do not expose arbitrary shell execution.
- Do not allow ChatGPT to edit application source files.
- Do not commit secrets, OAuth passphrases, bearer tokens, tunnel tokens, or \`~/.codex/auth.json\`.
- Do not paste MCP OAuth passphrases into chat, logs, issues, PRs, or handoff files.
- Do not implement or run a default remote \`codex exec\` runner.
- Do not modify \`_ref/\`, \`_ops/\`, \`.env*\`, \`.git/\`, package lockfiles, or source paths through planner-profile MCP tools.

MCP prepares \`.ai/harness/handoff/codex-goal.md\`; the local Codex host owns \`/goal\` execution.

Exception: if the user explicitly enables the local \`orchestrator\` dev runner setting, MCP may expose \`run_agent_goal\`. That tool must stay local-only, timeout-bounded, audited, limited to the fixed \`.ai/harness/handoff/codex-goal.md\`, and limited to user-allowed agents such as \`codex\` or \`claude\`. It is not arbitrary shell and must not be exposed through an untrusted tunnel.

## Setup Commands

Use these commands from the adopted repo root:

\`\`\`bash
repo-harness mcp doctor --repo .
repo-harness mcp setup chatgpt --repo .
repo-harness mcp setup codex --repo . --scope project
repo-harness mcp install-skill --repo .
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

The MCP server prepares artifacts only. The local Codex host owns \`/goal\` execution.

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
      `[repo-harness mcp] Dev runner: ${report.mcp.devMode.agentRunner ? `enabled (${report.mcp.devMode.allowedAgents.join(',')})` : 'disabled'}`,
      `[repo-harness mcp] Codex config: ${report.codex.configured ? 'present' : 'missing'}`,
      `[repo-harness mcp] Codex CLI: ${report.codex.cliAvailable ? 'present' : 'missing'}`,
      `[repo-harness mcp] Next ChatGPT setup: ${report.chatgpt.setup}`,
    ],
  };
}
