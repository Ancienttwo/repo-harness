import { Command, InvalidArgumentError } from 'commander';
import { formatDevActivityBrief } from '../../core/dev-activity/brief';
import { collectDevActivity } from '../../effects/dev-activity/collector';
import { canonicalRepoPath, readRepoHarnessRegistryStrictSnapshot } from '../../effects/repo-registry';

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
    .action(async (options: { json?: boolean; repo: string[]; maxItems: number }) => {
      let selected: Set<string> | undefined;
      if (options.repo.length) {
        const registry = readRepoHarnessRegistryStrictSnapshot({ adoptedOnly: false });
        selected = new Set(options.repo.map(path => {
          const root = canonicalRepoPath(path);
          const repo = registry.repos.find(entry => entry.path === root);
          if (!repo) throw new InvalidArgumentError('--repo must name a registered repository root');
          return repo.id;
        }));
      }
      let snapshot = await collectDevActivity();
      // The collector owns all process limits. Select its rows without another collector.
      if (selected && snapshot.status !== 'unavailable') {
        const repositories = snapshot.repositories.filter(repo => selected.has(repo.repository_id));
        snapshot = {
          ...snapshot,
          repositories,
          items: snapshot.items.filter(item => selected.has(item.repository_id)),
          attention: snapshot.attention.filter(item => selected.has(item.repository_id)),
          unreadable_registrations: selected.size - repositories.length,
        };
      }
      console.log(options.json ? JSON.stringify(snapshot) : formatDevActivityBrief(snapshot, options.maxItems));
      if (snapshot.status === 'unavailable') process.exitCode = 1;
    });
}
