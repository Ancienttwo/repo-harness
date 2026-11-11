import { useCallback, useState } from 'react';
import { decodeOperatorRepositories, OperatorRepositoriesInvalidError, type OperatorRepositoriesV1, type OperatorRepositoryV1 } from '../core/operator/repositories';
import { asApiError, type OperatorApiErrorV1 } from './operator-api-error';
import { answered, useObservationRefresh } from './useObservationRefresh';

/**
 * The registered repositories from `GET /api/v1/repositories`: the one list
 * behind the repository switcher, the single-repository pages, the board parent list
 * and the Repositories page. It does not depend on Dev Activity.
 */
export type RepositoriesReader = (signal: AbortSignal) => Promise<OperatorRepositoriesV1 | RepositoriesRefusal>;
/** The route's typed refusal. A request with no typed answer rejects instead. */
export interface RepositoriesRefusal { readonly state: 'unavailable'; readonly reason: string }

const UNTYPED: OperatorApiErrorV1 = Object.freeze({ code: '', message: '', next_action: '' });

export async function fetchRepositories(signal: AbortSignal): Promise<OperatorRepositoriesV1 | RepositoriesRefusal> {
  const response = await fetch('/api/v1/repositories', { signal, cache: 'no-store', headers: { Accept: 'application/json' } });
  const body: unknown = await response.json().catch(() => null);
  if (!response.ok) {
    const refusal = asApiError(body, UNTYPED);
    if (refusal === UNTYPED) throw new Error(asApiError(body).code);
    return { state: 'unavailable', reason: refusal.code };
  }
  return decodeOperatorRepositories(body);
}

export type RepositoriesView =
  | { readonly kind: 'loading' }
  | { readonly kind: 'ready'; readonly list: OperatorRepositoriesV1; readonly refreshFailed: boolean }
  | { readonly kind: 'failed' };

export function useRepositories(read: RepositoriesReader, initial: OperatorRepositoriesV1 | undefined, generation: number): RepositoriesView {
  const [view, setView] = useState<RepositoriesView>(() => initial ? { kind: 'ready', list: initial, refreshFailed: false } : { kind: 'loading' });
  const observe = useCallback(async (signal: AbortSignal): Promise<boolean> => {
    try {
      const result = await read(signal);
      if (signal.aborted) return false;
      if ('state' in result) {
        setView(current => current.kind === 'ready' ? { ...current, refreshFailed: true } : { kind: 'failed' });
        return answered(result);
      }
      setView({ kind: 'ready', list: result, refreshFailed: false });
      return true;
    } catch (error) {
      if (signal.aborted) return false;
      // A transport or registry failure keeps the last list, marked; an answer that fails the decoder drops it.
      setView(current => current.kind === 'ready' && !(error instanceof OperatorRepositoriesInvalidError)
        ? { ...current, refreshFailed: true } : { kind: 'failed' });
      return false;
    }
  }, [read]);
  useObservationRefresh(observe, JSON.stringify(['repositories', generation]), { immediate: initial === undefined || generation > 0 });
  return view;
}

export function repositoriesOf(view: RepositoriesView): readonly OperatorRepositoryV1[] {
  return view.kind === 'ready' ? view.list.repositories : [];
}

/** The display name is the label; two registrations with one name are told apart by their registry id. */
export function registeredLabel(repositories: readonly OperatorRepositoryV1[], id: string): string {
  const repository = repositories.find(row => row.repository_id === id);
  if (!repository) return id;
  return repositories.filter(row => row.display_name === repository.display_name).length > 1
    ? `${repository.display_name} · ${repository.repository_id}` : repository.display_name;
}
