import { Command } from 'commander';
import { isAbsolute, relative } from 'path';
import { createMcpToolContext } from '../mcp/server';
import { startMcpHttp } from '../mcp/transports/http';
import { startMcpStdio } from '../mcp/transports/stdio';
import { callMcpTool } from '../mcp/tools';
import {
  runMcpDoctor,
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
}

interface McpSetupChatgptOptions {
  repo?: string;
  host?: string;
  port?: string;
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
    .option('--repo <path>', 'Repository root to expose through workflow-scoped MCP tools', '.')
    .option('--transport <transport>', 'Transport: stdio|http', 'stdio')
    .option('--host <host>', 'HTTP bind host', '127.0.0.1')
    .option('--port <port>', 'HTTP bind port', '8765')
    .option('--profile <profile>', 'MCP profile: planner|executor|orchestrator', 'planner')
    .option('--auth <mode>', 'HTTP auth mode: oauth|bearer', 'oauth')
    .action(async (rawOpts: McpServeOptions) => {
      await runMcpAction(async () => {
        if (rawOpts.transport === 'stdio') {
          await startMcpStdio({ repo: rawOpts.repo, profile: rawOpts.profile });
          return;
        }
        if (rawOpts.transport === 'http') {
          await startMcpHttp({
            repo: rawOpts.repo,
            profile: rawOpts.profile,
            host: rawOpts.host,
            port: parsePort(rawOpts.port),
            auth: rawOpts.auth,
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
    .option('--json', 'Output JSON instead of human-readable text')
    .action((rawOpts: { repo?: string; json?: boolean }) => {
      void runMcpAction(() => {
        const result = runMcpDoctor(rawOpts);
        console.log(result.lines.join('\n'));
      });
    });

  const setup = new Command('setup').description('Generate MCP setup files for ChatGPT or Codex');

  setup
    .command('chatgpt')
    .description('Generate ChatGPT Connector local config and manual setup guide')
    .option('--repo <path>', 'Repository root to configure', '.')
    .option('--host <host>', 'Local MCP HTTP bind host', '127.0.0.1')
    .option('--port <port>', 'Local MCP HTTP bind port', '8765')
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
