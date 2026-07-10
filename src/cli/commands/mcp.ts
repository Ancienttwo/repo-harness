import { Command } from 'commander';
import { isAbsolute, relative } from 'path';
import { createMcpToolContext } from '../mcp/server';
import { startMcpHttp } from '../mcp/transports/http';
import { startMcpStdio } from '../mcp/transports/stdio';
import { callMcpTool } from '../mcp/tools';
import { cleanupManagedCodingWorkspace, listManagedCodingWorkspaces } from '../mcp/coding-workspaces';
import { setRepoHarnessAccessMode } from '../../effects/repo-registry';
import {
  runMcpDoctor,
  runMcpLiveDoctor,
  runMcpInstallSkill,
  runMcpPrintGuide,
  runMcpSetupChatgpt,
  runMcpSetupCodex,
} from '../mcp/setup';

export interface McpServeOptions {
  repo?: string;
  transport: string;
  host: string;
  port: string;
  profile: string;
  auth?: string;
  enableReader?: boolean;
  allowRoot?: string[];
  enableChatgptBrowser?: boolean;
  enableDevRunner?: boolean;
  devRunnerAgents?: string;
  devRunnerTimeoutMs?: string;
}

interface McpSetupChatgptOptions {
  repo?: string;
  scope?: string;
  host?: string;
  port?: string;
  endpoint?: string;
  serverName?: string;
  enableReader?: boolean;
  allowRoot?: string[];
  allowFullDiskRead?: boolean;
  profile?: string;
  grantReadWrite?: string[];
}

interface McpSetupCodexOptions {
  repo?: string;
  scope?: string;
  dryRun?: boolean;
}

interface McpInstallSkillOptions {
  repo?: string;
  overwrite?: boolean;
  dryRun?: boolean;
}

interface McpPrepareGoalOptions {
  repo?: string;
  prd: string;
  sprint: string;
  referenceRepo?: string;
  extraInstructions?: string;
  overwrite?: boolean;
}

function parsePort(value: string): number {
  const port = Number(value);
  if (!Number.isInteger(port) || port <= 0 || port > 65535) {
    throw new Error(`invalid --port "${value}"`);
  }
  return port;
}

function parsePositiveIntegerOption(name: string, value: string | undefined): number | undefined {
  if (value === undefined) return undefined;
  const parsed = Number(value);
  if (!Number.isInteger(parsed) || parsed <= 0) throw new Error(`invalid --${name} "${value}"`);
  return parsed;
}

function collectOption(value: string, previous: string[] = []): string[] {
  return [...previous, value];
}

async function runMcpAction(action: () => void | Promise<void>): Promise<void> {
  try {
    await action();
  } catch (error) {
    console.error(`repo-harness mcp: ${error instanceof Error ? error.message : String(error)}`);
    process.exit(2);
  }
}

async function prepareCodexGoalFromSprint(rawOpts: McpPrepareGoalOptions): Promise<string[]> {
  const ctx = createMcpToolContext({ repo: rawOpts.repo ?? '.', profile: 'planner' });
  const prdPath = toRepoRelativeInput(ctx.repoRoot, rawOpts.prd);
  const sprintPath = toRepoRelativeInput(ctx.repoRoot, rawOpts.sprint);
  const result = await callMcpTool(ctx, 'prepare_codex_goal_from_sprint', {
    prd_path: prdPath,
    sprint_path: sprintPath,
    goal_prd_path: rawOpts.prd,
    goal_sprint_path: rawOpts.sprint,
    reference_repo: rawOpts.referenceRepo,
    extra_instructions: rawOpts.extraInstructions,
    overwrite: rawOpts.overwrite === true,
  });
  const payload = JSON.parse(result.content[0]?.text ?? '{}');
  if (payload.error) {
    throw new Error(`${payload.error.code}: ${payload.error.message}`);
  }
  return [
    `[repo-harness mcp] Codex goal: ${payload.path}`,
    '[repo-harness mcp] Host-native /goal prompt:',
    '',
    String(payload.prompt ?? '').trimEnd(),
  ];
}

function toRepoRelativeInput(repoRoot: string, path: string): string {
  if (!isAbsolute(path)) return path;
  const relativePath = relative(repoRoot, path).split('\\').join('/');
  if (relativePath === '' || relativePath.startsWith('../') || relativePath === '..') return path;
  return relativePath;
}

