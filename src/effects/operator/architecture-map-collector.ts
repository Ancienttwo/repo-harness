// Background architecture map collector (PRD G11). It runs only in the
// `operator serve` process on a timer; GET reads `read()` and starts no work.
//
// Each cycle reads the repository registry, then runs one child process per
// registered repository, because the model export, git and archctx run
// synchronously. The child is the setup collector's supervised process: it
// leads its own process group, which the deadline and close kill. Line counts
// and import counts come from git and archctx in that child, never from the
// browser. The open PRs come from the Dev Activity cache in this process and
// reach the child in a private temporary file, because the child resolves
// their owners with archctx. The tests layer comes from the tests collector's
// cache in this process, read when the child's map arrives. A repository whose child fails keeps no older map: the map always
// names the commit it describes.

import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';

import {
  ARCHITECTURE_MAP_WORKER_REASONS,
  archctxRefusal,
  decodeArchitectureMap,
  withTestCoverage,
  type ArchitectureMapUnavailableV1,
  type ArchitectureMapUnavailableReason,
  type ArchitectureMapV1,
  type ArchitectureMapWorkerReason,
  type ArchitecturePullRequestsSource,
  type ArchitectureTestsSource,
} from '../../core/operator/architecture-map';
import { readRepoHarnessRegistryStrictSnapshot } from '../repo-registry';
import { PROCESS_GROUP_CALL_TIMEOUT_OVERHEAD_MS } from '../process-runner';
import { runSetupProcess, type SetupProcessRunner } from '../setup/collector';
import { executionChildEnvironment } from './execution-collector';
import { keepObservation, readRepository, startObservationLoop, type RepositoryObservation } from '../observation-loop';
import { ARCHITECTURE_MAP_PR_BUDGET_MS } from './architecture-map-worker';

/** The model changes with commits; a cycle costs about 5 s of archctx and git per repository. */
export const ARCHITECTURE_MAP_COLLECT_INTERVAL_MS = 5 * 60_000;
// Keep the other reads' 120 s allowance when the PR layer spends its full
// budget, including the provider's process-group termination backstop.
export const ARCHITECTURE_MAP_WORKER_TIMEOUT_MS = 120_000 + ARCHITECTURE_MAP_PR_BUDGET_MS + PROCESS_GROUP_CALL_TIMEOUT_OVERHEAD_MS;
export const ARCHITECTURE_MAP_CHILD_ENTRY = fileURLToPath(new URL('./architecture-map-worker.ts', import.meta.url));

export type ArchitectureMapRepositoryCache =
  | { readonly state: 'ready'; readonly map: ArchitectureMapV1 }
  | ArchitectureMapUnavailableV1;

export interface ArchitectureMapCollectorOptions {
  readonly env?: NodeJS.ProcessEnv;
  readonly interval_ms?: number;
  readonly timeout_ms?: number;
  readonly run_process?: SetupProcessRunner;
  /** The open PRs from the Dev Activity cache; without it the PR impact layer stays `dev_activity_pending`. */
  readonly read_pull_requests?: (repositoryId: string) => ArchitecturePullRequestsSource;
  /**
   * The first cycle starts when this settles: `operator serve` passes the Dev Activity
   * collector's first cycle, so the first map does not read the PR source while it is still pending.
   */
  readonly first_cycle_after?: Promise<void>;
  /** The tests collector's cache read; without it the tests layer stays `tests_pending`. */
  readonly read_tests?: (repositoryId: string) => ArchitectureTestsSource;
}

export interface ArchitectureMapCollectorHandle {
  /** Cache read only; never starts work. */
  readonly read: (repositoryId: string) => ArchitectureMapRepositoryCache;
  readonly settled: () => Promise<void>;
  readonly close: () => Promise<void>;
}

const INVALID = { state: 'unavailable', reason: 'architecture_map_invalid' } as const;

/** The child's failure: one of its own reasons, or archctx's codes with the archctx shape. */
function childFailure(record: Record<string, unknown>): ArchitectureMapUnavailableV1 {
  if (record.reason === 'archctx_error') return archctxRefusal(record.code, record.reason_code) ?? INVALID;
  return (ARCHITECTURE_MAP_WORKER_REASONS as readonly unknown[]).includes(record.reason)
    ? { state: 'unavailable', reason: record.reason as ArchitectureMapWorkerReason }
    : INVALID;
}

