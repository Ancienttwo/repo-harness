import { Command } from 'commander';
import { setRepoHarnessAccessMode, setRepoHarnessPanePrefix } from '../../effects/repo-registry';
import type { McpServeOptions } from '../mcp/cli-actions';

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
        const { runMcpServeCommand } = await import('../mcp/cli-actions');
        await runMcpServeCommand(rawOpts);
      });
    });

  mcp
    .command('doctor')
    .description('Check repo-harness MCP setup status')
    .option('--repo <path>', 'Repository root to inspect', '.')
    .option('--json', 'Output JSON instead of human-readable text')
    .action(async (rawOpts: { repo?: string; json?: boolean }) => {
      await runMcpAction(async () => {
        const { runMcpDoctorCommand } = await import('../mcp/cli-actions');
        runMcpDoctorCommand(rawOpts);
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
  access
    .command('prefix')
    .description('Set the pane prefix that labeled seats use for a repository')
    .requiredOption('--repo <path>', 'Adopted repository')
    .requiredOption('--pane-prefix <prefix>', 'Pane prefix: a letter, then 1 to 5 letters or digits, lowercase')
    .option('--json', 'Output JSON')
    .action((rawOpts: { repo: string; panePrefix: string; json?: boolean }) => {
      void runMcpAction(() => {
        const result = setRepoHarnessPanePrefix(rawOpts.repo, rawOpts.panePrefix);
        if (!result.registered) throw new Error(result.reason ?? 'repo is not adopted');
        console.log(rawOpts.json ? JSON.stringify(result, null, 2) : `[repo-harness mcp] ${result.path}: pane prefix ${result.panePrefix}`);
      });
    });
  mcp.addCommand(access);

  return mcp;
}