export function buildMcpCommand(): Command {
  const mcp = new Command('mcp').description('Run and configure the repo-harness MCP workflow sidecar');

  mcp
    .command('serve')
    .description('Start the repo-harness MCP server')
    .option('--repo <path>', 'Default repository/bootstrap context for workflow-scoped MCP tools', '.')
    .option('--transport <transport>', 'Transport: stdio|http', 'stdio')
    .option('--host <host>', 'HTTP bind host', '127.0.0.1')
    .option('--port <port>', 'HTTP bind port', '8765')
    .option('--profile <profile>', 'MCP profile: planner|executor|orchestrator|coding', 'planner')
    .option('--auth <mode>', 'HTTP auth mode: oauth|bearer|url-token', 'oauth')
    .option('--enable-reader', 'Force read-only workspace tools in this same MCP connector; registered adopted repos are included automatically')
    .option('--allow-root <path>', 'Additional non-repo local root for workspace reader/discovery tools; may be repeated', collectOption, [])
    .option('--enable-chatgpt-browser', 'Expose tools that operate the user logged-in ChatGPT Web browser session')
    .option('--enable-dev-runner', 'Enable local dev-mode agent runner tools for the orchestrator profile')
    .option('--dev-runner-agents <agents>', 'Comma-separated dev runner agents: codex,claude')
    .option('--dev-runner-timeout-ms <ms>', 'Dev runner timeout in milliseconds')
    .action(async (rawOpts: McpServeOptions) => {
      await runMcpAction(async () => {
        const devRunnerTimeoutMs = parsePositiveIntegerOption('dev-runner-timeout-ms', rawOpts.devRunnerTimeoutMs);
        if (rawOpts.transport === 'stdio') {
          await startMcpStdio({
            repo: rawOpts.repo,
            profile: rawOpts.profile,
            enableReader: rawOpts.enableReader === true,
            allowedRoots: rawOpts.allowRoot,
            enableChatgptBrowser: rawOpts.enableChatgptBrowser === true,
            enableDevRunner: rawOpts.enableDevRunner,
            devRunnerAgents: rawOpts.devRunnerAgents,
            devRunnerTimeoutMs,
          });
          return;
        }
        if (rawOpts.transport === 'http') {
          await startMcpHttp({
            repo: rawOpts.repo,
            profile: rawOpts.profile,
            enableReader: rawOpts.enableReader === true,
            allowedRoots: rawOpts.allowRoot,
            host: rawOpts.host,
            port: parsePort(rawOpts.port),
            auth: rawOpts.auth,
            enableChatgptBrowser: rawOpts.enableChatgptBrowser === true,
            enableDevRunner: rawOpts.enableDevRunner,
            devRunnerAgents: rawOpts.devRunnerAgents,
            devRunnerTimeoutMs,
          });
          return;
        }
        throw new Error(`serve: invalid --transport "${rawOpts.transport}" (expected: stdio, http)`);
      });
    });

  mcp
    .command('doctor')
    .description('Check repo-harness MCP setup status')
    .option('--repo <path>', 'Repository root to inspect', '.')
    .option('--live', 'Probe local/public health, OAuth metadata, and MCP tool schema without changing external state')
    .option('--json', 'Output JSON instead of human-readable text')
    .action((rawOpts: { repo?: string; json?: boolean; live?: boolean }) => {
      void runMcpAction(() => {
        if (rawOpts.live) {
          return runMcpLiveDoctor(rawOpts).then((result) => console.log(result.lines.join('\n')));
        }
        console.log(runMcpDoctor(rawOpts).lines.join('\n'));
      });
    });

  const access = new Command('access').description('Manage explicit user-scope MCP repo access');
  access
    .command('set')
    .requiredOption('--repo <path>', 'Adopted repository to authorize')
    .requiredOption('--mode <mode>', 'Access mode: read_only|read_write')
    .option('--json', 'Output JSON')
    .action((rawOpts: { repo: string; mode: string; json?: boolean }) => {
      void runMcpAction(() => {
        if (rawOpts.mode !== 'read_only' && rawOpts.mode !== 'read_write') throw new Error('access mode must be read_only or read_write');
        const result = setRepoHarnessAccessMode(rawOpts.repo, rawOpts.mode);
        if (!result.registered) throw new Error(result.reason ?? 'repo is not adopted');
        console.log(rawOpts.json ? JSON.stringify(result, null, 2) : `[repo-harness mcp] ${result.path}: ${result.accessMode} (authorization revision ${result.authorizationRevision})`);
      });
    });
  mcp.addCommand(access);

  const workspaces = new Command('workspaces').description('Inspect or clean locally managed coding worktrees');
  workspaces
    .command('list')
    .option('--json', 'Output JSON')
    .action((rawOpts: { json?: boolean }) => {
      void runMcpAction(() => {
        const rows = listManagedCodingWorkspaces();
        console.log(rawOpts.json ? JSON.stringify({ workspaces: rows }, null, 2) : rows.map((row) => `${row.id}\t${row.branch}\t${row.dirty ? 'dirty' : 'clean'}\t${row.path_exists ? 'present' : 'missing'}`).join('\n'));
      });
    });
  workspaces
    .command('cleanup')
    .requiredOption('--workspace-id <id>', 'Managed workspace id')
    .option('--json', 'Output JSON')
    .action((rawOpts: { workspaceId: string; json?: boolean }) => {
      void runMcpAction(() => {
        const result = cleanupManagedCodingWorkspace(rawOpts.workspaceId);
        console.log(rawOpts.json ? JSON.stringify(result, null, 2) : `[repo-harness mcp] Removed ${result.workspace_id} (${result.branch})`);
      });
    });
  mcp.addCommand(workspaces);

  const setup = new Command('setup').description('Generate MCP setup files for ChatGPT or Codex');

  setup
    .command('chatgpt')
    .description('Generate ChatGPT Connector local config and manual setup guide')
    .option('--repo <path>', 'Repository root to configure', '.')
    .option('--scope <scope>', 'Config scope: repo|user', 'repo')
    .option('--host <host>', 'Local MCP HTTP bind host')
    .option('--port <port>', 'Local MCP HTTP bind port')
    .option('--endpoint <url>', 'Stable public HTTPS /mcp endpoint to store in ignored local config')
    .option('--server-name <name>', 'ChatGPT Connector/MCP server name to record in ignored local config')
    .option('--profile <profile>', 'MCP profile to configure: planner|executor|orchestrator|coding')
    .option('--grant-read-write <path>', 'Explicitly grant one adopted repo read_write access for coding; may be repeated', collectOption, [])
    .option('--enable-reader', 'Enable read-only workspace tools in the same ChatGPT MCP Connector; registered adopted repos are included automatically')
    .option('--allow-root <path>', 'Additional non-repo local root for workspace reader/discovery tools; may be repeated', collectOption, [])
    .option('--allow-full-disk-read', 'Deprecated: use --enable-reader with explicit --allow-root paths')
    .action((rawOpts: McpSetupChatgptOptions) => {
      void runMcpAction(() => {
        const result = runMcpSetupChatgpt(rawOpts);
        console.log(result.lines.join('\n'));
      });
    });

  setup
    .command('codex')
    .description('Patch Codex MCP config for repo-harness')
    .option('--repo <path>', 'Repository root to configure', '.')
    .option('--scope <scope>', 'Config scope: project|user', 'project')
    .option('--dry-run', 'Print planned changes without writing files')
    .action((rawOpts: McpSetupCodexOptions) => {
      void runMcpAction(() => {
        const result = runMcpSetupCodex(rawOpts);
        console.log(result.lines.join('\n'));
      });
    });

  mcp.addCommand(setup);

  mcp
    .command('install-skill')
    .description('Install the repo-harness ChatGPT bridge Codex Skill')
    .option('--repo <path>', 'Repository root to configure', '.')
    .option('--overwrite', 'Replace an existing repo-local bridge Skill')
    .option('--dry-run', 'Print planned installation without writing files')
    .action((rawOpts: McpInstallSkillOptions) => {
      void runMcpAction(() => {
        const result = runMcpInstallSkill(rawOpts);
        console.log(result.lines.join('\n'));
      });
    });

  mcp
    .command('prepare-goal')
    .description('Prepare .ai/harness/handoff/codex-goal.md and print a host-native /goal prompt from a PRD and checklist Sprint')
    .option('--repo <path>', 'Repository root to configure', '.')
    .requiredOption('--prd <path>', 'PRD path to read')
    .requiredOption('--sprint <path>', 'Checklist Sprint path to execute')
    .option('--reference-repo <path>', 'Read-only reference repo path to include in the Goal')
    .option('--extra-instructions <text>', 'Additional bounded execution instruction for Codex')
    .option('--overwrite', 'Replace an existing Codex goal handoff')
    .action((rawOpts: McpPrepareGoalOptions) => {
      void runMcpAction(async () => {
        const lines = await prepareCodexGoalFromSprint(rawOpts);
        console.log(lines.join('\n'));
      });
    });

  mcp
    .command('print-chatgpt-guide')
    .description('Print the ChatGPT Connector setup guide')
    .option('--repo <path>', 'Repository root to inspect', '.')
    .option('--endpoint <url>', 'Public HTTPS /mcp endpoint to include in the guide')
    .option('--write', 'Write docs/repo-harness-chatgpt-mcp-setup.md')
    .action((rawOpts: { repo?: string; endpoint?: string; write?: boolean }) => {
      void runMcpAction(() => {
        const result = runMcpPrintGuide(rawOpts);
        console.log(result.lines.join('\n'));
      });
    });

  return mcp;
}
