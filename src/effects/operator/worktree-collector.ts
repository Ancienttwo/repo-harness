import { fileURLToPath } from 'node:url';
import { basename } from 'node:path';
import { publicDevActivityText } from '../../core/dev-activity/decode';
import { decodeWorktrees, unavailableWorktrees, type WorktreesSnapshot } from '../../core/operator/worktrees';
import { readRepoHarnessRegistryStrictSnapshot } from '../repo-registry';
import { runSetupProcess, type SetupProcessRunner } from '../setup/collector';
import { executionChildEnvironment } from './execution-collector';
import type { WorktreeSizes } from './worktree-collector-worker';

export const WORKTREE_COLLECT_INTERVAL_MS = 60_000;
export function startWorktreeCollector(options: { env?: NodeJS.ProcessEnv; interval_ms?: number; run_process?: SetupProcessRunner } = {}) {
  const env = executionChildEnvironment({ ...process.env, ...options.env });
  const abort = new AbortController();
  const run = options.run_process ?? runSetupProcess;
  let snapshot = unavailableWorktrees(), closed = false;
  let sizes = new Map<string, WorktreeSizes>();
  let orphanSizes: WorktreeSizes = {};
  let timer: ReturnType<typeof setTimeout> | undefined;
  let inflight: Promise<void> | null = null;
  const cycle = (): Promise<void> => {
    inflight = (async () => {
      try {
        const repos = readRepoHarnessRegistryStrictSnapshot({ env }).repos;
        const next: WorktreesSnapshot = { version: 1, status: 'ready', collected_at: new Date().toISOString(), repositories: [], unassigned: [] };
        const nextSizes = new Map<string, WorktreeSizes>();
        for (const repo of repos) {
          if (closed) return;
          try {
            const result = await run([fileURLToPath(new URL('./worktree-collector-worker.ts', import.meta.url)), repo.id, JSON.stringify(sizes.get(repo.id) ?? {})],
              { cwd: repo.path, env, signal: abort.signal, timeout_ms: 25_000, service: 'worktree-collector' });
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
            { cwd: process.cwd(), env, signal: abort.signal, timeout_ms: 25_000, service: 'worktree-collector' });
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
        if (!closed) { snapshot = decodeWorktrees(next); sizes = nextSizes; }
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
