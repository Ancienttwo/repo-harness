import { lstatSync, readdirSync, readFileSync, realpathSync } from 'node:fs';
import { basename, dirname, join, resolve } from 'node:path';
import { tmpdir } from 'node:os';
import { systemWorktreeRoot } from '../../core/worktree-location.mjs';
import { decodeWorktrees, type WorktreesSnapshot, type WorktreeView } from '../../core/operator/worktrees';
import { entries, inspectWorktree, protectsCwd } from '../state/coordination-worktree-topology';
import { resolveGitCommonDirectory } from '../git/common-directory';
import { worktreeId } from '../git/worktree-record';
import { managedWorktreeRoot } from '../git/managed-worktree';
import { worktreeProcesses } from '../git/worktree-processes';
import { readRepoHarnessRegistryStrictSnapshot, type RepoHarnessRegisteredRepo } from '../repo-registry';
import { publicWorktreeText, worktreeSize, type WorktreeSizes } from './worktree-collector-worker';

/** Two directory levels are the documented layouts, never a recursive home scan. */
function candidates(root: string, depth: 1 | 2 = 2, prefix?: string): string[] {
  try {
    const stat = lstatSync(root);
    if (!stat.isDirectory() || stat.isSymbolicLink()) return [];
    const result: string[] = [];
    for (const entry of readdirSync(root, { withFileTypes: true })) {
      if (!entry.isDirectory() || entry.isSymbolicLink() || (prefix !== undefined && !entry.name.startsWith(prefix))) continue;
      const first = join(root, entry.name);
      if (depth === 1) { result.push(realpathSync(first)); continue; }
      let pointer = false;
      try { pointer = lstatSync(join(first, '.git')).isFile(); } catch { /* generation directory */ }
      if (pointer) { result.push(realpathSync(first)); continue; }
      const children = readdirSync(first, { withFileTypes: true }).filter(row => row.isDirectory() && !row.isSymbolicLink());
      if (!children.length) result.push(realpathSync(first));
      else for (const child of children) result.push(realpathSync(join(first, child.name)));
    }
    return result;
  } catch (error) { if ((error as NodeJS.ErrnoException).code === 'ENOENT') return []; throw error; }
}

export function collectOrphanWorktrees(repos: readonly RepoHarnessRegisteredRepo[], previous: WorktreeSizes = {}, env: NodeJS.ProcessEnv = process.env,
  roots: readonly { path: string; source: 'mcp' | 'codex' | 'manual' | 'claude'; depth?: 1 | 2; prefix?: string }[] = [
    { path: join(systemWorktreeRoot(process.platform, tmpdir()), 'repo-harness-mcp-worktrees'), source: 'mcp' },
    { path: join(env.CODEX_HOME ?? join(env.HOME ?? '', '.codex'), 'worktrees'), source: 'codex' },
    ...repos.map(repo => ({ path: managedWorktreeRoot(env), source: 'manual' as const, depth: 1 as const, prefix: `${basename(repo.path)}-wt-` })),
    ...repos.map(repo => ({ path: join(repo.path, '.claude/worktrees'), source: 'claude' as const, depth: 1 as const })),
  ]) {
  const deadline = Date.now() + 20_000;
  const known = new Set<string>();
  const owners = new Map<string, RepoHarnessRegisteredRepo>();
  const snapshot: WorktreesSnapshot = { version: 1, status: 'ready', collected_at: new Date().toISOString(), repositories: [], unassigned: [] };
  for (const repo of repos) {
    // An unreadable topology prevents orphan claims for that cycle.
    const common = resolveGitCommonDirectory(repo.path);
    owners.set(join(common, 'worktrees'), repo);
    for (const entry of entries(repo.path, { deadline })) {
      try { known.add(realpathSync(entry.path)); } catch { known.add(entry.path); }
    }
  }
  const sizes: WorktreeSizes = {};
  const processes = worktreeProcesses(Math.min(deadline, Date.now() + 5_000))?.filter(row => row.pid !== process.pid) ?? null;
  for (const root of roots) for (const path of candidates(root.path, root.depth, root.prefix)) {
    if (known.has(path)) continue;
    known.add(path);
    let repo: RepoHarnessRegisteredRepo | undefined;
    let common = realpathSync(root.path);
    try {
      const pointer = join(path, '.git'), stat = lstatSync(pointer);
      if (stat.isFile() && !stat.isSymbolicLink() && stat.size < 4096) {
        const value = readFileSync(pointer, 'utf8').trim();
        if (value.startsWith('gitdir: ')) {
          const adminParent = dirname(resolve(path, value.slice(8)));
          repo = owners.get(adminParent);
          if (repo) common = dirname(adminParent);
        }
      }
    } catch { /* Without a retained Git pointer, no repository can be assigned. */ }
    const id = worktreeId(common, path);
    const size = worktreeSize(path, previous[id], deadline);
    if (size.cache) sizes[id] = size.cache;
    const count = processes === null ? null : new Set(processes.filter(row => protectsCwd(path, row.cwd)).map(row => row.pid)).size;
    const row: WorktreeView = { id, repository_id: repo?.id ?? null, directory: publicWorktreeText(basename(path)), branch: null, source: root.source,
      record: null, size_bytes: size.bytes, size_observed_at: size.cache?.observed_at ?? null,
      ...(repo ? inspectWorktree(repo.path, path, null, { env, deadline, processes }) : {
        judgment: count ? 'red' as const : 'yellow' as const, reasons: ['unregistered' as const, ...(count === null ? ['process_unknown' as const] : count ? ['process_in_use' as const] : [])],
        process_count: count, dirty_files: null, ignored_entries: null, unpushed_commits: null, merge: 'unknown' as const,
      }) };
    if (!repo) snapshot.unassigned.push(row);
    else {
      let group = snapshot.repositories.find(group => group.repository_id === repo.id);
      if (!group) { group = { repository_id: repo.id, display_name: publicWorktreeText(basename(repo.path)), status: 'ready', worktrees: [] }; snapshot.repositories.push(group); }
      group.worktrees.push(row);
    }
  }
  return { snapshot: decodeWorktrees(snapshot), sizes };
}

if (import.meta.main) {
  const result = collectOrphanWorktrees(readRepoHarnessRegistryStrictSnapshot({ env: process.env }).repos, JSON.parse(process.argv[2] ?? '{}'));
  process.stdout.write(JSON.stringify(result) + '\n', () => process.exit(0));
}
