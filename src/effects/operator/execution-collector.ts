// Background execution-state collector (PRD G2, G15). It runs only in the
// `operator serve` process on a timer; GET reads `read()` and starts no work.
//
// Each cycle reads the repository registry and the Herdr notify install record,
// then runs `collectTaskExecutionStates` for every registered repository in one
// worker thread, because it reads files and runs `ps` synchronously. A deadline
// terminates the worker. A repository whose read fails, or every repository of a
// cycle whose worker fails, is unavailable: a stale verified session is never shown.

import { Worker } from 'node:worker_threads';
import {
  projectTaskExecutionView,
  type ExecutionStateUnavailableReason,
  type TaskExecutionViewV1,
} from '../../core/operator/execution-state';
import { readRepoHarnessRegistryStrictSnapshot } from '../repo-registry';
import { readNotifyInstallSession } from '../terminal/herdr-notify-install';
import type { ExecutionStateWorkerRequest, ExecutionStateWorkerResult } from './execution-state-worker';

export const EXECUTION_COLLECT_INTERVAL_MS = 30_000;
export const EXECUTION_WORKER_TIMEOUT_MS = 20_000;
const READ_ONLY_GIT_ENVIRONMENT = { GIT_NO_LAZY_FETCH: '1', GIT_OPTIONAL_LOCKS: '0', GIT_TERMINAL_PROMPT: '0' } as const;

export type ExecutionRepositoryCache =
  | { readonly state: 'ready'; readonly view: TaskExecutionViewV1 }
  | { readonly state: 'unavailable'; readonly reason: ExecutionStateUnavailableReason };

/** One run of the worker. `null` is a failed run: an error, an exit without a result, or the deadline. */
export type ExecutionWorkerRunner = (
  request: ExecutionStateWorkerRequest,
  options: { readonly env: NodeJS.ProcessEnv; readonly timeout_ms: number; readonly signal: AbortSignal },
) => Promise<readonly ExecutionStateWorkerResult[] | null>;

export const runExecutionWorker: ExecutionWorkerRunner = (request, options) => new Promise((settle) => {
  if (options.signal.aborted) { settle(null); return; }
  const worker = new Worker(new URL('./execution-state-worker.ts', import.meta.url), {
    workerData: request, env: { ...options.env, ...READ_ONLY_GIT_ENVIRONMENT },
  });
  let result: readonly ExecutionStateWorkerResult[] | null = null;
  const stop = () => { void worker.terminate().catch(() => {}); };
  const timer = setTimeout(stop, options.timeout_ms);
  options.signal.addEventListener('abort', stop, { once: true });
  worker.once('message', (value: unknown) => {
    if (Array.isArray(value) && value.length === request.repos.length) result = value as ExecutionStateWorkerResult[];
    stop();
  });
  worker.once('error', stop);
  // Settle on exit only, so a terminated worker has released its thread.
  worker.once('exit', () => {
    clearTimeout(timer);
    options.signal.removeEventListener('abort', stop);
    settle(result);
  });
});

export interface ExecutionCollectorOptions {
  readonly env?: NodeJS.ProcessEnv;
  readonly interval_ms?: number;
  readonly timeout_ms?: number;
  readonly run_worker?: ExecutionWorkerRunner;
}

export interface ExecutionCollectorHandle {
  /** Cache read only; never starts work. */
  readonly read: (repositoryId: string) => ExecutionRepositoryCache;
  readonly settled: () => Promise<void>;
  readonly close: () => Promise<void>;
}

/** Collect at start, then every interval after the previous cycle settles. Cycles never overlap. */
export function startExecutionCollector(options: ExecutionCollectorOptions = {}): ExecutionCollectorHandle {
  const env = { ...process.env, ...options.env };
  const run = options.run_worker ?? runExecutionWorker;
  const abort = new AbortController();
  let states = new Map<string, ExecutionRepositoryCache>();
  let registryFailed = false;
  let started = false;
  let closed = false;
  let timer: ReturnType<typeof setTimeout> | undefined;
  let inflight: Promise<void> | null = null;

  const cycle = (): Promise<void> => {
    inflight = (async () => {
      let repos;
      try { repos = readRepoHarnessRegistryStrictSnapshot({ env }).repos; }
      catch { registryFailed = true; return; }
      const record = await readNotifyInstallSession(env);
      const herdrSession = record.state === 'ok' ? record.session : null;
      const results = await run({ repos: repos.map(repo => ({ id: repo.id, path: repo.path })) },
        { env, timeout_ms: options.timeout_ms ?? EXECUTION_WORKER_TIMEOUT_MS, signal: abort.signal });
      if (closed) return;
      const next = new Map<string, ExecutionRepositoryCache>();
      repos.forEach((repo, index) => {
        const result = results?.[index];
        let cache: ExecutionRepositoryCache = { state: 'unavailable', reason: 'execution_state_unavailable' };
        if (result?.id === repo.id && result.ok) {
          try { cache = { state: 'ready', view: projectTaskExecutionView(result.snapshot, repo.id, herdrSession) }; }
          catch { /* a malformed worker result stays unavailable */ }
        }
        next.set(repo.id, cache);
      });
      states = next;
      registryFailed = false;
      started = true;
    })().catch(() => { /* every failure above is a state; keep the cache */ }).finally(() => {
      inflight = null;
      if (closed) return;
      timer = setTimeout(() => { void cycle(); }, options.interval_ms ?? EXECUTION_COLLECT_INTERVAL_MS);
      timer.unref?.();
    });
    return inflight;
  };
  void cycle();

  return Object.freeze({
    read: (repositoryId: string): ExecutionRepositoryCache => {
      if (registryFailed) return { state: 'unavailable', reason: 'registry_unavailable' };
      if (!started) return { state: 'unavailable', reason: 'execution_state_pending' };
      return states.get(repositoryId) ?? { state: 'unavailable', reason: 'repository_not_found' };
    },
    settled: () => inflight ?? Promise.resolve(),
    close: async () => {
      closed = true;
      clearTimeout(timer);
      // Aborting terminates a running worker, so a slow `ps` does not hold shutdown.
      abort.abort();
      await inflight;
    },
  });
}
