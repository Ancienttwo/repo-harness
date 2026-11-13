// Prints the commit that starts the daily architecture lag clock.
// Usage: bun scripts/architecture-render-clock.ts <render-check summary> <commit after M>...
// The commits are first-parent and oldest first.
import { firstRenderChangeCommit } from '../src/core/architecture/projection';
import { capabilityOwnersForPaths } from '../src/effects/state/resolve-effective-state';
import { gitExecFileSync } from '../src/effects/git/runner';

const [summaryPath, ...shas] = process.argv.slice(2);
if (!summaryPath || shas.length === 0) throw new Error('usage: architecture-render-clock.ts <summary> <commit>...');
const summary = JSON.parse(await Bun.file(summaryPath).text()) as { differingCapabilityIds?: unknown };
const ids = summary.differingCapabilityIds;
if (ids !== null && !(Array.isArray(ids) && ids.every(id => typeof id === 'string'))) throw new Error('render-check summary differingCapabilityIds must be a string array or null');

const root = process.cwd();
const commits = shas.map(sha => ({
  sha,
  paths: gitExecFileSync(['-C', root, 'diff', '--name-only', '--no-renames', '-z', `${sha}^`, sha, '--'], { encoding: 'utf8' }).split('\0').filter(Boolean),
}));
const owners = ids === null || ids.length === 0 ? new Map() : capabilityOwnersForPaths(root, [...new Set(commits.flatMap(commit => commit.paths))]);
console.log(firstRenderChangeCommit(commits, ids, path => owners.get(path)?.id));
