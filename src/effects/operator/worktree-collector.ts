import { fileURLToPath } from 'node:url';
import { basename } from 'node:path';
import { publicDevActivityText } from '../../core/public-projections/public-text';
import { decodeWorktrees, unavailableWorktrees, type WorktreesSnapshot } from '../../core/public-projections/worktrees';
import { readRepoHarnessRegistryStrictSnapshot } from '../repo-registry';
import { runSetupProcess, type SetupProcessRunner } from '../setup/collector';
import { executionChildEnvironment } from './execution-collector';
import { replaceObservation, startObservationLoop } from '../observation-loop';
import type { WorktreeSizes } from './worktree-collector-worker';

export const WORKTREE_COLLECT_INTERVAL_MS = 60_000;

export interface WorktreeSizeCache { readonly repositories: ReadonlyMap<string, WorktreeSizes>; readonly orphans: WorktreeSizes }
export const emptyWorktreeSizeCache = (): WorktreeSizeCache => ({ repositories: new Map(), orphans: {} });

/**
 * One collection cycle: a child per registered repository and one orphan
 * child. The serve collector and `rh worktrees list` both run it.
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
  const run = options.run_process ?? runSetupProcess;
  let sizes = emptyWorktreeSizeCache();
  // Keep rule: a failed cycle replaces the snapshot, so no row or size of an older cycle is served as current.
  const loop = startObservationLoop<WorktreesSnapshot, 'worktree_collect_failed'>({
    cycle: async ({ signal }) => {
      try {
        const next = await collectWorktreesOnce({ env, run_process: run, signal, sizes, closed: () => signal.aborted });
        if (next === null) return { state: 'unavailable', reason: 'worktree_collect_failed' };
        sizes = next.sizes;
        return { state: 'observed', value: next.snapshot };
      } catch { return { state: 'unavailable', reason: 'worktree_collect_failed' }; }
    },
    keep: replaceObservation,
    failure: 'worktree_collect_failed',
    interval_ms: options.interval_ms ?? WORKTREE_COLLECT_INTERVAL_MS,
  });
  return {
    read: (): WorktreesSnapshot => {
      const state = loop.read();
      return state.state === 'observed' ? state.value : unavailableWorktrees();
    },
    settled: loop.settled,
    close: loop.close,
  };
}
