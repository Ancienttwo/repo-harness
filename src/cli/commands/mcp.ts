import { Command } from 'commander';
import { startMcpStdio } from '../mcp/transports/stdio';
import { setRepoHarnessAccessMode } from '../../effects/repo-registry';
import { runMcpDoctor } from '../mcp/doctor';

export interface McpServeOptions {
  repo?: string;
  profile: string;
  enableReader?: boolean;
  allowRoot?: string[];
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

export function buildMcpCommand(): Command {
  const mcp = new Command('mcp').description('Run and configure the repo-harness MCP workflow sidecar');

  mcp
    .command('serve')
    .description('Start the repo-harness MCP server over stdio')
    .option('--repo <path>', 'Default repository/bootstrap context for workflow-scoped MCP tools', '.')
    .option('--profile <profile>', 'MCP profile: planner|executor', 'planner')
    .option('--enable-reader', 'Force read-only workspace tools in this same MCP connector; registered adopted repos are included automatically')
    .option('--allow-root <path>', 'Additional non-repo local root for workspace reader/discovery tools; may be repeated', collectOption, [])
    .action(async (rawOpts: McpServeOptions) => {
      await runMcpAction(async () => {
        await startMcpStdio({
          repo: rawOpts.repo,
          profile: rawOpts.profile,
          enableReader: rawOpts.enableReader === true,
          allowedRoots: rawOpts.allowRoot,
        });
      });
    });

  mcp
    .command('doctor')
    .description('Check repo-harness MCP setup status')
    .option('--repo <path>', 'Repository root to inspect', '.')
    .option('--json', 'Output JSON instead of human-readable text')
    .action((rawOpts: { repo?: string; json?: boolean }) => {
      void runMcpAction(() => {
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

  return mcp;
}
