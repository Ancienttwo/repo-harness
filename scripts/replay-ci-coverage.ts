import { spawnSync } from 'node:child_process';
import { isDocumentationPath, selectCoverage } from './select-ci-coverage';

function git(args: string[]): string {
  const result = spawnSync('git', args, { encoding: 'utf8' });
  if (result.status !== 0) throw new Error(result.stderr || `git ${args[0]} failed`);
  return result.stdout;
}

export function replayCoverage(since: string) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(since)) throw new Error('--since requires YYYY-MM-DD');
  const refSha = git(['rev-parse', 'origin/main']).trim();
  const commits = git(['rev-list', '--first-parent', '--reverse', `--since=${since}T00:00:00Z`, refSha]).trim().split('\n').filter(Boolean);
  const modes: Record<string, number> = {};
  const reasons: Record<string, number> = {};
  for (const headSha of commits) {
    const parents = git(['rev-list', '--parents', '-n', '1', headSha]).trim().split(' ');
    const before = parents[1] ?? '0'.repeat(40);
    const diffRaw = parents[1] ? git(['diff', '--raw', '--no-abbrev', '--no-renames', '-z', before, headSha, '--']) : null;
    const result = selectCoverage({ eventName: 'push', event: { before }, headSha, actualHead: headSha, diffRaw });
    modes[result.mode] = (modes[result.mode] ?? 0) + 1;
    reasons[result.reason] = (reasons[result.reason] ?? 0) + 1;
    const records = diffRaw?.slice(0, -1).split('\0') ?? [];
    const unclassifiedPaths = records.filter((_, index) => index % 2 === 1).filter(path => !isDocumentationPath(path));
    console.log(`${headSha}\t${result.mode}\t${result.reason}\t${JSON.stringify({ unclassifiedPaths })}`);
  }
  console.log(JSON.stringify({ since, ref: 'origin/main', refSha, commits: commits.length, modes, reasons, documentationHitRate: commits.length ? (modes.docs ?? 0) / commits.length : 0 }));
}

if (import.meta.main) {
  const args = process.argv.slice(2);
  if (args.length !== 2 || args[0] !== '--since') throw new Error('Usage: bun scripts/replay-ci-coverage.ts --since YYYY-MM-DD');
  replayCoverage(args[1]!);
}
