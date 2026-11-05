import { Command } from 'commander';

export interface StrategyCommandOptions { repo: string; document?: string; load?: string[]; topic?: string[]; target?: string; dryRun?: boolean }

const actions = () => import('./strategy-actions');

function contextOptions(command: Command): Command {
  return command.option('--repo <path>', 'Exact project worktree root', '.')
    .option('--load <id...>', 'Explicit lesson IDs to load (at most eight)')
    .option('--topic <topic...>', 'Exact applicability topics');
}
export function buildStrategyCommand(): Command {
  const strategy = new Command('strategy').description('Explicit read-only strategic reflection; proposals never authorize execution');
  strategy.command('status').option('--repo <path>', 'Exact project worktree root', '.')
    .action(async (o: StrategyCommandOptions) => (await actions()).status(o));
  contextOptions(strategy.command('pilot').argument('[proposal]', 'Optional project-local proposal to validate against the canonical pilot'))
    .action(async (path: string | undefined, o: StrategyCommandOptions) => (await actions()).pilot(path, o));
  contextOptions(strategy.command('context')).action(async (o: StrategyCommandOptions) => (await actions()).context(o));
  contextOptions(strategy.command('validate').argument('<proposal>', 'Repository-relative proposal JSON').option('--document <path>', 'Explicit project-local context document'))
    .action(async (path: string, o: StrategyCommandOptions) => (await actions()).validate(path, o));
  for (const action of ['install', 'uninstall'] as const) {
    strategy.command(`${action}-skill`).option('--target <host>', 'codex|claude|both', 'both')
      .option('--dry-run', 'Preview owned host projection changes')
      .action(async (o: StrategyCommandOptions) => (await actions()).projectSkill(action, o));
  }
  return strategy;
}
