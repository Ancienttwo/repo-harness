import { Command } from 'commander';
import { collectStrategyContext, validateStrategyRequest, strategyStatus, StrategySourceDriftError } from '../../effects/strategy/context';
import { projectStrategySkill } from '../../effects/strategy/skill';

interface Options { repo: string; load?: string[]; topic?: string[]; target?: string; dryRun?: boolean }
function run(action: () => unknown): void {
  try { process.stdout.write(`${JSON.stringify(action())}\n`); }
  catch (error) {
    process.stderr.write(`${JSON.stringify({ status: error instanceof StrategySourceDriftError ? 'stale' : 'invalid', executionAuthorized: false, error: error instanceof Error ? error.message : String(error) })}\n`);
    process.exitCode = 1;
  }
}
function contextOptions(command: Command): Command {
  return command.option('--repo <path>', 'Exact project worktree root', '.')
    .option('--load <id...>', 'Explicit lesson IDs to load (at most eight)')
    .option('--topic <topic...>', 'Exact applicability topics');
}
export function buildStrategyCommand(): Command {
  const strategy = new Command('strategy').description('Explicit read-only strategic reflection; proposals never authorize execution');
  strategy.command('status').option('--repo <path>', 'Exact project worktree root', '.')
    .action((o: Options) => run(() => strategyStatus(o.repo)));
  contextOptions(strategy.command('context')).action((o: Options) => run(() => collectStrategyContext(o.repo, { load: o.load, topics: o.topic })));
  contextOptions(strategy.command('validate').argument('<proposal>', 'Repository-relative proposal JSON'))
    .action((path: string, o: Options) => run(() => {
      const result = validateStrategyRequest(o.repo, path, { load: o.load, topics: o.topic });
      if (result.status !== 'reviewable') process.exitCode = 1;
      return result;
    }));
  for (const action of ['install', 'uninstall'] as const) {
    strategy.command(`${action}-skill`).option('--target <host>', 'codex|claude|both', 'both')
      .option('--dry-run', 'Preview owned host projection changes')
      .action((o: Options) => run(() => projectStrategySkill({ action, target: o.target, dryRun: o.dryRun })));
  }
  return strategy;
}