/** The child's one result line, checked against the repository it was asked for. */
function childResult(stdout: string, repositoryId: string, tests: (repositoryId: string) => ArchitectureTestsSource): ArchitectureMapRepositoryCache {
  let value: unknown;
  try { value = JSON.parse(stdout); } catch { return INVALID; }
  const record = value !== null && typeof value === 'object' && !Array.isArray(value) ? value as Record<string, unknown> : null;
  if (record?.id !== repositoryId) return INVALID;
  if (record.ok === false) return childFailure(record);
  try {
    const map = decodeArchitectureMap(record.snapshot);
    return map.repository_id === repositoryId ? { state: 'ready', map: withTestCoverage(map, tests(repositoryId)) } : INVALID;
  } catch {
    return INVALID;
  }
}

/**
 * Collect at start, or once `first_cycle_after` settles, then every interval after the previous cycle settles.
 * Cycles never overlap. A repository is published when its child returns, not when the cycle ends.
 * Keep rule: a repository whose child fails keeps no older map, because the map always names the commit it
 * describes. A cycle that throws keeps the last cache.
 */
export function startArchitectureMapCollector(options: ArchitectureMapCollectorOptions = {}): ArchitectureMapCollectorHandle {
  const env = { ...process.env, ...options.env };
  const run = options.run_process ?? runSetupProcess;
  const tests = options.read_tests ?? (() => ({ state: 'unavailable', reason: 'tests_pending' } as const));

  const collect = async (repositoryId: string, signal: AbortSignal): Promise<ArchitectureMapRepositoryCache> => {
    const pullRequests = options.read_pull_requests?.(repositoryId) ?? { state: 'unavailable', reason: 'dev_activity_pending' };
    const dir = mkdtempSync(join(tmpdir(), 'repo-harness-architecture-prs-'));
    const file = join(dir, 'pull-requests.json');
    let result: Awaited<ReturnType<SetupProcessRunner>>;
    try {
      writeFileSync(file, JSON.stringify(pullRequests), { mode: 0o600 });
      result = await run([ARCHITECTURE_MAP_CHILD_ENTRY, repositoryId, file], {
        cwd: process.cwd(), env: executionChildEnvironment(env), service: 'architecture-map-collector',
        timeout_ms: options.timeout_ms ?? ARCHITECTURE_MAP_WORKER_TIMEOUT_MS, signal,
      });
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
    if (!result.ok) return { state: 'unavailable', reason: result.code === 'timeout' ? 'architecture_map_timeout' : 'architecture_map_process_failed' };
    return childResult(result.stdout, repositoryId, tests);
  };

  const loop = startObservationLoop<RepositoryObservation<ArchitectureMapRepositoryCache>, ArchitectureMapUnavailableReason>({
    cycle: async ({ signal, publish }) => {
      let repos: readonly { readonly id: string }[];
      try { repos = readRepoHarnessRegistryStrictSnapshot({ env }).repos; }
      catch { return { state: 'observed', value: { registry: 'failed' } }; }
      const next = new Map<string, ArchitectureMapRepositoryCache>();
      // One repository at a time: each child runs archctx and git over the whole tree.
      for (const repo of repos) {
        if (signal.aborted) return { state: 'unavailable', reason: 'architecture_map_process_failed' };
        const cache = await collect(repo.id, signal)
          .catch((): ArchitectureMapRepositoryCache => ({ state: 'unavailable', reason: 'architecture_map_process_failed' }));
        if (signal.aborted) return { state: 'unavailable', reason: 'architecture_map_process_failed' };
        next.set(repo.id, cache);
        // A repository is served when its child returns, not when the cycle ends.
        publish({ registry: 'ok', repositories: new Map(next), complete: false });
      }
      return { state: 'observed', value: { registry: 'ok', repositories: next, complete: true } };
    },
    keep: keepObservation,
    failure: 'architecture_map_process_failed',
    interval_ms: options.interval_ms ?? ARCHITECTURE_MAP_COLLECT_INTERVAL_MS,
    first_cycle_after: options.first_cycle_after,
  });
  return Object.freeze({
    read: (repositoryId: string): ArchitectureMapRepositoryCache => {
      const read = readRepository(loop.read(), repositoryId, 'architecture_map_pending');
      return 'value' in read ? read.value : { state: 'unavailable', reason: read.reason };
    },
    settled: loop.settled,
    // Aborting kills the running child's process group, so a blocked archctx or git does not hold shutdown.
    close: loop.close,
  });
}
