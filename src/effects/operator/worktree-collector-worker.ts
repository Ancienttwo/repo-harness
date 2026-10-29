import { execFileSync } from 'node:child_process';
import { lstatSync, realpathSync } from 'node:fs';
import { basename, join } from 'node:path';
import { tmpdir } from 'node:os';
import { systemWorktreeRoot } from '../../core/worktree-location.mjs';
import { publicDevActivityText } from '../../core/operator/public-text';
import { decodeWorktrees, type WorktreeLifecycle, type WorktreesSnapshot, type WorktreeSource, type WorktreeView } from '../../core/operator/worktrees';
import { managedWorktreeRoot, isManagedWorktreePath } from '../git/managed-worktree';
import { resolveGitCommonDirectory } from '../git/common-directory';
import { readWorktreeRecord, worktreeId } from '../git/worktree-record';
import { worktreeProcesses, type WorktreeProcess } from '../git/worktree-processes';
import { entries, inspectWorktree } from '../state/coordination-worktree-topology';
import { readRepoHarnessRegistryStrictSnapshot, type RepoHarnessRegisteredRepo } from '../repo-registry';

export interface WorktreeSize { bytes: number | null; observed_at: string; mtime: number }
export type WorktreeSizes = Record<string, WorktreeSize>;
const SIZE_INTERVAL_MS = 15 * 60_000;
export const publicWorktreeText = (text: string): string => publicDevActivityText(text.replace(/[\x00-\x1f\x7f\\]/gu, ' ')).slice(0, 1024) || 'unknown';
const safe = publicWorktreeText;

/** Cache by incarnation and directory mtime, with a minimum interval between du attempts. */
export function worktreeSize(path: string, previous: WorktreeSize | undefined, deadline: number): { cache?: WorktreeSize; bytes: number | null } {
  try {
    const stat = lstatSync(path);
    if (!stat.isDirectory() || stat.isSymbolicLink()) return { bytes: null };
    if (previous && Date.now() - Date.parse(previous.observed_at) < SIZE_INTERVAL_MS) {
      return { cache: previous, bytes: previous.mtime === stat.mtimeMs ? previous.bytes : null };
    }
    let bytes: number | null = null;
    try {
      const output = execFileSync('du', ['-sk', path], { encoding: 'utf8', timeout: Math.max(1, Math.min(2_000, deadline - Date.now())), stdio: ['ignore', 'pipe', 'pipe'] });
      const count = Number(output.split(/\s/u)[0]) * 1024;
      if (Number.isSafeInteger(count) && count >= 0) bytes = count;
    } catch { /* Failed attempts also observe the low-frequency retry interval. */ }
    return { cache: { bytes, observed_at: new Date().toISOString(), mtime: stat.mtimeMs }, bytes };
  } catch { return { bytes: null }; }
}

export type WorktreeTopologyEntry = ReturnType<typeof entries>[number];
/** Canonical checkout paths of a clone's registered worktrees, each with its Git entry. */
export function registeredWorktreePaths(topology: readonly WorktreeTopologyEntry[]): { readonly path: string; readonly entry: WorktreeTopologyEntry | undefined }[] {
  const canonical = (path: string) => { try { return realpathSync(path); } catch { return path; } };
  return [...new Set(topology.map(entry => canonical(entry.path)))].sort()
    .map(path => ({ path, entry: topology.find(row => row.path === path || canonical(row.path) === path) }));
}

/**
 * One public row. The collector and the cleanup effect both build rows here,
 * so the selection digest of a row the page shows matches the effect's fresh row.
 */
export function repositoryWorktreeRow(input: {
  readonly repo: RepoHarnessRegisteredRepo; readonly common: string; readonly managed_root: string; readonly id: string; readonly path: string;
  readonly entry: WorktreeTopologyEntry | undefined; readonly size_bytes: number | null; readonly size_observed_at: string | null;
  readonly caller_cwd: string | null; readonly env: NodeJS.ProcessEnv; readonly deadline: number; readonly processes: WorktreeProcess[] | null;
}): WorktreeView {
  const { repo, common, path, env } = input;
  const saved = readWorktreeRecord(common, path);
  let record: WorktreeLifecycle | null = null;
  if (saved) record = { creator: saved.creator, purpose: safe(saved.purpose), task_id: saved.task_id === null ? null : safe(saved.task_id), pull_request: saved.pull_request,
    created_at: saved.created_at, ended_at: saved.ended_at, end_state: saved.end_state };
  let source: WorktreeSource = saved?.creator ?? 'unknown';
  if (!saved) {
    if (isManagedWorktreePath(path, input.managed_root, basename(repo.path))) source = 'manual';
    else if (path.startsWith(join(repo.path, '.claude/worktrees') + '/')) source = 'claude';
    else if (path.startsWith(join(env.HOME ?? '', '.codex/worktrees') + '/')) source = 'codex';
    else if (path.startsWith(join(systemWorktreeRoot(process.platform, tmpdir()), 'repo-harness-mcp-worktrees') + '/')) source = 'mcp';
  }
  return { id: input.id, repository_id: repo.id, directory: safe(basename(path)), branch: input.entry?.branch ? safe(input.entry.branch.replace(/^refs\/heads\//u, '')) : null,
    source, record, size_bytes: input.size_bytes, size_observed_at: input.size_observed_at,
    ...inspectWorktree(repo.path, path, input.caller_cwd, { env, deadline: input.deadline, processes: input.processes }) };
}

export function collectRepositoryWorktrees(repo: RepoHarnessRegisteredRepo, previous: WorktreeSizes = {}, env: NodeJS.ProcessEnv = process.env) {
  const deadline = Date.now() + 20_000;
  const common = resolveGitCommonDirectory(repo.path);
  const topology = entries(repo.path, { deadline });
  const root = managedWorktreeRoot(env);
  const processes = worktreeProcesses(Math.min(deadline, Date.now() + 5_000))?.filter(row => row.pid !== process.pid) ?? null;
  const sizes: WorktreeSizes = {};
  const worktrees: WorktreeView[] = registeredWorktreePaths(topology).map(({ path, entry }) => {
    const id = worktreeId(common, path);
    const size = worktreeSize(path, previous[id], deadline);
    if (size.cache) sizes[id] = size.cache;
    return repositoryWorktreeRow({ repo, common, managed_root: root, id, path, entry, size_bytes: size.bytes, size_observed_at: size.cache?.observed_at ?? null,
      caller_cwd: null, env, deadline, processes });
  });
  const snapshot: WorktreesSnapshot = { version: 1, status: 'ready', collected_at: new Date().toISOString(), unassigned: [], repositories: [
    { repository_id: repo.id, display_name: safe(basename(repo.path)), status: 'ready', worktrees },
  ] };
  return { snapshot: decodeWorktrees(snapshot), sizes };
}

if (import.meta.main) {
  const repo = readRepoHarnessRegistryStrictSnapshot({ env: process.env }).repos.find(row => row.id === process.argv[2]);
  if (!repo) throw new Error('repository unavailable');
  const result = collectRepositoryWorktrees(repo, JSON.parse(process.argv[3] ?? '{}'));
  process.stdout.write(JSON.stringify(result) + '\n', () => process.exit(0));
}
