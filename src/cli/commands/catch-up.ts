import { Command, InvalidArgumentError } from 'commander';
import type { CatchUpOptions } from './catch-up-actions';

const actions = () => import('./catch-up-actions');

function maxItems(value: string): number {
  if (!/^[1-9][0-9]*$/u.test(value) || !Number.isSafeInteger(Number(value))) {
    throw new InvalidArgumentError('max-items must be a positive integer');
  }
  return Number(value);
}

export function buildCatchUpCommand(): Command {
  return new Command('catch-up')
    .description('Read a cross-repository brief from the development activity snapshot')
    .option('--json', 'Print the snapshot as one JSON line')
    .option('--repo <path>', 'Show a registered root; repeat to select more roots', (value: string, previous: string[]) => [...previous, value], [])
    .option('--max-items <N>', 'Maximum text items per repository', maxItems, 10)
    .action(async (options: CatchUpOptions) => (await actions()).catchUp(options));
}
