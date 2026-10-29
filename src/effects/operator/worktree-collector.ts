import { fileURLToPath } from 'node:url';
import { basename } from 'node:path';
import { publicDevActivityText } from '../../core/operator/public-text';
import { decodeWorktrees, unavailableWorktrees, type WorktreesSnapshot } from '../../core/operator/worktrees';
import { readRepoHarnessRegistryStrictSnapshot } from '../repo-registry';
import { runSetupProcess, type SetupProcessRunner } from '../setup/collector';
import { executionChildEnvironment } from './execution-collector';
import type { WorktreeSizes } from './worktree-collector-worker';

export const WORKTREE_COLLECT_INTERVAL_MS = 60_000;

export interface WorktreeSizeCache { readonly repositories: ReadonlyMap<string, WorktreeSizes>; readonly orphans: WorktreeSizes }
export const emptyWorktreeSizeCache = (): WorktreeSizeCache => ({ repositories: new Map(), orphans: {} });

/**
 * One collection cycle: a child per registered repository and one orphan
 * child. The serve collector and `repo-harness worktrees list` both run it.
 */
export async function collectWorktreesOnce(options: { env: NodeJS.ProcessEnv; run_process: SetupProcessRunner; signal: AbortSignal; sizes: WorktreeSizeCache; closed?: () => boolean }): Promise<{ snapshot: WorktreesSnapshot; sizes: WorktreeSizeCache } | null> {
  const { env, signal } = options;
  const run = options.run_process;
  const repos = readRepoHarnessRegistryStrictSnapshot({ env }).repos;
  const next: WorktreesSnapshot = { version: 1, status: 'ready', collected_at: new Date().toISOString(), repositories: [], unassigned: [] };
  const nextSizes = new Map<string, WorktreeSizes>();
  let orphanSizes = options.sizes.orphans;
  for (const repo of repos) {
    if (options.closed?.()) return null;
    try {
      const result = await run([fileURLToPath(new URL('./worktree-collector-worker.ts', import.meta.url)), repo.id, JSON.stringify(options.sizes.repositories.get(repo.id) ?? {})],
        { cwd: repo.path, env, signal, timeout_ms: 25_000, service: 'worktree-collector' });
      if (!result.ok) throw new Error('worker unavailable');
      const value = JSON.parse(result.stdout);
      const view = decodeWorktrees(value.snapshot);
      if (view.repositories.length !== 1 || view.repositories[0]!.repository_id !== repo.id) throw new Error('worker identity invalid');
      next.repositories.push(view.repositories[0]!);
      nextSizes.set(repo.id, value.sizes);
    } catch {
      next.status = 'partial';
      next.repositories.push({ repository_id: repo.id, display_name: publicDevActivityText(basename(repo.path)), status: 'unavailable', worktrees: [] });
    }
  }
  try {
    const result = await run([fileURLToPath(new URL('./worktree-orphans-worker.ts', import.meta.url)), JSON.stringify(orphanSizes)],
      { cwd: process.cwd(), env, signal, timeout_ms: 25_000, service: 'worktree-collector' });
    if (!result.ok) throw new Error('orphan probe unavailable');
    const value = JSON.parse(result.stdout), view = decodeWorktrees(value.snapshot);
    for (const group of view.repositories) {
      const target = next.repositories.find(row => row.repository_id === group.repository_id);
      if (!target) throw new Error('orphan repository invalid');
      const known = new Set(target.worktrees.map(row => row.id));
      target.worktrees.push(...group.worktrees.filter(row => !known.has(row.id)));
    }
    next.unassigned = view.unassigned;
    orphanSizes = value.sizes;
  } catch { next.status = 'partial'; }
  return { snapshot: decodeWorktrees(next), sizes: { repositories: nextSizes, orphans: orphanSizes } };
}

export function startWorktreeCollector(options: { env?: NodeJS.ProcessEnv; interval_ms?: number; run_process?: SetupProcessRunner } = {}) {
  const env = executionChildEnvironment({ ...process.env, ...options.env });
  const abort = new AbortController();
  const run = options.run_process ?? runSetupProcess;
  let snapshot = unavailableWorktrees(), closed = false;
  let sizes = emptyWorktreeSizeCache();
  let timer: ReturnType<typeof setTimeout> | undefined;
  let inflight: Promise<void> | null = null;
  const cycle = (): Promise<void> => {
    inflight = (async () => {
      try {
        const next = await collectWorktreesOnce({ env, run_process: run, signal: abort.signal, sizes, closed: () => closed });
        if (next && !closed) { snapshot = next.snapshot; sizes = next.sizes; }
      } catch { if (!closed) snapshot = unavailableWorktrees(); }
    })().finally(() => {
      inflight = null;
      if (!closed) { timer = setTimeout(() => { void cycle(); }, options.interval_ms ?? WORKTREE_COLLECT_INTERVAL_MS); timer.unref?.(); }
    });
    return inflight;
  };
  void cycle();
  return { read: () => snapshot, settled: () => inflight ?? Promise.resolve(), close: async () => { closed = true; clearTimeout(timer); abort.abort(); await inflight; } };
}
