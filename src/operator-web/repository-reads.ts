import { useCallback, useState } from 'react';
import { decodeDocsTree } from '../core/operator/docs';
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
 * docs tree names the commit of the default branch, and the tests route serves
 * the open CI repair issues and the latest daily test results. A refusal keeps
 * its route code.
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

export type CiRepairsResult = CiRepairsRead & { readonly repository_id: string };

/** One result per repository, in the order given; null until the first read settles. */
export function useCiRepairs(read: CiRepairsReader, repositoryIds: readonly string[], generation: number, enabled: boolean): readonly CiRepairsResult[] | null {
  const [results, setResults] = useState<{ readonly key: string; readonly rows: readonly CiRepairsResult[] } | null>(null);
  const key = repositoryIds.join('\n');
  const observe = useCallback(async (signal: AbortSignal): Promise<boolean> => {
    const ids = key === '' ? [] : key.split('\n');
    const rows = await Promise.all(ids.map(async (repository_id): Promise<CiRepairsResult> => ({ repository_id, ...await read(repository_id, signal) })));
    if (signal.aborted) return false;
    setResults({ key, rows });
    // A typed refusal is an answer; only a request with no answer backs the loop off.
    return rows.every(row => row.state === 'ok' || row.reason !== 'unreachable');
  }, [read, key]);
  useObservationRefresh(observe, JSON.stringify(['ci-repairs', key, generation]), { enabled });
  return results !== null && results.key === key ? results.rows : null;
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
