import { useCallback, useState } from 'react';
import type { DevActivityItem } from '../core/dev-activity/types';
import { decodeDocsTree } from '../core/operator/docs';
import {
  decodeTaskExecutionView,
  type ExecutionStateUnavailableReason,
  type TaskExecutionViewEntry,
  type TaskExecutionViewV1,
} from '../core/operator/execution-state';
import {
  decodeTestsSnapshot,
  TESTS_UNAVAILABLE_REASONS,
  type TestsSnapshotV1,
  type TestsUnavailableReason,
} from '../core/operator/tests';
import { asApiError } from './fleet-api';
import { useObservationRefresh } from './useObservationRefresh';

/**
 * Per-repository GET reads outside the Fleet and Dev Activity snapshots: the
 * docs tree names the commit of the default branch, the tests route serves the
 * open CI repair issues and the latest daily test results, and the execution
 * route serves the verified task sessions. A refusal keeps its route code.
 */
export type RepositoryHeadReader = (repositoryId: string, signal: AbortSignal) => Promise<string>;

export async function fetchRepositoryHead(repositoryId: string, signal: AbortSignal): Promise<string> {
  const response = await fetch(`/api/v1/repositories/${encodeURIComponent(repositoryId)}/docs/tree`, { signal, cache: 'no-store', headers: { Accept: 'application/json' } });
  if (!response.ok) throw new Error('docs_tree_unavailable');
  return decodeDocsTree(await response.json()).commit;
}

/** The default-branch commit of one repository, or null while unread or refused. */
export function useRepositoryHead(read: RepositoryHeadReader, repositoryId: string | null, generation: number): string | null {
  const [head, setHead] = useState<{ readonly id: string; readonly commit: string } | null>(null);
  const observe = useCallback(async (signal: AbortSignal): Promise<boolean> => {
    if (repositoryId === null) return false;
    try {
      const commit = await read(repositoryId, signal);
      if (signal.aborted) return false;
      setHead({ id: repositoryId, commit });
      return true;
    } catch {
      if (signal.aborted) return false;
      setHead(null);
      return false;
    }
  }, [read, repositoryId]);
  useObservationRefresh(observe, JSON.stringify(['repository-head', repositoryId, generation]), { enabled: repositoryId !== null });
  return head !== null && head.id === repositoryId ? head.commit : null;
}

/** `unreachable` covers a request with no typed answer: no response, or a code this bundle does not know. */
export type CiRepairsReason = TestsUnavailableReason | 'repairs_unavailable' | 'unreachable';
export interface CiRepairIssue { readonly number: number; readonly title: string; readonly url: string }
export type CiRepairsRead =
  | { readonly state: 'ok'; readonly issues: readonly CiRepairIssue[] }
  | { readonly state: 'unavailable'; readonly reason: CiRepairsReason };
export type CiRepairsReader = (repositoryId: string, signal: AbortSignal) => Promise<CiRepairsRead>;

function testsReason(code: string): TestsUnavailableReason | 'unreachable' {
  return (TESTS_UNAVAILABLE_REASONS as readonly string[]).includes(code) ? code as TestsUnavailableReason : 'unreachable';
}

export async function fetchCiRepairs(repositoryId: string, signal: AbortSignal): Promise<CiRepairsRead> {
  let response: Response;
  try {
    response = await fetch(`/api/v1/repositories/${encodeURIComponent(repositoryId)}/tests`, { signal, cache: 'no-store', headers: { Accept: 'application/json' } });
  } catch (error) {
    if (signal.aborted) throw error;
    return { state: 'unavailable', reason: 'unreachable' };
  }
  const body: unknown = await response.json().catch(() => null);
  if (!response.ok) return { state: 'unavailable', reason: testsReason(asApiError(body).code) };
  let repairs;
  try { repairs = decodeTestsSnapshot(body).repairs; } catch { return { state: 'unavailable', reason: 'tests_invalid' }; }
  return repairs.state === 'ok' ? { state: 'ok', issues: repairs.issues } : { state: 'unavailable', reason: repairs.reason };
}

type RepositoryRead = { readonly state: 'ok' } | { readonly state: 'unavailable'; readonly reason: string };
type PerRepository<R> = R & { readonly repository_id: string };

/** One result per repository, in the order given; null until the first read settles. */
function useRepositoryReads<R extends RepositoryRead>(
  name: string, read: (repositoryId: string, signal: AbortSignal) => Promise<R>, repositoryIds: readonly string[], generation: number, enabled: boolean,
): readonly PerRepository<R>[] | null {
  const [results, setResults] = useState<{ readonly key: string; readonly rows: readonly PerRepository<R>[] } | null>(null);
  const key = repositoryIds.join('\n');
  const observe = useCallback(async (signal: AbortSignal): Promise<boolean> => {
    const ids = key === '' ? [] : key.split('\n');
    const rows = await Promise.all(ids.map(async (repository_id): Promise<PerRepository<R>> => ({ repository_id, ...await read(repository_id, signal) })));
    if (signal.aborted) return false;
    setResults({ key, rows });
    // A typed refusal is an answer; only a request with no answer backs the loop off.
    return rows.every((row: RepositoryRead) => row.state === 'ok' || row.reason !== 'unreachable');
  }, [read, key]);
  useObservationRefresh(observe, JSON.stringify([name, key, generation]), { enabled });
  return results !== null && results.key === key ? results.rows : null;
}

export type CiRepairsResult = PerRepository<CiRepairsRead>;

