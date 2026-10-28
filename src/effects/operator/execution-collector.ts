// Background execution-state collector (PRD G2, G15). It runs only in the
// `operator serve` process on a timer; GET reads `read()` and starts no work.
//
// Each cycle reads the repository registry and the Herdr notify install record,
// then runs `collectTaskExecutionStates` for every registered repository in one
// child process, because it reads files and runs `ps` and git synchronously. The
// child is the setup collector's supervised process: it leads its own process
// group, which the deadline and close kill, so a blocked `ps` or git cannot hold
// a cycle. A repository whose read fails, or every repository of a cycle that
// fails or times out, is unavailable: a stale verified session is never shown.

import { fileURLToPath } from 'node:url';
import {
  projectTaskExecutionView,
  type ExecutionStateUnavailableReason,
  type TaskExecutionViewV1,
} from '../../core/operator/execution-state';
import { withoutRepositorySelectingGitEnv } from '../git/runner';
import { readRepoHarnessRegistryStrictSnapshot } from '../repo-registry';
import { runSetupProcess, type SetupProcessRunner } from '../setup/collector';
import { readNotifyInstallSession } from '../terminal/herdr-notify-install';
import type { ExecutionStateWorkerResult } from './execution-state-worker';

export const EXECUTION_COLLECT_INTERVAL_MS = 30_000;
export const EXECUTION_WORKER_TIMEOUT_MS = 20_000;
export const EXECUTION_CHILD_ARGV = Object.freeze([fileURLToPath(new URL('./execution-state-worker.ts', import.meta.url))] as const);
const READ_ONLY_GIT_ENVIRONMENT = { GIT_NO_LAZY_FETCH: '1', GIT_OPTIONAL_LOCKS: '0', GIT_TERMINAL_PROMPT: '0' } as const;
const UNAVAILABLE: ExecutionRepositoryCache = { state: 'unavailable', reason: 'execution_state_unavailable' };

export type ExecutionRepositoryCache =
  | { readonly state: 'ready'; readonly view: TaskExecutionViewV1 }
  | { readonly state: 'unavailable'; readonly reason: ExecutionStateUnavailableReason };

/** Each registered repository must resolve from its own path, whatever git variables the server has. */
export function executionChildEnvironment(env: NodeJS.ProcessEnv): NodeJS.ProcessEnv {
  return withoutRepositorySelectingGitEnv({ ...env, ...READ_ONLY_GIT_ENVIRONMENT });
}

function childResults(stdout: string): ReadonlyMap<string, ExecutionStateWorkerResult> {
  const value: unknown = JSON.parse(stdout);
  if (!Array.isArray(value)) throw new Error('execution child output is not a list');
  return new Map((value as ExecutionStateWorkerResult[]).map(result => [result.id, result]));
}

export interface ExecutionCollectorOptions {
  readonly env?: NodeJS.ProcessEnv;
  readonly interval_ms?: number;
  readonly timeout_ms?: number;
  readonly run_process?: SetupProcessRunner;
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
  const run = options.run_process ?? runSetupProcess;
  const abort = new AbortController();
  let states = new Map<string, ExecutionRepositoryCache>();
  let registryFailed = false;
  let started = false;
  let closed = false;
  let timer: ReturnType<typeof setTimeout> | undefined;
  let inflight: Promise<void> | null = null;

  const collect = async (repos: readonly { readonly id: string }[]): Promise<Map<string, ExecutionRepositoryCache>> => {
    const record = await readNotifyInstallSession(env);
    const herdrSession = record.state === 'ok' ? record.session : null;
    const result = await run(EXECUTION_CHILD_ARGV, {
      cwd: process.cwd(), env: executionChildEnvironment(env), service: 'execution-collector',
      timeout_ms: options.timeout_ms ?? EXECUTION_WORKER_TIMEOUT_MS, signal: abort.signal,
    });
    const results = result.ok ? childResults(result.stdout) : new Map<string, ExecutionStateWorkerResult>();
    const next = new Map<string, ExecutionRepositoryCache>();
    for (const repo of repos) {
      const entry = results.get(repo.id);
      let cache = UNAVAILABLE;
      if (entry?.ok) {
        try { cache = { state: 'ready', view: projectTaskExecutionView(entry.snapshot, repo.id, herdrSession) }; }
        catch { /* a malformed child result stays unavailable */ }
      }
      next.set(repo.id, cache);
    }
    return next;
  };

  const cycle = (): Promise<void> => {
    inflight = (async () => {
      let repos;
      try { repos = readRepoHarnessRegistryStrictSnapshot({ env }).repos; }
      catch { registryFailed = true; return; }
      let next: Map<string, ExecutionRepositoryCache>;
      try { next = await collect(repos); }
      catch { next = new Map(repos.map(repo => [repo.id, UNAVAILABLE])); }
      if (closed) return;
      states = next;
      registryFailed = false;
      started = true;
    })().finally(() => {
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
      // Aborting kills the child's process group, so a blocked `ps` or git does not hold shutdown.
      abort.abort();
      await inflight;
    },
  });
}
