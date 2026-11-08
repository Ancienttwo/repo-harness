import { Command } from 'commander';
import type { WorktreeCleanOptions, WorktreePathOptions } from './worktrees-actions';

const actions = () => import('./worktrees-actions');

export function buildWorktreesCommand(): Command {
  const worktrees = new Command('worktrees').description('List worktrees of registered repositories and remove green ones');
  worktrees
    .command('list')
    .description('Collect every worktree with its judgment, reasons and the selection digest')
    .option('--json', 'Output JSON')
    .action(async (options: { readonly json?: boolean }) => (await actions()).list(options));
  worktrees
    .command('clean')
    .description('Remove green worktrees by stable id; a non-green or changed selection removes nothing')
    .requiredOption('--ids <ids>', 'Comma-separated worktree ids from `worktrees list`')
    .requiredOption('--expected-digest <digest>', 'Selection digest from `worktrees list`')
    .option('--request-id <uuid>', 'Lower-case UUID; reuse it to replay the recorded result')
    .option('--json', 'Output JSON')
    .action(async (options: WorktreeCleanOptions) => (await actions()).clean(options));
  worktrees
    .command('path')
    .description('Print the absolute path of one registered worktree as JSON, for the desktop shell')
    .option('--repository <id>', 'Repository id from `worktrees list --json`')
    .option('--worktree <id>', 'Worktree id from `worktrees list --json`')
    .action(async (options: WorktreePathOptions) => (await actions()).path(options));
  return worktrees;
}
