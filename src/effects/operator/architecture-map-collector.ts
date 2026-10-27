// Background architecture map collector (PRD G11). It runs only in the
// `operator serve` process on a timer; GET reads `read()` and starts no work.
//
// Each cycle reads the repository registry, then runs one child process per
// registered repository, because the model export, git and archctx run
// synchronously. The child is the setup collector's supervised process: it
// leads its own process group, which the deadline and close kill. Line counts
// and import counts come from git and archctx in that child, never from the
// browser. A repository whose child fails keeps no older map: the map always
// names the commit it describes.

import { fileURLToPath } from 'node:url';

import { decodeArchitectureMap, type ArchitectureMapUnavailableReason, type ArchitectureMapV1 } from '../../core/operator/architecture-map';
import { readRepoHarnessRegistryStrictSnapshot } from '../repo-registry';
import { runSetupProcess, type SetupProcessRunner } from '../setup/collector';
import { executionChildEnvironment } from './execution-collector';

/** The model changes with commits; a cycle costs about 5 s of archctx and git per repository. */
export const ARCHITECTURE_MAP_COLLECT_INTERVAL_MS = 5 * 60_000;
export const ARCHITECTURE_MAP_WORKER_TIMEOUT_MS = 120_000;
export const ARCHITECTURE_MAP_CHILD_ENTRY = fileURLToPath(new URL('./architecture-map-worker.ts', import.meta.url));

export type ArchitectureMapRepositoryCache =
  | { readonly state: 'ready'; readonly map: ArchitectureMapV1 }
  | { readonly state: 'unavailable'; readonly reason: ArchitectureMapUnavailableReason };

export interface ArchitectureMapCollectorOptions {
  readonly env?: NodeJS.ProcessEnv;
  readonly interval_ms?: number;
  readonly timeout_ms?: number;
  readonly run_process?: SetupProcessRunner;
}

export interface ArchitectureMapCollectorHandle {
  /** Cache read only; never starts work. */
  readonly read: (repositoryId: string) => ArchitectureMapRepositoryCache;
  readonly settled: () => Promise<void>;
  readonly close: () => Promise<void>;
}

/** The child's one result line, checked against the repository it was asked for. */
function childResult(stdout: string, repositoryId: string): ArchitectureMapRepositoryCache {
  let value: unknown;
  try { value = JSON.parse(stdout); } catch { return { state: 'unavailable', reason: 'architecture_map_invalid' }; }
  const record = value !== null && typeof value === 'object' && !Array.isArray(value) ? value as Record<string, unknown> : null;
  if (record?.id !== repositoryId) return { state: 'unavailable', reason: 'architecture_map_invalid' };
  if (record.ok === false) return { state: 'unavailable', reason: 'model_unavailable' };
  try {
    const map = decodeArchitectureMap(record.snapshot);
    return map.repository_id === repositoryId ? { state: 'ready', map } : { state: 'unavailable', reason: 'architecture_map_invalid' };
  } catch {
    return { state: 'unavailable', reason: 'architecture_map_invalid' };
  }
}

/** Collect at start, then every interval after the previous cycle settles. Cycles never overlap. */
export function startArchitectureMapCollector(options: ArchitectureMapCollectorOptions = {}): ArchitectureMapCollectorHandle {
  const env = { ...process.env, ...options.env };
  const run = options.run_process ?? runSetupProcess;
  const abort = new AbortController();
  let states = new Map<string, ArchitectureMapRepositoryCache>();
  let registryFailed = false;
  let started = false;
  let closed = false;
  let timer: ReturnType<typeof setTimeout> | undefined;
  let inflight: Promise<void> | null = null;

  const collect = async (repositoryId: string): Promise<ArchitectureMapRepositoryCache> => {
    const result = await run([ARCHITECTURE_MAP_CHILD_ENTRY, repositoryId], {
      cwd: process.cwd(), env: executionChildEnvironment(env), service: 'architecture-map-collector',
      timeout_ms: options.timeout_ms ?? ARCHITECTURE_MAP_WORKER_TIMEOUT_MS, signal: abort.signal,
    });
    return result.ok ? childResult(result.stdout, repositoryId) : { state: 'unavailable', reason: 'model_unavailable' };
  };

  const cycle = (): Promise<void> => {
    inflight = (async () => {
      let repos;
      try { repos = readRepoHarnessRegistryStrictSnapshot({ env }).repos; }
      catch { registryFailed = true; return; }
      const next = new Map<string, ArchitectureMapRepositoryCache>();
      // One repository at a time: each child runs archctx and git over the whole tree.
      for (const repo of repos) {
        if (closed) return;
        let cache: ArchitectureMapRepositoryCache;
        try { cache = await collect(repo.id); }
        catch { cache = { state: 'unavailable', reason: 'model_unavailable' }; }
        next.set(repo.id, cache);
      }
      if (closed) return;
      states = next;
      registryFailed = false;
      started = true;
    })().finally(() => {
      inflight = null;
      if (closed) return;
      timer = setTimeout(() => { void cycle(); }, options.interval_ms ?? ARCHITECTURE_MAP_COLLECT_INTERVAL_MS);
      timer.unref?.();
    });
    return inflight;
  };
  void cycle();

  return Object.freeze({
    read: (repositoryId: string): ArchitectureMapRepositoryCache => {
      if (registryFailed) return { state: 'unavailable', reason: 'registry_unavailable' };
      if (!started) return { state: 'unavailable', reason: 'architecture_map_pending' };
      return states.get(repositoryId) ?? { state: 'unavailable', reason: 'repository_not_found' };
    },
    settled: () => inflight ?? Promise.resolve(),
    close: async () => {
      closed = true;
      clearTimeout(timer);
      // Aborting kills the running child's process group, so a blocked archctx or git does not hold shutdown.
      abort.abort();
      await inflight;
    },
  });
}