export function useCiRepairs(read: CiRepairsReader, repositoryIds: readonly string[], generation: number, enabled: boolean): readonly CiRepairsResult[] | null {
  return useRepositoryReads('ci-repairs', read, repositoryIds, generation, enabled);
}

/** `unreachable` covers a request with no typed answer: no response, or a code this bundle does not know. */
export type ExecutionReason = ExecutionStateUnavailableReason | 'execution_state_invalid' | 'unreachable';
export type ExecutionRead =
  | { readonly state: 'ok'; readonly view: TaskExecutionViewV1 }
  | { readonly state: 'unavailable'; readonly reason: ExecutionReason };
export type ExecutionReader = (repositoryId: string, signal: AbortSignal) => Promise<ExecutionRead>;
export type ExecutionResult = PerRepository<ExecutionRead>;

// Every refusal the execution route sends; the record keeps this list complete against the route's reason type.
const EXECUTION_REASONS: Readonly<Record<Exclude<ExecutionReason, 'unreachable'>, true>> = {
  execution_state_pending: true, registry_unavailable: true, repository_not_found: true, execution_state_unavailable: true, execution_state_invalid: true,
};

export async function fetchExecution(repositoryId: string, signal: AbortSignal): Promise<ExecutionRead> {
  let response: Response;
  try {
    response = await fetch(`/api/v1/repositories/${encodeURIComponent(repositoryId)}/execution`, { signal, cache: 'no-store', headers: { Accept: 'application/json' } });
  } catch (error) {
    if (signal.aborted) throw error;
    return { state: 'unavailable', reason: 'unreachable' };
  }
  const body: unknown = await response.json().catch(() => null);
  if (!response.ok) {
    const { code } = asApiError(body);
    return { state: 'unavailable', reason: Object.hasOwn(EXECUTION_REASONS, code) ? code as ExecutionReason : 'unreachable' };
  }
  try { return { state: 'ok', view: decodeTaskExecutionView(body) }; } catch { return { state: 'unavailable', reason: 'execution_state_invalid' }; }
}

export function useExecutions(read: ExecutionReader, repositoryIds: readonly string[], generation: number, enabled: boolean): readonly ExecutionResult[] | null {
  return useRepositoryReads('execution', read, repositoryIds, generation, enabled);
}

export type VerifiedTask = Extract<TaskExecutionViewEntry, { readonly state: 'verified' }>;
export type ItemOwner =
  | { readonly state: 'reading' }
  | { readonly state: 'unavailable'; readonly reason: ExecutionReason }
  | { readonly state: 'none' }
  | { readonly state: 'verified'; readonly tasks: readonly VerifiedTask[] };

/**
 * The verified sessions of one board item: same repository, admitted on the
 * item's branch. Agent identity comes from nothing else (G2); a session left
 * out of the view or never admitted matches no item.
 */
export function itemOwner(executions: readonly ExecutionResult[] | null, item: Pick<DevActivityItem, 'repository_id' | 'branch'>): ItemOwner {
  const read = executions?.find(row => row.repository_id === item.repository_id);
  if (read === undefined) return { state: 'reading' };
  if (read.state === 'unavailable') return { state: 'unavailable', reason: read.reason };
  const tasks = read.view.tasks.filter((task): task is VerifiedTask => task.state === 'verified' && task.branch === item.branch);
  return tasks.length > 0 ? { state: 'verified', tasks } : { state: 'none' };
}

/** The tests page's read of one repository: a decoded snapshot or its route refusal. */
export type TestsRead =
  | { readonly state: 'ok'; readonly snapshot: TestsSnapshotV1 }
  | { readonly state: 'unavailable'; readonly reason: TestsUnavailableReason | 'unreachable' };

export type TestsReader = (repositoryId: string, signal: AbortSignal) => Promise<TestsRead>;

/** One repository's tests read: a decoded snapshot, or a refusal whose code the browser knows; anything else is `unreachable`. */
export async function fetchTestsSnapshot(repositoryId: string, signal: AbortSignal): Promise<TestsRead> {
  let response: Response;
  try {
    response = await fetch(`/api/v1/repositories/${encodeURIComponent(repositoryId)}/tests`, { signal, cache: 'no-store', headers: { Accept: 'application/json' } });
  } catch (error) {
    if (signal.aborted) throw error;
    return { state: 'unavailable', reason: 'unreachable' };
  }
  const body: unknown = await response.json().catch(() => null);
  if (!response.ok) return { state: 'unavailable', reason: testsReason(asApiError(body).code) };
  try { return { state: 'ok', snapshot: decodeTestsSnapshot(body) }; } catch { return { state: 'unavailable', reason: 'tests_invalid' }; }
}

/** One read per repository; null until the read of the selected repository settles. */
export function useTestsSnapshot(read: TestsReader, repositoryId: string | null, generation: number, enabled: boolean): TestsRead | null {
  const [state, setState] = useState<{ readonly id: string; readonly read: TestsRead } | null>(null);
  const observe = useCallback(async (signal: AbortSignal): Promise<boolean> => {
    if (repositoryId === null) return false;
    const result = await read(repositoryId, signal);
    if (signal.aborted) return false;
    setState({ id: repositoryId, read: result });
    // A typed refusal is an answer; only a request with no answer backs the loop off.
    return result.state === 'ok' || result.reason !== 'unreachable';
  }, [read, repositoryId]);
  useObservationRefresh(observe, JSON.stringify(['tests-snapshot', repositoryId, generation]), { enabled });
  return state !== null && state.id === repositoryId ? state.read : null;
}
